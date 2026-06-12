import TickTickSync from '@/main';
import { Tick } from '@/api';
import { getSettings, updateSettings } from '@/settings';
import { doWithLock } from '@/utils/locks';
import { SyncMan } from '@/services/syncModule';
import { Editor, type MarkdownFileInfo, type MarkdownView, Notice, TFile } from 'obsidian';
import { CacheOperation } from '@/services/cacheOperation';
import { FileOperation } from '@/fileOperation';
import { NewFileMap } from '@/services/newFileMap';
//Logging
import log from '@/utils/logger';
import { FoundDuplicateTasksModal } from '@/modals/FoundDuplicateTasksModal';
import { TaskDeletionModal } from '@/modals/TaskDeletionModal';
import { OrphanTaskModal, type OrphanItem } from '@/modals/OrphanTaskModal';
import type { ITask } from '@/api/types/Task';
import { getTick } from '@/api/tick_singleton_factory'
import { syncTickTickWithDexie } from '@/sync/sync';
import { db } from "@/db/dexie";
import { getAllProjects, getProjectById, upsertProjects } from '@/db/projects';
import { loadTasksFromCache } from "@/db/tasks";
import { getAllFiles, getFile, upsertFile } from "@/db/files";
import type { IProject } from '@/api/types/Project';

const LOCK_TASKS = 'LOCK_TASKS';


//TODO: encapsulate all api and cache
export class TickTickService {
	initialized: boolean = false;
	plugin: TickTickSync;
	tickTickSync!: SyncMan;
	api?: Tick;
	cacheOperation!: CacheOperation;
	fileOperation?: FileOperation;

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

	async synchronization(fullSync: boolean = false) {
		try {
			// NEW: Use TaskCache
			await this.plugin.taskCache.fill();

			await doWithLock(LOCK_TASKS, async () => {
				if (this.plugin.tickTickRestAPI) {
					const projects = await this.saveProjectsToCache();
					if (projects) {
						//check to see if we need to move any project files
						const mostRecentModifiedTime = projects.reduce((latest, project) => {
							return new Date(project.modifiedTime) > new Date(latest)
								? project.modifiedTime
								: latest;
						}, projects[0].modifiedTime);
						const mostRecentModifiedTimeDate = new Date(mostRecentModifiedTime);
						log.debug(`Most recent modified time: ${mostRecentModifiedTime}`);
						const meta = await db.meta.get("sync");
						const lastFullSync = meta?.lastFullSync;
						const lastDeltaSync = meta?.lastDeltaSync;
						const lastSync = lastFullSync > lastDeltaSync ? lastFullSync : lastDeltaSync;
						const lastSyncDate = lastSync ? new Date(lastSync) : null;
						if (mostRecentModifiedTimeDate > lastSyncDate) {
							log.debug(`TT Folder move detected. Moving all project files to new location.`)
							await this.plugin.reorganizeFilesToFolders();

						}





					}

					// Ensure all vault files are registered in Files metadata
					await this.ensureVaultFilesRegistered();
					await syncTickTickWithDexie(this.plugin.tickTickRestAPI, fullSync);
					//NEW: Use VaultSyncCoordinator
					await this.plugin.vaultSyncCoordinator.syncVaultWithDatabase();
				}
			});
			await this.syncFiles(false);
		} catch (error) {
			log.error('Error on synchronization: ', error);
		} finally {
			// NEW: Clear TaskCache
			this.plugin.taskCache.clear();
		}
	}

	async ensureVaultFilesRegistered(): Promise<void> {
		const vault = this.plugin.app.vault;
		const markdownFiles = vault.getMarkdownFiles();
		const allProjects = await this.getProjects();

		for (const file of markdownFiles) {
			const dbFile = await getFile(file.path);
			if (!dbFile) {
				// Look up file name in projects cache to auto-associate
				const fileName = file.basename;
				const matchingProject = allProjects.find(p => p.name === fileName);
				if (matchingProject) {
					log.debug(`Auto-associating file with project: ${file.path} -> ${matchingProject.name}`);
					await upsertFile(file.path, matchingProject.id);
				} else {
					log.debug(`Registering file without project association: ${file.path}`);
					await upsertFile(file.path);
				}
			}
		}
	}

	async saveProjectsToCache(): Promise<IProject[] | undefined> {
		let projects = await this.api?.getProjects();
		if (projects) {
			// Also get project groups
			const groups = await this.api?.getProjectGroups();
			if (groups) {
				await db.projectGroups.clear();
				await db.projectGroups.bulkPut(groups.map(g => ({ id: g.id, group: g })));
			}
			if (!await this.cacheOperation.saveProjectsToCache(projects)) {
				projects = undefined;
			}
		}
		return projects;
	}

	async getProjects() {
		return await getAllProjects();
	}

	async getTasks(filter: string) {
		log.debug('getTasks', filter);
		return await loadTasksFromCache();
	}

	async deletedTaskCheck(filePath: string | null) {
		return await doWithLock(LOCK_TASKS, async () => {
			//NEW: Use TaskDeletionHandler
			await this.plugin.taskDeletionHandler.checkFileForDeletedTasks(filePath);
		});
	}

	async deletedFileCheck(filePath: string): Promise<boolean> {
		//NEW: Use FileTaskQueries
		const hasTasks = await this.plugin.fileTaskQueries.fileHasTasks(filePath);
		if (!hasTasks) {
			return false;
		}

		await doWithLock(LOCK_TASKS, async () => {
			//NEW: Use TaskDeletionHandler
			await this.plugin.taskDeletionHandler.handleFileDeleted(filePath);
		});
		return true;
	}

	async renamedFileCheck(filePath: string, oldPath: string): Promise<boolean> {
		//NEW: Use FileTaskQueries
		const hasTasks = await this.plugin.fileTaskQueries.fileHasTasks(oldPath);
		const hasDefaultProjectId = await this.cacheOperation.filepathHasDefaultProjectID(oldPath);

		// Only process rename if file has tasks OR has a default project ID
		if (!hasTasks && !hasDefaultProjectId) {
			return false;
		}

		await doWithLock(LOCK_TASKS, async () => {
			// Check if file was moved between folders (project groups), or got renamed.
			const groupChange = await this.plugin.folderSyncService?.detectProjectGroupChange(oldPath, filePath);

			if (groupChange?.changed) {
				log.info(`File moved or renamed, updating tasks`);
				//TODO: IS this the right place to do this?
				if (groupChange.newGroupId) {
					log.debug("group move ", groupChange)
					const project = await getProjectById(groupChange.newProjectId);
					if (!project) {
						log.error("No project found for ID: ", groupChange.newProjectId)
						return false;
					}
					if (project) {
						project.groupId = groupChange.newGroupId
						project.name = groupChange.newProjectName
						const response = await this.plugin.tickTickRestAPI?.updateProject(project)
						const aProjects: IProject[] = [];
						aProjects.push(project);
						await upsertProjects(aProjects)
					}
				}

				// Get all tasks in this file
				const tasks = await this.plugin.fileTaskQueries.getTasksInFile(oldPath);

				// Move each task to the new project
				for (const currentTask of tasks) {
					try {
						const task = await this.plugin.taskRepository.loadTaskById(currentTask.taskId);
						if (task && task.projectId !== groupChange.newProjectId) {
							// Update project in TickTick
							await this.plugin.tickTickRestAPI?.moveTaskProject(
								task,
								task.projectId,
								groupChange.newProjectId
							);

							// Update local cache
							task.projectId = groupChange.newProjectId;
							await this.plugin.taskRepository.upsertTask(task, filePath, Date.now());

							log.debug(`Moved task ${task} to project ${groupChange.newProjectId}`);
						}
					} catch (error) {
						log.error(`Error moving task ${currentTask} to new project:`, error);
					}
				}

				new Notice(`File moved to different project group. ${tasks.length} task(s) updated.`);
			}

			//NEW: Use TaskOperationsService
			await this.plugin.taskOperationsService.updateTaskContentForFile(filePath);
			await this.cacheOperation.updateRenamedFilePath(oldPath, filePath);
		});
		return true;
	}

	async fullTextNewTaskCheck(filepath: string) {
		await doWithLock(LOCK_TASKS, async () => {
			//NEW: Use TaskModificationDetector
			await this.plugin.taskModificationDetector.checkFileForNewTasks(filepath);
		});
	}

	async lineNewContentTaskCheck(editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		return await doWithLock(LOCK_TASKS, async () => {
			//NEW: Use TaskModificationDetector
			await this.plugin.taskModificationDetector.checkLineForNewTask(editor, info);
		});
	}

	async lineModifiedTaskCheck(filepath: string, lastLineText: string, lastLine: number): Promise<boolean> {
		return await doWithLock(LOCK_TASKS, async () => {
			const file = this.plugin.app.vault.getAbstractFileByPath(filepath) as TFile;
				const fileMap = new NewFileMap(this.plugin.app, this.plugin, file);
			await fileMap.init();
			//NEW: Use TaskModificationDetector
			return await this.plugin.taskModificationDetector.checkLineForModifications(filepath, lastLineText, lastLine, fileMap);
		});
	}


	/*
	 * called only from settings tab
	 */

	async checkDataBase() {
		const vault = this.plugin.app.vault;
		const markdownFiles = vault.getMarkdownFiles();
		const allProjects = await this.getProjects();
		const dbFiles = await getAllFiles();

		log.debug(`Checking database for ${markdownFiles.length} markdown files and ${dbFiles.length} DB entries.`);

		const tasksToDelete: { filepath: string, taskId: string, title: string }[] = [];
		const tasksToResolve: { filepath: string, taskId: string, title: string, projectId: string, task: ITask, inFile: boolean }[] = [];
		const allLocalIds = new Set<string>();

		await doWithLock(LOCK_TASKS, async () => {
			// 1. Handle files that were moved/renamed (have tasks but wrong path in DB)
			for (const dbFile of dbFiles) {
				const vaultFile = vault.getAbstractFileByPath(dbFile.path);
				if (!vaultFile || !(vaultFile instanceof TFile)) {
					const metadata = await this.cacheOperation.getFileMetadata(dbFile.path);
					if (metadata && metadata.TickTickTasks && metadata.TickTickTasks.length > 0) {
						const task1 = metadata.TickTickTasks[0];
						const searchResult = await this.fileOperation?.searchFilepathsByTaskidInVault(task1.taskId);
						if (searchResult) {
							log.debug(`File ${dbFile.path} moved to ${searchResult}. Updating DB.`);
							await this.cacheOperation.updateRenamedFilePath(dbFile.path, searchResult);
							continue;
						}
					}
					log.debug(`Removing DB entry for non-existent file: ${dbFile.path}`);
					await this.cacheOperation.deleteFilepathFromMetadata(dbFile.path);
				}
			}

			// 2. Ensure all vault files are in DB and match with projects if possible
			for (const file of markdownFiles) {
				const dbFile = await getFile(file.path);
				if (!dbFile) {
					// Look up file name in projects cache
					const fileName = file.basename;
					const matchingProject = allProjects.find(p => p.name === fileName);
					if (matchingProject) {
						log.debug(`Matching project found for new DB entry: ${file.path} -> ${matchingProject.name}`);
						await upsertFile(file.path, matchingProject.id);
					} else {
						log.debug(`Adding new DB entry for file: ${file.path}`);
						await upsertFile(file.path);
					}
				} else {
					const fileName = file.basename;
					const matchingProject = allProjects.find(p => p.name === fileName);
					if (matchingProject?.id != dbFile.defaultProjectId) {
						log.debug(`Project mismatch  DB entry: ${file.path} -> ${matchingProject?.id} vs ${dbFile.defaultProjectId}`);
						await upsertFile(file.path, matchingProject?.id);
					}
				}
			}

			// 3. Consistency check for tasks and missed tasks
			const metadatas = await this.cacheOperation?.getFileMetadatas();
			if (!metadatas) return;

			for (const filepath in metadatas) {
				const value = metadatas[filepath];
				const obsidianURL = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath);

				const file = vault.getAbstractFileByPath(filepath);
				if (!(file instanceof TFile)) {
					log.debug(`[checkDB] SKIP file ${filepath} — not a valid TFile`);
					continue;
				}

			const fileMap = new NewFileMap(this.plugin.app, this.plugin, file);
				await fileMap.init();
				
				// We check tasks actually in the file and tasks the DB thinks are in the file
				const dbTaskIds = value.TickTickTasks.map(t => t.taskId);
				const physicalTaskIds = fileMap.getTasks();
				log.debug(`[checkDB] File ${filepath}: dbTaskIds=${dbTaskIds.length}, physicalTaskIds=${physicalTaskIds.length}, allTaskIds=${Array.from(new Set([...dbTaskIds, ...physicalTaskIds])).length}`);
				//NEW: Use FileTaskQueries for duplicate detection
				const duplicates = await this.plugin.fileTaskQueries.findDuplicateTasks(filepath);
				if (duplicates.length > 0) {
					log.warn(`Found ${duplicates.length} duplicate tasks in ${filepath}:`, duplicates.map(d => d.taskId));
				}
				const allTaskIds = Array.from(new Set([...dbTaskIds, ...physicalTaskIds]));
				for (const id of allTaskIds) allLocalIds.add(id);

			for (const taskId of allTaskIds) {
				log.debug(`[checkDB] Processing task ${taskId} in file ${filepath} (inDB=${dbTaskIds.includes(taskId)}, inFile=${physicalTaskIds.includes(taskId)})`);

				// Skip tasks without #ticktick tag
				if (!dbTaskIds.includes(taskId) && physicalTaskIds.includes(taskId)) {
					const taskLine = fileMap.getTaskRecord(taskId).task;
					if (!this.plugin.taskParser?.hasTickTickTag(taskLine)) {
						log.debug(`[checkDB] SKIP task ${taskId} — no #ticktick tag on line: "${taskLine}"`);
						continue;
					}
				}

				const localTask = await this.plugin.taskRepository.loadLocalTaskById(taskId);
				let taskObject = localTask?.task;

				log.debug(`[checkDB] task ${taskId}: localTask exists=${!!localTask}, taskObject exists=${!!taskObject}, localTask.deleted=${localTask?.deleted}, taskObject.deleted=${taskObject?.deleted}`);

				const inFile = physicalTaskIds.includes(taskId);

				// If the task is locally deleted, data is missing, or absent from the file, verify with TickTick
				if (!taskObject || localTask?.deleted === true || taskObject?.deleted === 1 || !inFile) {
					log.debug(`[checkDB] ENTER TickTick check for ${taskId}: reason=!taskObj=${!taskObject}, localDel=${localTask?.deleted === true}, objDel=${taskObject?.deleted === 1}, inFile=${inFile}`);
					try {
						const tickTickTask = await this.plugin.tickTickRestAPI?.getTaskById(taskId);
						if (tickTickTask && tickTickTask.deleted !== 1) {
							// getTaskById may not return parentId; supplement from local DB if needed
							if (!tickTickTask.parentId && taskObject?.parentId) {
								tickTickTask.parentId = taskObject.parentId;
							}
							// Task is alive on TickTick — treat as orphan and let user decide
							log.debug(`[checkDB] ORPHAN task ${taskId} — alive on TickTick (title="${tickTickTask.title}", projectId=${tickTickTask.projectId}), adding to resolve list`);
							tasksToResolve.push({
								filepath,
								taskId: taskId,
								title: tickTickTask.title || taskId,
								projectId: tickTickTask.projectId,
								task: tickTickTask,
								inFile
							});
							continue;
						} else if (tickTickTask && tickTickTask.deleted === 1) {
							// Deleted on TickTick too
							log.debug(`[checkDB] DELETE task ${taskId} — also deleted in TickTick (title="${tickTickTask.title}")`);
							tasksToDelete.push({ filepath, taskId: taskId, title: tickTickTask.title || taskId });
							continue;
						}
						// tickTickTask was null/undefined — can't confirm with API
						log.debug(`[checkDB] NULL/UNDEFINED from TickTick API for ${taskId} — falling through to local-state check`);
					} catch (error) {
						if (error.message?.includes('404')) {
							log.debug(`[checkDB] DELETE task ${taskId} — 404 from TickTick API (task not found)`);
							tasksToDelete.push({ filepath, taskId: taskId, title: taskId });
							continue;
						}
						log.error(`[checkDB] Error loading task ${taskId} from API:`, error);
						continue;
					}
					// If locally marked as deleted, proceed with deletion
					if (localTask?.deleted === true || taskObject?.deleted === 1) {
						log.debug(`[checkDB] DELETE task ${taskId} — API returned null, but locally marked as deleted`);
						tasksToDelete.push({ filepath, taskId: taskId, title: taskObject?.title || taskId });
						continue;
					}
					// Otherwise silently skip (can't verify status with TickTick)
					log.debug(`[checkDB] SKIP task ${taskId} — API returned null, not locally marked as deleted`);
					continue;
				}

					if (localTask && (!localTask.lastVaultSync || localTask.lastVaultSync < localTask.updatedAt || !localTask.file)) {
						log.debug(`Cleaning up sync timestamps for task ${taskId} in ${filepath}`);
						await this.plugin.taskRepository.upsertTask(localTask.task, filepath, Date.now());
					}

					// Verify Obsidian URL in TickTick
					if (taskObject) {
						const title = taskObject.title || '';
						if (!title.includes(obsidianURL)) {
							try {
								await this.tickTickSync?.updateTaskContent(filepath);
							} catch (error) {
								log.warn(`Error updating task content for ${filepath}:`, error);
							}
						}
					}
				}

				// 4. Scan for missed/unsynced tasks in the file
				try {
					log.debug(`Scanning file ${filepath}`);
					if (getSettings().taskLinksInObsidian === "taskLink") {
						await this.plugin.fileOperation?.addTickTickLinkToFile(filepath);
					}

					//NEW: Use TaskModificationDetector
					await this.plugin.taskModificationDetector.checkFileForNewTasks(filepath);
					await this.plugin.taskModificationDetector.checkFileForModifications(filepath);

				} catch (error) {
					log.error(`Error scanning file ${filepath}:`, error);
				}
			}
		});
		log.debug(`Finished checking database for ${markdownFiles.length} markdown files and ${dbFiles.length} DB entries.`);
		log.debug(`Found ${tasksToDelete.length} tasks to be deleted.`);
		log.debug(`Known local task IDs: ${allLocalIds.size}.`);

		// Scan TickTick for tasks that have no local reference at all
		try {
			const allTickTickData = await this.plugin.tickTickRestAPI?.getAllTasks() || {};
			const allTickTickTasks: any[] = allTickTickData.update || [];
			log.debug(`[checkDB] TickTick-wide scan: got ${allTickTickTasks.length} live tasks from API`);
			if (allTickTickTasks.length > 0) {
				const resolveIds = new Set(tasksToResolve.map(t => t.taskId));
				for (const ttTask of allTickTickTasks) {
					const ttId = ttTask.id || ttTask.taskId;
					if (!ttId) { log.debug(`[checkDB] TT-scan: skip task with no id`); continue; }
					if (ttTask.deleted === 1) { log.debug(`[checkDB] TT-scan: skip ${ttId} — deleted on TickTick`); continue; }
					if (allLocalIds.has(ttId)) { log.debug(`[checkDB] TT-scan: skip ${ttId} — already in local IDs`); continue; }
					if (resolveIds.has(ttId)) { log.debug(`[checkDB] TT-scan: skip ${ttId} — already in resolve list`); continue; }
					const filepath = await this.plugin.cacheOperation?.getFilepathForProjectId(ttTask.projectId) || '';
					log.debug(`[checkDB] TT-scan: ORPHAN ${ttId} — no local reference (title="${ttTask.title}", projectId=${ttTask.projectId}, filepath="${filepath}")`);
					tasksToResolve.push({
						filepath,
						taskId: ttId,
						title: ttTask.title || ttId,
						projectId: ttTask.projectId,
						task: ttTask,
						inFile: false
					});
				}
				log.debug(`[checkDB] TickTick-wide scan complete: ${tasksToResolve.length} total orphaned tasks.`);
			}
		} catch (err) {
			log.error('Error scanning all TickTick tasks:', err);
		}

		if (tasksToResolve.length > 0) {
			log.debug(`[checkDB] Showing OrphanTaskModal for ${tasksToResolve.length} tasks: ${tasksToResolve.map(t => `${t.taskId} (${t.title})`).join(', ')}`);
			const orphanItems: OrphanItem[] = await Promise.all(tasksToResolve.map(async (t) => {
				let projectName: string | undefined;
				if (!t.filepath) {
					projectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(t.projectId) || 'Unknown Project';
				}
				return {
					title: this.plugin.taskParser.stripOBSUrl(t.title),
					filePath: t.filepath || undefined,
					projectName
				};
			}));
			const modal = new OrphanTaskModal(this.plugin.app, orphanItems);
			const action = await modal.showModal();
			log.debug(`[checkDB] User chose action "${action}" for orphaned tasks`);
			if (action === 'add') {
				await doWithLock(LOCK_TASKS, async () => {
					for (const t of tasksToResolve) {
						const targetFilepath = t.filepath || (await this.plugin.cacheOperation?.getFilepathForProjectId(t.projectId)) || '';
						await this.plugin.taskRepository.upsertTask(t.task, targetFilepath, Date.now());
						if (!t.inFile && targetFilepath) {
							try {
								await this.plugin.fileOperation?.synchronizeToVault(targetFilepath, [t.task], false);
							} catch (err) {
								log.warn(`Could not add task ${t.taskId} to file ${t.filepath}:`, err);
							}
						}
					}
				});
				new Notice(`Added ${tasksToResolve.length} orphaned task(s) to vault and database.`);
			} else if (action === 'delete') {
				await doWithLock(LOCK_TASKS, async () => {
					for (const t of tasksToResolve) {
						try {
							await this.plugin.tickTickRestAPI?.deleteTask(t.taskId, t.projectId);
							log.debug(`Deleted task ${t.taskId} from TickTick.`);
						} catch (err) {
							log.warn(`Failed to delete task ${t.taskId} from TickTick:`, err);
						}
						if (t.inFile && t.filepath) {
							const file = this.plugin.app.vault.getAbstractFileByPath(t.filepath);
							if (file instanceof TFile) {
								await this.plugin.fileOperation?.deleteTasksFromSpecificFile(file, [{ id: t.taskId } as ITask], false);
							}
						}
						if (t.filepath) {
							await this.cacheOperation?.deleteTaskIdFromMetadata(t.filepath, t.taskId);
						}
					}
				});
				new Notice(`Deleted ${tasksToResolve.length} orphaned task(s) from TickTick.`);
			}
		}

		if (tasksToDelete.length > 0) {
			log.debug(`[checkDB] Showing TaskDeletionModal for ${tasksToDelete.length} tasks: ${tasksToDelete.map(t => `${t.taskId} (${t.title})`).join(', ')}`);
			const items = tasksToDelete.map(t => ({
				title: this.plugin.taskParser.stripOBSUrl(t.title),
				filePath: t.filepath
			}));
			const modal = new TaskDeletionModal(this.plugin.app, items, 'they are deleted in TickTick or marked as deleted in the database.', (result) => { });
			const confirmed = await modal.showModal();
			log.debug(`[checkDB] User confirmed deletion: ${confirmed}`);
			if (confirmed) {
				await doWithLock(LOCK_TASKS, async () => {
					const byFile: Record<string, Set<string>> = {};
					for (const t of tasksToDelete) {
						if (!byFile[t.filepath]) byFile[t.filepath] = new Set();
						byFile[t.filepath].add(t.taskId);
					}
					for (const [path, taskIdSet] of Object.entries(byFile)) {
						const taskIds = Array.from(taskIdSet);
						const file = this.plugin.app.vault.getAbstractFileByPath(path);
						if (file instanceof TFile) {
							log.debug(`Deleting ${taskIds.length} tasks from ${path}`);
							await this.plugin.fileOperation?.deleteTasksFromSpecificFile(file, taskIds.map(id => ({ id } as ITask)), false);
						}
						for (const taskId of taskIds) {
							await this.cacheOperation?.deleteTaskIdFromMetadata(path, taskId);
						}
					}
				});
			}
		}

		await this.plugin.saveSettings();
		new Notice(`Database check completed.`);
		log.debug('Done checking data.');
	}

	/*

	 */

	async closeTask(taskId: string) {
		//NEW: Use TaskOperationsService
		await this.plugin.taskOperationsService.closeTask(taskId);
	}

	async openTask(taskId: string): Promise<void> {
		//NEW: Use TaskOperationsService
		await this.plugin.taskOperationsService.reopenTask(taskId);
	}

	private async syncTickTickToObsidian(): Promise<boolean> {
		return this.tickTickSync.syncTickTickToObsidian();
	}

	/**
	 * @param bForceUpdate
	 */
	async syncFiles(bForceUpdate: boolean) {
		const filesToSync = await this.cacheOperation?.getFileMetadatas();
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
			const result = await this.cacheOperation?.checkForDuplicates(newFilesToSync);
			if (result?.duplicates && (JSON.stringify(result.duplicates) != '{}')) {
				const modal = new FoundDuplicateTasksModal(this.plugin.app, this.plugin, result.duplicates, result.taskIds);
				const resolved = await modal.showModal();
				
				if (!resolved) {
					log.warn('User cancelled duplicate resolution. Sync aborted.');
					new Notice('Sync aborted. Please fix duplicates manually in MetaData to prevent data corruption.', 10000);
					return;
				}
				
				// Re-fetch metadata after deletions if user chose to proceed
				newFilesToSync = await this.cacheOperation?.getFileMetadatas();
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
				delete newFilesToSync[fileKey];
			}
		}

		//Now do the task checking.
		await doWithLock(LOCK_TASKS, async () => {
			// Phase 1: Process new tasks and modifications for all files first.
			// This detects and handles task moves (updating the DB file field),
			// so deletions in Phase 2 won't see moved tasks as "missing".
			for (const fileKey in newFilesToSync) {
				if (getSettings().debugMode) {
					log.debug(fileKey);
				}

				if (bForceUpdate) {
					try {
						await this.tickTickSync?.forceUpdates(fileKey);
					} catch (error) {
						log.error('An error occurred in forceUpdates:', error);
					}
				}

				try {
					await this.plugin.taskModificationDetector.checkFileForNewTasks(fileKey);
				} catch (error) {
					log.error('An error occurred in fullTextNewTaskCheck:', error);
				}

				try {
					await this.plugin.taskModificationDetector.checkFileForModifications(fileKey);
				} catch (error) {
					log.error('An error occurred in fullTextModifiedTaskCheck:', error);
				}
			}

			// Phase 2: Process deletions for all files.
			// Moved tasks already have updated file paths, so they won't be
			// detected as deleted from their old file.
			for (const fileKey in newFilesToSync) {
				try {
					await this.plugin.taskDeletionHandler.checkFileForDeletedTasks(fileKey);
				} catch (error) {
					log.error('An error occurred in deletedTaskCheck:', error);
				}
			}
		});
	}
}
