import { App, Notice, TFile } from 'obsidian';
import type TickTickSync from '@/main';
import type { IProject } from '@/api/types/Project';
import type { ITask } from '@/api/types/Task';
import { getSettings } from '@/settings';
import log from '@/utils/logger';
import { db } from '@/db/dexie';
import { getAllLocalProjects, getLocalProjectById, updateProjectState, deleteProject } from '@/db/projects';
import { getAllFiles, deleteFile, upsertFile } from '@/db/files';
import { ListLifecycleModal, type ListLifecycleAction, type ListLifecycleItem } from '@/modals/ListLifecycleModal';
import { FileMetadataService } from '@/repositories/FileMetadataService';
import { FolderSyncService } from '@/services/FolderSyncService';

/**
 * Detects archived/deleted lists and applies user-chosen actions.
 * - archived: project.closed is truthy
 * - deleted:  project no longer returned by /projects
 */
export class ListLifecycleService {
	private app: App;
	private plugin: TickTickSync;
	private folderSyncService?: FolderSyncService;

	constructor(app: App, plugin: TickTickSync, folderSyncService?: FolderSyncService) {
		this.app = app;
		this.plugin = plugin;
		this.folderSyncService = folderSyncService;
	}

	setFolderSyncService(service: FolderSyncService): void {
		this.folderSyncService = service;
	}

	private isClosed(p: IProject): boolean {
		const closed: unknown = p.closed;
		if (closed === true || closed === 1) return true;
		if (typeof closed === 'string') {
			const c = closed.toLowerCase();
			return c === 'true' || c === '1';
		}
		return false;
	}

	async handleListLifecycle(remoteProjects: IProject[]): Promise<void> {
		const settings = getSettings();
		const localProjects = await getAllLocalProjects();
		const files = await getAllFiles();
		const archivedPathByProjectId = this.buildArchivedFilePathMap(files);

		// Nothing to do (and nothing to touch in the DB) unless the user opted in
		// or a list was previously handled and may need to be restored. A file
		// sitting in the archived folder for an active list also needs attention.
		const hasHandledLists = localProjects.some(lp => lp.archived || lp.deleted || lp.syncPaused);
		if (!settings.handleArchivedLists && !settings.handleDeletedLists && !hasHandledLists && archivedPathByProjectId.size === 0) return;

		const remoteById = new Map(remoteProjects.map(p => [p.id, p]));
		const pathByProjectId = this.buildProjectFilePathMap(files);

		const archived: ListLifecycleItem[] = [];
		const deleted: ListLifecycleItem[] = [];
		const restored: string[] = [];

		for (const lp of localProjects) {
			const remote = remoteById.get(lp.id);
			const proj = lp.project;
			const filePath = pathByProjectId.get(lp.id);
			const isActive = !!remote && !remote.deleted && !this.isClosed(remote);

			// Self-heal: a list the user chose to move into the archived folder
			// must stay there until it is unarchived/restored. Folder layout
			// jobs from older versions could have dragged it back.
			if (!isActive && lp.syncPaused && lp.archivedFromPath) {
				await this.ensureArchivedLocation(lp.id);
			}

			// If a project came back marked as deleted, treat as deleted
			if (remote && remote.deleted === true) {
				if (settings.handleDeletedLists && !lp.syncPaused) {
					deleted.push({ project: proj, filePath, reason: 'deleted' });
				}
				await updateProjectState(lp.id, { deleted: true });
				continue;
			}

			if (remote && this.isClosed(remote)) {
				// Only prompt once per archive event: syncPaused records that the
				// user has already chosen what to do.
				if (settings.handleArchivedLists && !lp.syncPaused) {
					archived.push({ project: proj, filePath, reason: 'archived' });
				}
				await updateProjectState(lp.id, { archived: true, restoreSkipped: false });
				continue;
			}

			if (remote && !this.isClosed(remote)) {
				// List is active again. If it had been archived or paused, resume
				// syncing it and put its file back where it came from.
				const wasPaused = lp.syncPaused || lp.deleted;
				const archivedPath = archivedPathByProjectId.get(lp.id);

				if (lp.archived || wasPaused || archivedPath || lp.restoreSkipped) {
					// When the user already skipped a conflict, try the move
					// silently so it still happens once the target is gone.
					const restoreDone = await this.restoreArchivedFile(lp.id, lp.archivedFromPath, !lp.restoreSkipped);
					if (!restoreDone) {
						// The file could not be moved (e.g. the user skipped the
						// conflict). Keep the list frozen so neither folder
						// reorganization nor task sync drags the file out.
						if (!lp.restoreSkipped) {
							await updateProjectState(lp.id, { restoreSkipped: true });
						}
						continue;
					}
					await updateProjectState(lp.id, {
						archived: false,
						deleted: false,
						syncPaused: false,
						archivedFromPath: undefined,
						restoreSkipped: false,
					});
					if (wasPaused) restored.push(proj.name);
				}
				continue;
			}

			// missing from remote entirely
			if (!lp.syncPaused && settings.handleDeletedLists) {
				deleted.push({ project: proj, filePath, reason: 'deleted' });
			}
			await updateProjectState(lp.id, { deleted: true });
		}

		if (restored.length > 0) {
			new Notice(
				`Resumed syncing ${restored.length === 1 ? `list "${restored[0]}"` : `${restored.length} lists`} that ${restored.length === 1 ? 'was' : 'were'} unarchived in TickTick.`,
				5000
			);
		}

		const allItems = [...archived, ...deleted];
		if (allItems.length === 0) return;

		const modal = new ListLifecycleModal(this.app, allItems);
		const actions = await modal.showModal();
		// Empty map means the user cancelled: do not touch anything.
		for (const [projectId, action] of actions) {
			await this.applyAction(projectId, action, pathByProjectId.get(projectId));
		}
	}

	private getArchivedFolder(): string {
		return (getSettings().archivedListsFolder || 'Archived')
			.replace(/\\/g, '/')
			.replace(/^\/+|\/+$/g, '');
	}

	private isInsideArchivedFolder(path: string): boolean {
		const folder = this.getArchivedFolder().toLowerCase();
		if (!folder) return false;
		const lower = path.toLowerCase();
		return lower === folder || lower.startsWith(`${folder}/`);
	}

	/**
	 * Build projectId -> file path, preferring records whose file really exists.
	 * Duplicate/ghost records for the same project must not win.
	 */
	private buildProjectFilePathMap(files: Awaited<ReturnType<typeof getAllFiles>>): Map<string, string> {
		const map = new Map<string, string>();
		for (const f of files) {
			if (!f.defaultProjectId) continue;
			const exists = this.app.vault.getAbstractFileByPath(f.path) instanceof TFile;
			if (exists) {
				map.set(f.defaultProjectId, f.path);
			} else if (!map.has(f.defaultProjectId)) {
				map.set(f.defaultProjectId, f.path);
			}
		}
		return map;
	}

	/**
	 * Build projectId -> existing file path for files that live in the
	 * archived-lists folder.
	 */
	private buildArchivedFilePathMap(files: Awaited<ReturnType<typeof getAllFiles>>): Map<string, string> {
		const map = new Map<string, string>();
		for (const f of files) {
			if (!f.defaultProjectId) continue;
			if (!this.isInsideArchivedFolder(f.path)) continue;
			if (!(this.app.vault.getAbstractFileByPath(f.path) instanceof TFile)) continue;
			if (!map.has(f.defaultProjectId)) {
				map.set(f.defaultProjectId, f.path);
			}
		}
		return map;
	}

	/**
	 * Remove duplicate file records for a project that point at files which no
	 * longer exist. These ghosts are what make restore pick the wrong original
	 * location. Any tasks still attached to a ghost path are re-pointed at the
	 * surviving file first, so no tasks are lost.
	 */
	private async cleanupStaleProjectFileRecords(projectId: string, keepPath: string): Promise<void> {
		const files = await getAllFiles();
		for (const record of files) {
			if (record.defaultProjectId !== projectId) continue;
			if (record.path === keepPath) continue;
			if (this.app.vault.getAbstractFileByPath(record.path) instanceof TFile) continue;

			if (keepPath) {
				const tasks = await db.tasks.where('file').equals(record.path).toArray();
				for (const lt of tasks) {
					await db.tasks.update(lt.localId, { file: keepPath, updatedAt: Date.now() });
				}
				if (tasks.length > 0) {
					log.debug(`Re-pointed ${tasks.length} task(s) from ${record.path} to ${keepPath}`);
				}
			}

			log.debug(`Removing stale file record for project ${projectId}: ${record.path}`);
			await deleteFile(record.path);
		}
	}

	/**
	 * Keep the file of an archived/deleted list inside the archived-lists folder.
	 */
	private async ensureArchivedLocation(projectId: string): Promise<void> {
		const files = await getAllFiles();
		// Pick a record whose file actually exists; ghost records may come first.
		const records = files.filter(f => f.defaultProjectId === projectId);
		const existing = records.filter(f => this.app.vault.getAbstractFileByPath(f.path) instanceof TFile);

		// The file is already archived (possibly in a subfolder). Keep it there
		// and drop any ghost records instead of moving a duplicate around.
		const archivedRecord = existing.find(f => this.isInsideArchivedFolder(f.path));
		if (archivedRecord) {
			await this.cleanupStaleProjectFileRecords(projectId, archivedRecord.path);
			return;
		}

		const current = existing[0];
		if (!current) return;

		const folder = this.getArchivedFolder();
		if (!folder) return;

		const filename = current.path.split('/').pop() || '';
		if (!filename) return;

		const targetPath = `${folder}/${filename}`;
		if (current.path.toLowerCase() === targetPath.toLowerCase()) return;

		const file = this.app.vault.getAbstractFileByPath(current.path);
		if (!(file instanceof TFile)) return;
		if (this.app.vault.getAbstractFileByPath(targetPath)) {
			log.warn(`Cannot archive list file ${current.path}: ${targetPath} already exists`);
			return;
		}

		await this.ensureFolderExists(folder);
		try {
			await this.app.fileManager.renameFile(file, targetPath);
			const fms = this.plugin.fileMetadataService as FileMetadataService | undefined;
			await fms?.updateFilePath?.(current.path, targetPath);
			await this.cleanupStaleProjectFileRecords(projectId, targetPath);
			log.debug(`Moved archived list file ${current.path} back to ${targetPath}`);
		} catch (e) {
			log.error('Failed to move archived list file back to archived folder:', e);
		}
	}

	/**
	 * Move a list file back to the location it had before it was archived.
	 * Returns false when the file is still in the archive folder because the
	 * user skipped a conflict or the move failed; in that case the lifecycle
	 * flags must stay set so the file is not dragged out by folder jobs.
	 */
	private async restoreArchivedFile(projectId: string, fromPath?: string, promptOnConflict = true): Promise<boolean> {
		const files = await getAllFiles();
		const records = files.filter(f => f.defaultProjectId === projectId);
		if (records.length === 0) return true;

		// The file currently being synced/archived is the one that exists on disk
		// (prefer one inside the archived folder when several exist).
		const existing = records.filter(f => this.app.vault.getAbstractFileByPath(f.path) instanceof TFile);
		const current = existing.find(f => this.isInsideArchivedFolder(f.path)) ?? existing[0];
		if (!current) return true;

		// Nothing to restore: the surviving file is already outside the archive.
		if (!this.isInsideArchivedFolder(current.path)) {
			await this.cleanupStaleProjectFileRecords(projectId, current.path);
			return true;
		}

		// Determine the best restore target. When project folders are enabled
		// the folder layout is authoritative; otherwise fall back to a real
		// existing record, the recorded archive location, then any leftover
		// record. Ghost records must never win over the expected path.
		const otherRecords = records.filter(f => f.path !== current.path);
		const localProject = await getLocalProjectById(projectId);
		const project = localProject?.project;
		const projectName = project?.name || '';
		let expectedPath: string | undefined;
		if (this.folderSyncService && projectName && getSettings().keepProjectFolders) {
			expectedPath = await this.folderSyncService.getFilePathForProject(projectId, projectName);
		}

		const existingOther = otherRecords.find(f => this.app.vault.getAbstractFileByPath(f.path) instanceof TFile);
		let targetPath: string | undefined;
		if (expectedPath) {
			// With project folders enabled the current folder layout is
			// authoritative and must win over a stale record or archivedFromPath
			// left behind by an earlier bad restore.
			targetPath = otherRecords.find(f => f.path.toLowerCase() === expectedPath.toLowerCase())?.path ?? expectedPath;
		}
		if (!targetPath) {
			targetPath = existingOther?.path;
		}
		if (!targetPath && fromPath && !this.isInsideArchivedFolder(fromPath)) {
			targetPath = fromPath;
		}
		if (!targetPath && otherRecords.length === 1) {
			targetPath = otherRecords[0].path;
		}
		if (!targetPath) {
			targetPath = fromPath;
		}
		if (!targetPath || targetPath.toLowerCase() === current.path.toLowerCase()) return true;
		log.debug(`Restore target for project ${projectId}: ${targetPath} (archive path ${current.path})`);

		const file = this.app.vault.getAbstractFileByPath(current.path);
		if (!(file instanceof TFile)) return true;

		// A file already exists at the target. Ask the user how to resolve the
		// conflict instead of silently leaving the archived file behind.
		if (this.app.vault.getAbstractFileByPath(targetPath)) {
			if (!promptOnConflict) {
				log.debug(`Skipping restore of ${current.path}: ${targetPath} still exists`);
				return false;
			}

			if (!this.folderSyncService || !project) {
				log.warn(`Cannot restore archived list file ${current.path}: ${targetPath} already exists`);
				new Notice(`Could not restore ${current.path}: ${targetPath} already exists.`);
				return false;
			}

			log.debug(`Restore conflict for ${projectId}: ${targetPath} already exists; asking user`);
			const action = await this.folderSyncService.resolveFileLocationConflict(current.path, targetPath, project);
			if (action === 'skip') {
				// Keep the archived file associated with its list so it can be
				// recognized on the next attempt.
				await upsertFile(current.path, projectId);
				log.debug(`User skipped restoring archived list file ${current.path}`);
				return false;
			}

			await this.cleanupStaleProjectFileRecords(projectId, targetPath);
			log.debug(`Restored archived list file ${current.path} to ${targetPath} (conflict action: ${action})`);
			return true;
		}

		const parentPath = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '';
		await this.ensureFolderExists(parentPath);

		try {
			await this.app.fileManager.renameFile(file, targetPath);
			const fms = this.plugin.fileMetadataService as FileMetadataService | undefined;
			await fms?.updateFilePath?.(current.path, targetPath);
			await this.cleanupStaleProjectFileRecords(projectId, targetPath);
			log.debug(`Restored archived list file ${current.path} to ${targetPath}`);
			return true;
		} catch (e) {
			log.error('Failed to restore archived list file:', e);
			return false;
		}
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		if (!folderPath) return;
		let normalized = folderPath.replace(/\\/g, '/');
		while (normalized.startsWith('/')) normalized = normalized.substring(1);
		while (normalized.endsWith('/')) normalized = normalized.substring(0, normalized.length - 1);
		if (!normalized) return;

		const parts = normalized.split('/').filter(Boolean);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				try {
					await this.app.vault.createFolder(current);
				} catch (e) {
					log.debug(`Could not create folder ${current}:`, e);
				}
			}
		}
	}

	/**
	 * Remove the markdown lines of the given task records from whichever vault
	 * files they are currently attached to.
	 */
	private async removeTaskLines(tasks: Array<{ file?: string; task: ITask }>): Promise<void> {
		if (tasks.length === 0) return;
		const fileOperation = this.plugin.fileOperation;
		if (!fileOperation?.deleteTasksFromSpecificFile) return;

		const byFile = new Map<string, ITask[]>();
		for (const lt of tasks) {
			if (!lt.file) continue;
			const list = byFile.get(lt.file) ?? [];
			list.push(lt.task);
			byFile.set(lt.file, list);
		}

		for (const [path, fileTasks] of byFile) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			try {
				await fileOperation.deleteTasksFromSpecificFile(file, fileTasks, false);
				log.debug(`Removed ${fileTasks.length} task line(s) from ${path}`);
			} catch (e) {
				log.error(`Failed to remove task lines from ${path}:`, e);
			}
		}
	}

	private async applyAction(projectId: string, action: ListLifecycleAction, filePath?: string): Promise<void> {
		const fms = this.plugin.fileMetadataService as FileMetadataService | undefined;

		switch (action.type) {
			case 'keep': {
				// Keep file, stop syncing tasks from this list
				await updateProjectState(projectId, { syncPaused: true });
				new Notice(`Stopped syncing list ${projectId}`);
				break;
			}
			case 'stop': {
				await updateProjectState(projectId, { syncPaused: true });
				new Notice(`Paused sync for list ${projectId}`);
				break;
			}
			case 'move': {
				if (!filePath) break;
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) break;
				const folder = action.folder || getSettings().archivedListsFolder || 'Archived';
				await this.ensureFolderExists(folder);
				const targetPath = folder.endsWith('/') ? `${folder}${file.name}` : `${folder}/${file.name}`;
				try {
					await this.app.fileManager.renameFile(file, targetPath);
					await fms?.updateFilePath?.(filePath, targetPath);
					await this.cleanupStaleProjectFileRecords(projectId, targetPath);
					await updateProjectState(projectId, {
						syncPaused: true,
						archived: true,
						archivedFromPath: filePath,
					});
					new Notice(`Moved ${file.name} to ${folder}`);
				} catch (e) {
					log.error('Failed to move archived list file:', e);
				}
				break;
			}
			case 'trash': {
				if (filePath) {
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						try {
							await this.app.fileManager.trashFile(file);
						} catch (e) {
							log.error('Failed to trash list file:', e);
						}
					}
					// clear task associations
					if (fms?.deleteFileMetadata) {
						await fms.deleteFileMetadata(filePath);
					} else {
						await deleteFile(filePath);
					}
				}
				// remove project from cache and clean DB entries
				await deleteProject(projectId);
				await this.cleanupStaleProjectFileRecords(projectId, '');
				// Remove tasks belonging to this project (mark deleted).
				// `task.projectId` is not an indexed key path, so `where()` throws
				// a Dexie SchemaError; filter in memory instead.
				try {
					const tasks = await db.tasks.toArray();
					const projectTasks = tasks.filter(lt => lt.task?.projectId === projectId);
					// Lines may already have been re-homed to another file by an
					// earlier, failed cleanup. Remove them from wherever they are.
					await this.removeTaskLines(projectTasks.filter(lt => !!lt.file && lt.file !== filePath));
					for (const lt of projectTasks) {
						await db.tasks.update(lt.localId, { deleted: true, updatedAt: Date.now(), file: '' });
					}
					if (projectTasks.length > 0) {
						log.debug(`Marked ${projectTasks.length} task(s) from deleted list ${projectId} as deleted`);
					}
				} catch (e) {
					log.error('Error cleaning tasks for deleted list:', e);
				}
				new Notice('Deleted list removed from vault and database');
				break;
			}
		}
	}
}
