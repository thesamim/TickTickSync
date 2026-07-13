import { App, Notice, TFile } from 'obsidian';
import type TickTickSync from '@/main';
import type { IProject } from '@/api/types/Project';
import type { FolderSyncService } from '@/services/FolderSyncService';
import { FoundDuplicateListsModal } from '@/modals/FoundDuplicateListsModal';
import { getDefaultFolder, getSettings } from '@/settings';
import log from '@/utils/logger';
import { db } from '@/db/dexie';
import { getAllProjects } from '@/db/projects';
import { upsertFile, getAllFiles } from '@/db/files';

export class ProjectSyncService {
	app: App;
	plugin: TickTickSync;
	folderSyncService?: FolderSyncService;

	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
	}

	setFolderSyncService(service: FolderSyncService): void {
		this.folderSyncService = service;
	}

	async saveProjectsToCache(projects: IProject[]): Promise<boolean> {
		try {
			const inboxProject = {
				id: getSettings().inboxID,
				name: getSettings().inboxName
			} as IProject;
			projects.push(inboxProject);

			const duplicates = projects.reduce((acc, obj, index, arr) => {
				const duplicateIndex = arr.findIndex(item => item.name === obj.name && item.id !== obj.id);
				if (duplicateIndex !== -1 && !acc.includes(obj)) {
					acc.push(obj);
				}
				return acc;
			}, [] as IProject[]);
			const sortedDuplicates = duplicates.sort((a, b) => a.name.localeCompare(b.name));
			if (sortedDuplicates.length > 0) {
				const dupList = sortedDuplicates.map(thing => `${thing.id} ${thing.name}`);
				log.debug('Found duplicate lists: ', dupList);
				await this.showFoundDuplicatesModal(this.app, this.plugin, sortedDuplicates);
				return false;
			}

			for (const project of projects) {
				await this.checkProjectRename(project.id, project.name, project)
			}

			const localProjects = projects.map(p => ({ id: p.id, project: p }));
			await db.projects.bulkPut(localProjects);

			return true;
		} catch (error) {
			log.error('Error on save projects: ', error);
			new Notice(`error on save projects: ${error instanceof Error ? error.message : String(error)}`);
		}
		return false;
	}

	async checkProjectRename(ttProjectId: string, ttProjectName: string, ttProject?: IProject): Promise<void> {
		const fileMetadatas = await this.plugin.fileMetadataService.getAllFileMetadata();
		if (!fileMetadatas) return;
		const projects = await getAllProjects();
		if (!projects || Object.keys(projects).length == 0) return;

		const project = projects.find(p => p.id === ttProjectId);
		if (!project) {
			let newFilePath: string;
			const folder = getDefaultFolder();
			const sanitize = (name: string): string =>
				name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
			const safeProjectName = sanitize(ttProjectName);

			if (getSettings().keepProjectFolders && ttProject?.groupId) {
				const group = await db.projectGroups.get(ttProject.groupId);
				const groupName = group?.group?.name;
				if (groupName && groupName.trim().length > 0) {
					const safeGroupName = sanitize(groupName);
					const base = (folder ? folder + "/" : "");
					newFilePath = `${base}${safeGroupName}/${safeProjectName}.md`;
				} else {
					newFilePath = (folder ? folder + "/" : "") + safeProjectName + '.md';
				}
			} else {
				newFilePath = (folder ? folder + "/" : "") + safeProjectName + '.md';
			}

			log.debug(`New project detected: ${ttProjectName} (${ttProjectId}). Creating file entry: ${newFilePath}`);
			await upsertFile(newFilePath, ttProjectId);
			return;
		}
		if (project?.name !== ttProjectName) {
			log.debug(`Project Name Changed from ${project?.name} to ${ttProjectName}`)

			const files = await getAllFiles();
			const currentFile = files.find(f => f.defaultProjectId === ttProjectId);

			let currentFilePath;

			if (!currentFile) {
				log.debug(`No file found for project ${ttProjectId}`);
				currentFilePath = await this.plugin.fileMetadataService.getFilepathForProjectId(ttProjectId);
				log.debug(`currentFilePath: ${currentFilePath}`);
				if (!currentFilePath) {
					log.debug(`No file found for project ${ttProjectId} and no default file found`);
					return
				}
			} else {
				currentFilePath = currentFile.path;
			}

			let newFilePath: string;
			if (this.folderSyncService) {
				newFilePath = await this.folderSyncService.getFilePathForProject(ttProjectId, ttProjectName, ttProject?.groupId);
			} else {
				const folder = getDefaultFolder();
				const safeProjectName = ttProjectName.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
				newFilePath = (folder ? folder + "/" : "") + safeProjectName + '.md';
			}

			log.debug(`Renaming project file from ${currentFilePath} to ${newFilePath}`);

			if (currentFilePath !== newFilePath) {
				const vaultFile = this.app.vault.getAbstractFileByPath(currentFilePath);
				if (vaultFile && vaultFile instanceof TFile) {
					log.debug(`Renaming ${currentFilePath} to ${newFilePath}`);
					await this.app.vault.rename(vaultFile, newFilePath);
					log.debug(`Updating file path in database from ${currentFilePath} to ${newFilePath}`);
					await this.plugin.fileMetadataService.updateFilePath(currentFilePath, newFilePath);
				} else {
					log.warn(`File ${currentFilePath} not found in vault, updating database only`);
					await this.plugin.fileMetadataService.updateFilePath(currentFilePath, newFilePath);
				}
			}
		}
	}

	private async showFoundDuplicatesModal(app: App, plugin: TickTickSync, projects: IProject[]) {
		const myModal = new FoundDuplicateListsModal(app, plugin, projects, () => {});
		return await myModal.showModal();
	}
}
