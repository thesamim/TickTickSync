import TickTickSync from '@/main';
import { Tick } from '@/api';
import { getProjects, getSettings, getTasks, updateSettings } from '@/settings';
import { doWithLock } from '@/utils/locks';
import { SyncMan } from '@/services/syncModule';
import { Editor, type MarkdownFileInfo, type MarkdownView, Notice, TFile } from 'obsidian';
import { CacheOperation } from '@/services/cacheOperation';
import { FileOperation } from '@/fileOperation';
import { FileMap } from '@/services/fileMap';
//Logging
import log from '@/utils/logger';
import { getTick } from '@/api/tick_singleton_factory'
import type { IProject } from '@/api/types/Project';
import { Platform } from 'obsidian';
import { Device } from '@capacitor/device';
import ObjectID from 'bson-objectid';

const LOCK_TASKS = 'LOCK_TASKS';
// Prefix marker stored in the control task `desc`
const PAYLOAD_PREFIX = 'TTS-PAYLOAD:';

type TaskOp = 'create' | 'update' | 'delete' | 'move';

type TaskOpEntry = {
  op: TaskOp;
  ts: string; // ISO UTC
  deviceId: string;
  deviceName?: string;
  projectId?: string;
  filePath?: string;
  status?: number;
};

type ControlPayloadV1 = {
  version: 1;
  lastWriteTs?: string;
  devices: Record<string, { name: string; lastSeenTs: string }>;
  lastSyncByDevice: Record<string, string>;
  tasks: Record<string, TaskOpEntry>;
};


//TODO: encapsulate all api and cache
export class TickTickService {
	initialized: boolean = false;
	plugin: TickTickSync;
	tickTickSync!: SyncMan;
	api?: Tick;
 cacheOperation!: CacheOperation;
 fileOperation?: FileOperation;

 // Control payload working context for current sync
 private controlPayloadCtx?: {
     taskId: string;
     listId: string;
     payload: ControlPayloadV1;
 };

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

 initialize(): boolean {
		try {
			const token = getSettings().token;
			if (!token) {
				log.debug('Please login from settings.');
    return false;
    }
			if (getSettings().inboxID.length === 0) {
				log.warn('Something is wrong with your inbox ID.');
				//TODO re login or ask user?
			}

			this.api = getTick({
				baseUrl: getSettings().baseURL,
				token: token,
				checkPoint: getSettings().checkPoint
			});
			//initialize data read and write object
			this.cacheOperation = new CacheOperation(this.plugin.app, this.plugin);
			//initialize file operation
			this.fileOperation = new FileOperation(this.plugin.app, this.plugin);
			this.tickTickSync = new SyncMan(this.plugin.app, this.plugin);
			this.initialized = true;
			return true;
		} catch (error) {
			log.error('Error on initialization: ', error);
		}
		return false;
	}

	backup() {
		this.tickTickSync?.backupTickTickAllResources();
	}

	//MB can be static
	async login(baseUrl: string, username: string, password: string):
		Promise<{ inboxId: string; token: string } | null> {
		try {
			const api = getTick({
				username: username,
				password: password,
				baseUrl: baseUrl,
				token: '',
				checkPoint: 0
			});
			//try login
			const result = await api.login();
			let error: { operation: string, statusCode: string, errorMessage: string };
			if (!result) {
				error = api.lastError;
				const errorString = 'Login Failed. ' + JSON.stringify(error.errorMessage, null, 4);
				new Notice(errorString, 5000);
				log.error("Login Fail!: ", errorString);
				throw new Error(error.errorMessage);
			}
			const defaultProjectId = getSettings().defaultProjectId;
			const defaultProjectName = getSettings().defaultProjectName;
			if (!defaultProjectId || defaultProjectId == '' || (defaultProjectName == "Inbox" && (defaultProjectId != result.inboxId))) {
				//no default project id or blank default project id or (default project is inbox, but the ID is different.
				updateSettings({defaultProjectId: result.inboxId});
			}
			//reset the checkpoint so next time they get ALL the tasks.
			updateSettings({checkPoint: 0});
			await this.plugin.saveSettings();
			return result;
		} catch (error) {
			log.error('Error on login: ', error);
		}
		return null;
	}

 async synchronization() {
        try {
            // Control task gating: ensure control task exists and check state before syncing
            try {
                const paused = await this.isControlTaskPaused();
                if (paused) {
                    new Notice('TickTickSync: Sync paused by control task. Mark it as open to resume.');
                    log.info('Synchronization skipped: paused by control task.');
                    return;
                }
            } catch (e) {
                log.warn('Control task check failed, continuing with sync.', e);
            }

            // Load control payload session (best-effort)
            try {
                await this.startPayloadSession();
            } catch (e) {
                log.warn('Failed to start control payload session; proceeding in degraded mode.', e);
            }

            const bChanged = await doWithLock(LOCK_TASKS, async () => {
                return await this.syncTickTickToObsidian();
            });
            if (bChanged) {
                //the file system is farckled. Wait until next sync to avoid race conditions.
                return;
            }
            await this.syncFiles(false);
        } catch (error) {
            log.error('Error on synchronization: ', error);
        }
        finally {
            // Save control payload once at end (best-effort)
            try {
                await this.finishPayloadSession();
            } catch (e) {
                log.warn('Failed to persist control payload.', e);
            }
        }
    }

	/**
	 * Ensure the control list and task exist, and persist the trackingTaskId in the JsonDB.
	 * Returns the ensured taskId and listId, or null on failure.
	 */
 async ensureControlListAndTask(): Promise<{ taskId: string; listId: string } | null> {
		try {
			if (!this.api) {
				return null;
   }
			const settings = getSettings();
			const desiredTaskName = settings.trackingTaskName && settings.trackingTaskName.trim().length > 0
				? settings.trackingTaskName.trim()
				: 'Obsidian Tracking';

			// Determine list id
			let listId = settings.trackingListId;
			let projects: IProject[] = await this.api.getProjects() ?? [];
			let listExists = listId && projects.some(p => p.id === listId);
			if (!listExists) {
				// Try to create dedicated list (best-effort; API may not be implemented)
				try {
					if (!settings.trackingListName || settings.trackingListName.trim().length === 0) {
						settings.trackingListName = 'TickTickSyncList';
					}
					const created = await this.api.addProject(settings.trackingListName)
					if (created && created.id) {
						listId = created.id;
						projects = await this.api.getProjects() ?? projects;
					} else {
						throw new Error('Project creation failed');
					}
				} catch (e) {
					// Fallback to Inbox and Notice the user
					listId = settings.inboxID;
					new Notice('TickTickSync: Failed to create control list; falling back to Inbox.');
				}
				// Persist selected list id in settings
				if (listId && listId !== settings.trackingListId) {
					updateSettings({ trackingListId: listId });
					await this.plugin.saveSettings();
				}
			}

			// Ensure task exists
			let taskId = this.plugin.db.getTrackingTaskId();
			if (taskId) {
				const existing = await this.api.getTask(taskId, listId);
				if (!existing) {
					// Try to re-locate by name within the chosen list
					const all = await this.api.getTaskDetails();
					const found = all?.update?.find((t: any) => t.title === desiredTaskName && t.projectId === listId);
					if (found) {
						taskId = found.id;
						this.plugin.db.setTrackingTaskId(taskId);
					} else {
						const created = await this.api.addTask({ title: desiredTaskName, projectId: listId });
						if (created && created.id) {
							taskId = created.id;
							this.plugin.db.setTrackingTaskId(taskId);
						} else {
							return null;
						}
					}
				} else {
					// Ensure settings reflect actual list if moved
					if (existing?.projectId && existing.projectId !== listId) {
						listId = existing.projectId;
						updateSettings({ trackingListId: listId });
						await this.plugin.saveSettings();
					}
				}
			} else {
				// No cached id: locate by name or create
				const all = await this.api.getTaskDetails();
				const found = all?.update?.find((t: any) => t.title === desiredTaskName && t.projectId === listId);
				if (found) {
					taskId = found.id;
					this.plugin.db.setTrackingTaskId(taskId);
				} else {
					const created = await this.api.addTask({ title: desiredTaskName, projectId: listId });
					if (created && created.id) {
						taskId = created.id;
						this.plugin.db.setTrackingTaskId(taskId);
					} else {
						return null;
					}
				}
			}

			return taskId && listId ? { taskId, listId } : null;
		} catch (e) {
			log.error('ensureControlListAndTask failed', e);
			return null;
		}
	}

	/**
	 * Returns true if synchronization should be paused by control task (completed), false otherwise.
	 */
 async isControlTaskPaused(): Promise<boolean> {
		if (!this.api) return false;
		const ensured = await this.ensureControlListAndTask();
		if (!ensured) return false; // best-effort: don't block if ensure failed
		const task = await this.api.getTask(ensured.taskId, ensured.listId);
		if (!task) return false;
		// status 0 = open (sync enabled), non-zero = completed (pause)
		return task.status !== 0;
 }

 async saveProjectsToCache(): Promise<boolean> {
        const projects = await this.api?.getProjects();
        if (!projects) {
            return false;
        }
        return this.cacheOperation.saveProjectsToCache(projects);
    }

    // ---- Control payload session context ----
    private controlPayloadCtx?: { taskId: string; listId: string; payload: ControlPayloadV1 };

    private parsePayloadFromDesc(desc?: string | null): ControlPayloadV1 {
        const empty: ControlPayloadV1 = { version: 1, devices: {}, lastSyncByDevice: {}, tasks: {} };
        if (!desc) return empty;
        const idx = desc.indexOf(PAYLOAD_PREFIX);
        if (idx < 0) return empty;
        const jsonText = desc.substring(idx + PAYLOAD_PREFIX.length).trim();
        try {
            const data = JSON.parse(jsonText);
            if (!data || typeof data !== 'object') return empty;
            return {
                version: 1,
                lastWriteTs: typeof data.lastWriteTs === 'string' ? data.lastWriteTs : undefined,
                devices: data.devices && typeof data.devices === 'object' ? data.devices : {},
                lastSyncByDevice: data.lastSyncByDevice && typeof data.lastSyncByDevice === 'object' ? data.lastSyncByDevice : {},
                tasks: data.tasks && typeof data.tasks === 'object' ? data.tasks : {}
            } as ControlPayloadV1;
        } catch (e) {
            log.warn('Failed to parse control payload; using empty.', e);
            return empty;
        }
    }

    private serializePayload(_payload: ControlPayloadV1): string {
        const payload = { ..._payload };
        payload.lastWriteTs = new Date().toISOString();
        const json = JSON.stringify(payload);
        return `${PAYLOAD_PREFIX}${json}`;
    }

    private async getDeviceIdentity(): Promise<{ deviceId: string; deviceName: string }> {
        const preferred = getSettings().preferredDeviceId?.trim();
        let deviceId = preferred && preferred.length > 0 ? preferred : (this.plugin.db.getDeviceId() || new ObjectID().toHexString());
        if (!this.plugin.db.getDeviceId()) this.plugin.db.setDeviceId(deviceId);

        let deviceName = getSettings().deviceNameOverride?.trim();
        if (!deviceName || deviceName.length === 0) {
            try {
                if (Platform.isMobileApp) {
                    const info = await Device.getInfo();
                    deviceName = info?.name || '';
                } else {
                    const _os = require('os');
                    deviceName = _os?.hostname?.() || '';
                }
            } catch (_) {
                // ignore
            }
        }
        if (!deviceName || deviceName.length === 0) {
            deviceName = this.plugin.db.getDeviceName() || 'Unknown Device';
        }
        this.plugin.db.setDeviceName(deviceName);
        return { deviceId, deviceName };
    }

    private async startPayloadSession(): Promise<void> {
        try {
            if (!this.api) return;
            const ensured = await this.ensureControlListAndTask();
            if (!ensured) return;
            const task = await this.api.getTask(ensured.taskId, ensured.listId);
            const payload = this.parsePayloadFromDesc(task?.desc);
            const { deviceId, deviceName } = await this.getDeviceIdentity();
            const nowIso = new Date().toISOString();
            payload.devices[deviceId] = { name: deviceName, lastSeenTs: nowIso };
            payload.lastSyncByDevice[deviceId] = nowIso;
            this.controlPayloadCtx = { taskId: ensured.taskId, listId: ensured.listId, payload };
        } catch (e) {
            log.warn('Failed to start payload session', e);
        }
    }

    private prunePayload(payload: ControlPayloadV1): ControlPayloadV1 {
        try {
            // Track only tasks represented in the vault (JsonDB fileMetadata)
            const meta = this.plugin.db.getFileMetadata() as any;
            const trackedIds = new Set<string>();
            if (meta) {
                for (const fp of Object.keys(meta)) {
                    const items = meta[fp]?.TickTickTasks ?? [];
                    for (const it of items) {
                        if (it?.taskId) trackedIds.add(it.taskId);
                    }
                }
            }
            const newTasks: Record<string, TaskOpEntry> = {};
            for (const [tid, op] of Object.entries(payload.tasks)) {
                if (trackedIds.has(tid)) newTasks[tid] = op;
            }
            return { ...payload, tasks: newTasks };
        } catch (e) {
            log.warn('Failed to prune payload; returning original.', e);
            return payload;
        }
    }

    private async finishPayloadSession(): Promise<void> {
        if (!this.api || !this.controlPayloadCtx) return;
        const ctx = this.controlPayloadCtx;
        try {
            const pruned = this.prunePayload(ctx.payload);
            const desc = this.serializePayload(pruned);
            await this.api.updateTask({ id: ctx.taskId, projectId: ctx.listId, desc });
            this.plugin.db.setLastPayloadWriteTs(Date.now());
            this.plugin.db.setLastPayloadHash(`${desc.length}`);
        } catch (e) {
            log.warn('Failed to persist control payload.', e);
        } finally {
            this.controlPayloadCtx = undefined;
        }
    }

    // Hook for future: record per-task operation; currently unused until deeper integration
    private logOperation(taskId: string, entry: TaskOpEntry): void {
        if (!this.controlPayloadCtx) return;
        const existing = this.controlPayloadCtx.payload.tasks[taskId];
        if (!existing) {
            this.controlPayloadCtx.payload.tasks[taskId] = entry;
            return;
        }
        // Newest wins (equal-ts handling will be addressed when merging remote/local ops)
        if (new Date(entry.ts).getTime() > new Date(existing.ts).getTime()) {
            this.controlPayloadCtx.payload.tasks[taskId] = entry;
        }
    }

    /**
     * Public helper to record an operation into the in-memory control payload for this sync.
     * No-ops when payload session is not active.
     */
    public async recordOperation(
        taskId: string,
        op: TaskOp,
        extras?: { projectId?: string; filePath?: string; status?: number; ts?: string }
    ): Promise<void> {
        if (!this.controlPayloadCtx) return;
        try {
            const { deviceId, deviceName } = await this.getDeviceIdentity();
            const ts = extras?.ts || new Date().toISOString();
            const entry: TaskOpEntry = {
                op,
                ts,
                deviceId,
                deviceName,
                projectId: extras?.projectId,
                filePath: extras?.filePath,
                status: typeof extras?.status === 'number' ? extras.status : undefined
            };
            this.logOperation(taskId, entry);
        } catch (e) {
            log.warn('recordOperation failed', e);
        }
    }

    /** Get the last recorded payload entry for a task within the current payload session (if any). */
    public getPayloadEntry(taskId: string): TaskOpEntry | undefined {
        return this.controlPayloadCtx?.payload?.tasks?.[taskId];
    }

    /**
     * Decision helper for future conflict resolution. For now, conservatively returns true
     * to allow the operation, but can be extended with rules (newest-wins, grace window, etc.).
     */
    public shouldApplyOperation(
        taskId: string,
        incomingOp: TaskOp,
        incomingTs: string,
        source: 'remote' | 'local'
    ): boolean {
        const existing = this.getPayloadEntry(taskId);
        const debug = getSettings().debugMode;
        const dbg = (msg: string, data?: any) => {
            if (debug) {
                try { log.debug(`[shouldApplyOperation] ${msg}`, data ?? ''); } catch {}
            }
        };
        if (!existing) {
            dbg(`allow (no existing)`, { taskId, incomingOp, incomingTs, source });
            return true;
        }

        const inc = new Date(incomingTs).getTime();
        const cur = new Date(existing.ts).getTime();

        // Newest-wins baseline
        if (inc > cur) {
            dbg(`allow (newer)`, { taskId, existing, incomingOp, incomingTs, source });
            return true;
        }
        if (inc < cur) {
            dbg(`deny (older)`, { taskId, existing, incomingOp, incomingTs, source });
            return false;
        }

        // Equal timestamps: prefer remote to avoid oscillation
        if (inc === cur) {
            const allow = source === 'remote';
            dbg(allow ? `allow (equal ts, prefer remote)` : `deny (equal ts, local)`, { taskId, existing, incomingOp, incomingTs, source });
            return allow;
        }

        // Delete vs Update grace-window logic (applies when timestamps are very close)
        const graceMs = Math.max(0, (getSettings().deleteGraceSeconds ?? 30)) * 1000;

        // If the existing recorded op is delete and we're trying to update locally shortly after, honor delete
        if (existing.op === 'delete' && incomingOp === 'update') {
            if (cur + graceMs >= inc) {
                dbg(`deny (grace: delete wins over incoming update)`, { taskId, existing, incomingOp, incomingTs, source, graceMs });
                return false; // skip update, delete wins within grace
            }
            dbg(`allow (outside grace: update over prior delete)`, { taskId, existing, incomingOp, incomingTs, source, graceMs });
            return true; // outside grace, allow update
        }

        // If incoming is delete but an update was recorded very recently, prefer the newer among them
        if (incomingOp === 'delete' && existing.op === 'update') {
            // Since inc === cur here (handled above), fall back to remote preference
            const allow = source === 'remote';
            dbg(allow ? `allow (tie delete vs update: prefer remote)` : `deny (tie delete vs update: local)`, { taskId, existing, incomingOp, incomingTs, source });
            return allow;
        }

        // Otherwise default to allowing
        dbg(`allow (default)`, { taskId, existing, incomingOp, incomingTs, source });
        return true;
    }

    async getProjects() {
		//TODO: add a check for valid data
		return getProjects();
	}

	async getTasks(filter: string) {
		log.debug('getTasks', filter);
		return getTasks();
	}

	async deletedTaskCheck(filePath: string | null) {
		return await doWithLock(LOCK_TASKS, async () => {
			return this.tickTickSync?.deletedTaskCheck(filePath);
		});
	}

	async deletedFileCheck(filePath: string): Promise<boolean> {

		const fileMetadata = await this.cacheOperation?.getFileMetadata(filePath, null);
		if (!fileMetadata || !fileMetadata.TickTickTasks) {
			//log.debug('There is no task in the deleted file')
			return false;
		}
		//TODO
		// if (!(this.checkModuleClass())) {
		// 	return false;
		// }

		await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync.deletedTaskCheck(filePath);
			await this.cacheOperation.deleteFilepathFromMetadata(filePath);
		});
		return true;
	}

	async renamedFileCheck(filePath: string, oldPath: string): Promise<boolean> {
		// log.debug(`${oldPath} is renamed`)
		//Read fileMetadata
		//const fileMetadata = await this.fileOperation.getFileMetadata(file)
		const fileMetadata = await this.cacheOperation?.getFileMetadata(oldPath, null);
		if (!fileMetadata || !fileMetadata.TickTickTasks) {
			//log.debug('There is no task in the deleted file')
			return false;
		}
		//TODO
		// if (!(this.checkModuleClass())) {
		// 	return;
		// }

		await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync.updateTaskContent(filePath);
			await this.cacheOperation.updateRenamedFilePath(oldPath, filePath);
		});
		return true;
	}

	async fullTextNewTaskCheck(filepath: string) {
		await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync?.fullTextNewTaskCheck(filepath);
		});
	}

	async lineNewContentTaskCheck(editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		return await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync?.lineNewContentTaskCheck(editor, info);
		});
	}

	async lineModifiedTaskCheck(filepath: string, lastLineText: string, lastLine: number): Promise<boolean> {
		return await doWithLock(LOCK_TASKS, async () => {
			const file = this.plugin.app.vault.getAbstractFileByPath(filepath) as TFile;
			const fileMap = new FileMap(this.plugin.app, this.plugin, file);
			await fileMap.init();
			return this.tickTickSync?.lineModifiedTaskCheck(filepath, lastLineText, lastLine, fileMap);
		});
	}


	/*
	 * called only from settings tab
	 */

	//TODO: refactor
	async checkDataBase() {
		// Add code here to handle exporting TickTick data
		//reinstall plugin
		const vault = this.plugin.app.vault;
		const fileNum = await this.plugin.cacheOperation?.checkFileMetadata();
		log.debug(`checking metadata for ${fileNum} files`);
		if (!fileNum || fileNum < 1) { //nothing? really?
			log.debug('File Metadata rebuild.');
			const allMDFiles: TFile[] = vault.getMarkdownFiles();
			allMDFiles.forEach(file => {
				// log.debug("File: ", file);
				this.tickTickSync?.fullTextModifiedTaskCheck(file.path);
			});
		}
		await this.plugin.saveSettings();

		const metadatas = await this.cacheOperation?.getFileMetadatas();

		//if (!await this.plugin.checkAndHandleSyncLock()) return;

		log.debug('checking deleted tasks');
		await doWithLock(LOCK_TASKS, async () => {

			//check empty task
			for (const key in metadatas) {
				// log.debug("Key: ", key)
				const value = metadatas[key];
				//log.debug(value)
				for (const taskDetails of value.TickTickTasks) {
					//log.debug(`${taskId}`)
					let taskObject;
					try {
						taskObject = this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetails.taskId);
					} catch (error) {
						log.error('An error occurred while loading task cache: ', error);
					}
					if (!taskObject) {
						// log.debug(`The task data of the ${taskId} is empty.`)
						//get from TickTick
						try {
							taskObject = await this.plugin.tickTickRestAPI?.getTaskById(taskDetails.taskId);
							if (taskObject && taskObject.deleted === 1) {
								await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskDetails.taskId);
							}
						} catch (error) {
							if (error.message.includes('404')) {
								// log.debug(`Task ${taskId} seems to not exist.`);
								await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskDetails.taskId);
								continue;
							} else {
								log.error('An error occurred while loading task from api: ', error);
								continue;
							}
						}

					}
				}
			}
			await this.plugin.saveSettings();


			log.debug('checking renamed files -- This operation takes a while, please be patient.');
			try {
				//check renamed files
				for (const key in metadatas) {
					log.debug('Checking Renamed: ', key);
					const value = metadatas[key];
					//log.debug(value)
					const obsidianURL = this.plugin.taskParser.getObsidianUrlFromFilepath(key);
					for (const taskDetail of value.TickTickTasks) {
						//log.debug(`${taskId}`)
						let taskObject;
						try {
							taskObject = this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetail.taskId);
						} catch (error) {
							log.warn(`An error occurred while loading task ${taskDetail.taskId} from cache:`, error);
						}
						if (!taskObject) {
							log.warn(`Task ${taskDetail.id}: ${taskDetail.title} is not found.`);
							continue;
						}
						const oldTitle = taskObject?.title ?? '';
						if (!oldTitle.includes(obsidianURL)) {
							// log.debug('Preparing to update description.')
							// log.debug(oldContent)
							// log.debug(newContent)
							try {
								await this.tickTickSync?.updateTaskContent(key);
							} catch (error) {
								log.warn(`An error occurred while updating task description:`, error);
							}
						}
					}
				}
				log.debug('Done File Rename check.');

				try {
					log.debug('checking unsynced tasks');
					const files = vault.getFiles();
					for (const v of files) {

						if (v.extension == 'md') {
							try {
								log.debug(`Scanning file ${v.path}`);
								//assume that if they want links in descriptions, it will be handled on task construction
								if (getSettings().taskLinksInObsidian === "taskLink") {
									await this.plugin.fileOperation?.addTickTickLinkToFile(v.path);
								}
								if (getSettings().enableFullVaultSync) {
									const fileMap = new FileMap(this.plugin.app, this.plugin, v);
									await fileMap.init();
									await this.plugin.fileOperation?.addTickTickTagToFile(fileMap);
								}


							} catch (error) {
								log.error(`An error occurred while check new tasks in the file: ${v.path}`, error);
							}

						}
					}
				} catch (error) {
					log.error(`An error occurred while checking for unsynced tasks.:`, error);
					return;
				}

				new Notice(`All files have been scanned.`);

			} catch (error) {
				log.warn(`An error occurred while scanning the vault.:`, error);
			}
		});

		log.debug('Done checking data.');
	}

	/*

	 */

	async closeTask(taskId: string) {
		await this.tickTickSync.closeTask(taskId);
	}

	async openTask(taskId: string): Promise<void> {
		await this.tickTickSync.reopenTask(taskId);
	}

	private async syncTickTickToObsidian(): Promise<boolean> {
		return this.tickTickSync.syncTickTickToObsidian();
	}

	/**
	 * @param bForceUpdate
	 */
	async syncFiles(bForceUpdate: boolean) {
		const filesToSync = getSettings().fileMetadata;
		if (!filesToSync) {
			log.warn('No sync files found.');
			return;
		}
		let newFilesToSync = filesToSync;
		//If one project is to be synced, don't look at it's other files.

		if (getSettings().SyncProject) {
			newFilesToSync = Object.fromEntries(Object.entries(filesToSync).filter(([key, value]) =>
				value.defaultProjectId === getSettings().SyncProject));
		}

		//Check for duplicates before we do anything
		try {
			const result = this.cacheOperation?.checkForDuplicates(newFilesToSync);
			if (result?.duplicates && (JSON.stringify(result.duplicates) != '{}')) {
				let dupText = '';
				for (const duplicatesKey in result.duplicates) {
					dupText += 'Task: ' + duplicatesKey + '\nin files: \n';
					result.duplicates[duplicatesKey].forEach(file => {
						dupText += file + '\n';
					});
				}
				const msg =
					'Found duplicates in MetaData.\n\n' +
					`${dupText}` +
					'\nPlease fix manually. This causes unpredictable results' +
					'\nPlease open an issue in the TickTickSync repository if you continue to see this issue.' +
					'\n\nTo prevent data corruption. Sync is aborted.';
				log.error('Metadata Duplicates: ', result.duplicates);
				new Notice(msg, 5000);
				return;
			}


			const duplicateTasksInFiles = await this.fileOperation?.checkForDuplicates(filesToSync, result?.taskIds);
			if (duplicateTasksInFiles && (JSON.stringify(duplicateTasksInFiles) != '{}')) {
				let dupText = '';
				for (let duplicateTasksInFilesKey in duplicateTasksInFiles) {
					dupText += 'Task: ' + duplicateTasksInFilesKey + '\nFound in Files: \n';
					duplicateTasksInFiles[duplicateTasksInFilesKey].forEach(file => {
						dupText += file + '\n';
					});
				}
				const message = document.createDocumentFragment();
				message.appendChild(document.createTextNode('Found duplicates in Files.                                                             '));
				message.appendChild(document.createElement('br'));
				message.appendChild(document.createTextNode(`${dupText}`));
				message.appendChild(document.createElement('br'));
				message.appendChild(document.createTextNode('Please fix manually to avoid unpredictable results.'));
				message.appendChild(document.createElement('br'));
				message.appendChild(document.createElement('br'));
				message.appendChild(document.createTextNode('Please open an issue in the TickTickSync repository if you continue to see this issue.'));
				message.appendChild(document.createElement('br'));
				message.appendChild(document.createElement('br'));
				message.appendChild(document.createTextNode('Sync is aborted to prevent data corruption.'));
				new Notice(message, 0);
				log.error('Duplicates in file: ', dupText);
				return;
			}
		} catch (error) {
			log.error(error);
			new Notice(`Duplicate check failed:  ${Error}`, 5000);
			return;
		}


		//let's see if any files got killed while we weren't watching
		//TODO: Files deleted while we weren't looking is not handled right.
		log.debug('New Files: ', newFilesToSync);
		for (const fileKey in newFilesToSync) {
			const file = this.plugin.app.vault.getAbstractFileByPath(fileKey);
			if (!file) {
				log.debug('File ', fileKey, ' was deleted before last sync.');
				await this.cacheOperation?.deleteFilepathFromMetadata(fileKey);
				//TODO: This is wrong, if it ever worked it doesn't now.
				const toDelete = newFilesToSync.findIndex(fileKey);
				newFilesToSync.splice(toDelete, 1);
			}
		}

		//Now do the task checking.
		for (const fileKey in newFilesToSync) {
			if (getSettings().debugMode) {
				log.debug(fileKey);
			}

			if (bForceUpdate ){
				await doWithLock(LOCK_TASKS, async () => {
					try {
						await this.tickTickSync?.forceUpdates(fileKey);
					} catch (error) {
						log.error('An error occurred in fullTextNewTaskCheck:', error);
					}
				});
			}

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.fullTextNewTaskCheck(fileKey);
				} catch (error) {
					log.error('An error occurred in fullTextNewTaskCheck:', error);
				}
			});

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.fullTextModifiedTaskCheck(fileKey);
				} catch (error) {
					log.error('An error occurred in fullTextModifiedTaskCheck:', error);
				}
			});

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.deletedTaskCheck(fileKey);
				} catch (error) {
					log.error('An error occurred in deletedTaskCheck:', error);
				}
			});
		}
	}
}
