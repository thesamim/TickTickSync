import { App, Notice, TFile, TFolder } from 'obsidian';
import TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import type { IProject } from '@/api/types//Project';
import { FoundDuplicateListsModal } from '@/modals/FoundDuplicateListsModal';
import { getDefaultFolder, getSettings } from '@/settings';
//Logging
import log from '@/utils/logger';
import { NewFileMap } from '@/services/newFileMap';
import { db } from '@/db/dexie';
import { getAllProjects, getProjectById } from '@/db/projects';
import { deleteFile, getAllFiles, getFile, updateFilePath as updateDbFilePath, upsertFile } from '@/db/files';
import type { DeletionItem } from '@/modals/TaskDeletionModal';
import type { LocalTask } from '@/db/schema';


export interface FileMetadata {
	[fileName: string]: FileDetail;
}

export interface FileDetail {
	TickTickTasks: TaskDetail[];
	TickTickCount: number;
	defaultProjectId?: string;
}

export interface TaskDetail {
	taskId: string;
	taskItems: string[];
}

const FILE_EXT = '.md';

export class CacheOperation {
	app: App;
	plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
	}


	async getFileMetadata(filepath: string, projectId?: string): Promise<FileDetail | undefined> {
		const file = await getFile(filepath);
		if (file) {
			const tasksInFile = await db.tasks.where("file").equals(filepath).toArray();
			return {
				TickTickTasks: tasksInFile.map(lt => ({
					taskId: lt.taskId,
					taskItems: lt.task.items?.map(i => i.id) || []
				})),
				TickTickCount: tasksInFile.length,
				defaultProjectId: file.defaultProjectId
			};
		}
		return await this.newEmptyFileMetadata(filepath, projectId);
	}

	async getFileMetadatas(): Promise<FileMetadata> {
		const files = await getAllFiles();
		const allTasks = await db.tasks.toArray();
		const tasksByFile = new Map<string, LocalTask[]>();
		for (const lt of allTasks) {
			if (lt.file) {
				if (!tasksByFile.has(lt.file)) tasksByFile.set(lt.file, []);
				tasksByFile.get(lt.file)!.push(lt);
			}
		}

		const metadata: FileMetadata = {};
		for (const file of files) {
			const tasksInFile = tasksByFile.get(file.path) || [];
			metadata[file.path] = {
				TickTickTasks: tasksInFile.map(lt => ({
					taskId: lt.taskId,
					taskItems: lt.task.items?.map(i => i.id) || []
				})),
				TickTickCount: tasksInFile.length,
				defaultProjectId: file.defaultProjectId
			};
		}
		return metadata;
	}

	async updateFileMetadata(filepath: string, newMetadata: FileDetail) {
		await upsertFile(filepath, newMetadata.defaultProjectId);
	}

	async deleteTaskIdFromMetadata(filepath: string, taskId: string) {
		// In Dexie-only mode, we just clear the file field of the task
		const lt = await db.tasks.where("taskId").equals(taskId).first();
		if (lt && lt.file === filepath) {
			await db.tasks.update(lt.localId, { file: "" });
		}
	}

	async updateTaskMetadata(task: ITask, filePath: string) {
		const lt = await db.tasks.where("taskId").equals(task.id).first();
		if (lt) {
			await db.tasks.update(lt.localId, { file: filePath });
		}
	}

	async deleteTaskIdFromMetadataByTaskId(taskId: string) {
		const lt = await db.tasks.where("taskId").equals(taskId).first();
		if (lt) {
			await db.tasks.update(lt.localId, { file: "" });
		}
	}

	//delete filepath from filemetadata
	async deleteFilepathFromMetadata(filepath: string): Promise<FileMetadata> {
		await deleteFile(filepath);
		// Also clear file field for all tasks in this file
		const lts = await db.tasks.where("file").equals(filepath).toArray();
		for (const lt of lts) {
			await db.tasks.update(lt.localId, { file: "" });
		}
		return await this.getFileMetadatas();
	}

	//Check for duplicates
	async checkForDuplicates(fileMetadata: FileMetadata) {
		if (!fileMetadata) {
			return;
		}

		const taskIds: Record<string, string> = {};
		let duplicates: Record<string, string[]> = {};

		for (const file in fileMetadata) {
			fileMetadata[file].TickTickTasks?.forEach(task => {
				if (!taskIds.hasOwnProperty(task.taskId)) {
					taskIds[task.taskId] = file;
					return;
				}
				if (!duplicates.hasOwnProperty(task.taskId)) {
					duplicates[task.taskId] = [];
				}
				duplicates[task.taskId].push(file);
			});
		}
		//This may be over-kill, but need it right now.
		await this.checkFilesForDuplicates(taskIds, duplicates);
		//Some day, may want to do something with all the taskIds?
		log.debug("Duplicates: ", duplicates);
		log.debug("TaskIds: ", taskIds);
		return { taskIds, duplicates };
	}


	async getDefaultProjectNameForFilepath(filepath: string) {
		// log.debug("Project Name Request: ", filepath);
		const file = await getFile(filepath);
		if (!file || file.defaultProjectId === undefined) {
			return getSettings().defaultProjectName;
		}

		const defaultProjectId = file.defaultProjectId;
		const projectName = await this.getProjectNameByIdFromCache(defaultProjectId);
		// log.debug("returning: " + projectName);
		return projectName;
	}

	async getDefaultProjectIdForFilepath(filepath: string) {
		const file = await getFile(filepath);
		if (!file || !file.defaultProjectId) {
			let defaultProjectId = getSettings().defaultProjectId;
			if (!defaultProjectId) {
				defaultProjectId = getSettings().inboxID;
			}
			return defaultProjectId;
		} else {
			let defaultProjectId = file.defaultProjectId;
			if (!defaultProjectId) {
				defaultProjectId = getSettings().inboxID;
			}
			return defaultProjectId;
		}
	}

	async filepathHasDefaultProjectID(filepath: string) {
		const file = await getFile(filepath);
		if (file && file.defaultProjectId) {
			return true;
		} else {
			return false;
		}
	}

	async getFolderPathForProject(projectId: string) {
		// Otherwise, compute expected path for this project.
		const projectName = await this.getProjectNameByIdFromCache(projectId);
		log.debug("Project Name Request: ", projectId, projectName);
		if (!projectName) {
			const errmsg = `File path not found for ${projectId}, returning ${projectName} instead.`;
			log.warn(errmsg);
			throw new Error(errmsg);
		}

		const folder = getDefaultFolder();

		// Folder organization: baseFolder/<groupName>/<projectName>.md
		if (getSettings().keepProjectFolders) {
			const project = await getProjectById(projectId);
			const groupId = project?.groupId;

			if (groupId) {
				const group = await db.projectGroups.get(groupId);
				const groupName = group?.group?.name;

				if (groupName && groupName.trim().length > 0) {
					const sanitize = (name: string): string =>
						name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

					const safeGroupName = sanitize(groupName);
					const safeProjectName = sanitize(projectName);
					const base = (folder ? folder + "/" : "");
					return `${base}${safeGroupName}/${safeProjectName}`;
				}
			}
		}

	}

	async getFilepathForProjectId(projectId: string) {
		if ((projectId) || (projectId !== '')) {
			const files = await getAllFiles();

			// If this project is set as a default for a file, return that file.
			for (const file of files) {
				if (file.defaultProjectId === projectId) {
					return file.path;
				}
			}

			// If the project is the inbox, return the inbox or default project file. (It may not have been created)
			if ((projectId === getSettings().inboxID) ||
				(projectId === getSettings().defaultProjectId)) { // highly unlikely, but just in case
				// They don't have a file for the Inbox. If they have a default project, return that.
				if (getSettings().defaultProjectName) {
					const folder = getDefaultFolder();
					return (folder ? folder + "/" : "") + getSettings().defaultProjectName + ".md";
				}
			}
			const folder = await this.getFolderPathForProject(projectId);
			log.debug("Returning folder: " + (folder || '') + FILE_EXT);

			// Flat structure: baseFolder/<projectName>.md
			//return (folder ? folder + "/" : "")  + FILE_EXT;
			return (folder || '') + FILE_EXT;;
		} else {
			const folder = getDefaultFolder();
			if (getSettings().defaultProjectName) {
				return (folder ? folder + "/" : "") + getSettings().defaultProjectName + FILE_EXT;
			} else {
				return (folder ? folder + "/" : "") + "Inbox" + FILE_EXT;
			}
		}
	}

	async setDefaultProjectIdForFilepath(filepath: string, defaultProjectId: string) {
		await upsertFile(filepath, defaultProjectId);
	}

	//Read all tasks from Cache
	async loadTasksFromCache() {
		try {
			const lts = await db.tasks.toArray();
			return lts.map(lt => lt.task);
		} catch (error) {
			log.error(`Error loading tasks from Cache: ${error}`);
			return [];
		}
	}

	// Overwrite and save all tasks to cache
	async saveTasksToCache(newTasks: ITask[]) {
		try {
			// This is tricky because we might lose LocalTask metadata.
			// But usually this is called after a full sync.
			const meta = await db.meta.get("sync");
			const deviceId = meta?.deviceId || "unknown";
			
			const tasksToPut = [];
			for (const t of newTasks) {
				tasksToPut.push({
					localId: `tt:${t.id}`,
					taskId: t.id,
					task: t,
					updatedAt: Date.now(),
					lastModifiedByDeviceId: deviceId,
					file: await this.getFilepathForTask(t.id) || "",
					source: "ticktick" as const,
					deleted: t.deleted === 1
				});
			}
			
			await db.tasks.bulkPut(tasksToPut);
		} catch (error) {
			log.error(`Error saving tasks to Cache: ${error}`);
			return false;
		}
	}

	//get Task titles
	async getTaskTitles(taskIds: string []): Promise<string []> {
		const lts = await db.tasks.where("taskId").anyOf(taskIds).toArray();
		let titles = lts.map(lt => lt.task.title);
		titles = titles.map((task: string) => {
			return this.plugin.taskParser.stripOBSUrl(task);
		});

		return titles;
	}

	async getDeletionItems(taskIds: string[]): Promise<DeletionItem[]> {
		const lts = await db.tasks.where("taskId").anyOf(taskIds).toArray();
		return lts.map(lt => ({
			title: this.plugin.taskParser.stripOBSUrl(lt.task.title),
			filePath: lt.file
		}));
	}

	async getFilepathForTask(taskId: string) {
		const lt = await db.tasks.where("taskId").equals(taskId).first();
		return lt?.file || null;
	}



	async getProjectIdForTask(taskId: string) {
		const lt = await db.tasks.where("taskId").equals(taskId).first();
		return lt?.task.projectId;
	}

	//Find project id by name
	async getProjectIdByNameFromCache(projectName: string) {
		try {
			const savedProjects = await getAllProjects();
			const targetProject = savedProjects.find((obj: IProject) => obj.name.toLowerCase() === projectName.toLowerCase());
			const projectId = targetProject ? targetProject.id : null;
			return (projectId);
		} catch (error) {
			log.error(`Error finding project ${projectName} from Cache file: ${error}`);
			return (false);
		}
	}

	async getProjectNameByIdFromCache(projectId: string /*, addFolder: boolean = false*/): Promise<string | undefined> {
		try {
			if (!projectId) {
				return getSettings().defaultProjectName;
			}
			const targetProject = await getProjectById(projectId);
			log.debug('getProjectNameByIdFromCache: ', targetProject);
			if (!targetProject) return undefined;
			// if (addFolder) {
			// 	const groupName = getProjectGroups().find(g => g.id == targetProject.groupId)?.name;
			// 	if (groupName) return groupName + '/' + targetProject.name;
			//
			return targetProject.name;
		} catch (error) {
			log.error(`Error finding project ${projectId} from Cache file: ${error}`);
		}
		return undefined;
	}

	//save projects data to json file
	async saveProjectsToCache(projects: IProject[]) {
		try {
			const inboxProject = {
				id: getSettings().inboxID,
				name: getSettings().inboxName
			} as IProject;
			projects.push(inboxProject);

			//TODO: this really need?
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

			//Check for List renames.
			for (const project of projects) {
				await this.checkProjectRename(project.id, project.name, project)
			}
			
			//save to Dexie
			const localProjects = projects.map(p => ({ id: p.id, project: p }));
			await db.projects.bulkPut(localProjects);
			
			return true;

		} catch (error) {
			log.error('Error on save projects: ', error);
			new Notice(`error on save projects: ${error}`);
		}
		return false;
	}

	async updateRenamedFilePath(oldpath: string, newpath: string) {
		try {
			// update path in db.tasks
			const lts = await db.tasks.where("file").equals(oldpath).toArray();
			for (const lt of lts) {
				await db.tasks.update(lt.localId, { file: newpath });
			}

			// update path in db.files
			await updateDbFilePath(oldpath, newpath);

		} catch (error) {
			log.error(`Error updating renamed file path to cache: ${error}`);
		}
	}

	protected async newEmptyFileMetadata(filepath: string, projectId?: string): Promise<FileDetail | undefined> {
		//There's a case where we are making an entry for an undefined file. Not sure where it's coming from
		// this should give us a clue.


		if (!filepath) {
			log.error('Attempt to create undefined FileMetaData Entry: ', filepath);
			return undefined;
		}
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (file instanceof TFolder) {
			log.error('Not adding ', filepath, ' to Metadata because it\'s a folder.');
			return undefined;
		}
		
		await upsertFile(filepath, projectId);
		return await this.getFileMetadata(filepath, projectId);
	}

	private async showFoundDuplicatesModal(app: App, plugin: TickTickSync, projects: IProject[]) {
		const myModal = new FoundDuplicateListsModal(app, plugin, projects, (result) => {
			const ret = result;
		});
		return await myModal.showModal();
	}

	/**
	 * Ensure files associated with the given project have correct filenames and metadata keys.
	 * If a file is found for the project but the key does not match the current project name,
	 * rename both the file on disk and the metadata key.
	 * @param ttProjectId The current project's ID.
	 * @param ttProjectName The current project's name.
	 * @param ttProject The current project object (from TickTick API).
	 */
	async checkProjectRename(ttProjectId: string, ttProjectName: string, ttProject?: IProject): Promise<void> {
		const fileMetadata = await this.getFileMetadatas();
		if (!fileMetadata) return;
		const projects = await getAllProjects();
		if (!projects || Object.keys(projects).length == 0) return;

		const project = projects.find(p => p.id === ttProjectId);
		if (!project) {
			// It's a new project - create a file entry for it with defaultProjectId set
			// Calculate the correct path based on keepProjectFolders setting
			let newFilePath: string;
			const folder = getDefaultFolder();
			const sanitize = (name: string): string =>
				name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
			const safeProjectName = sanitize(ttProjectName);

			if (getSettings().keepProjectFolders && ttProject?.groupId) {
				// Get the group name for folder organization
				const group = await db.projectGroups.get(ttProject.groupId);
				const groupName = group?.group?.name;

				if (groupName && groupName.trim().length > 0) {
					const safeGroupName = sanitize(groupName);
					const base = (folder ? folder + "/" : "");
					newFilePath = `${base}${safeGroupName}/${safeProjectName}${FILE_EXT}`;
				} else {
					// No valid group name, use flat structure
					newFilePath = (folder ? folder + "/" : "") + safeProjectName + FILE_EXT;
				}
			} else {
				// Flat structure
				newFilePath = (folder ? folder + "/" : "") + safeProjectName + FILE_EXT;
			}

			log.debug(`New project detected: ${ttProjectName} (${ttProjectId}). Creating file entry: ${newFilePath}`);
			await upsertFile(newFilePath, ttProjectId);
			return;
		}
		if (project?.name !== ttProjectName) {
			log.debug(`Project Name Changed from ${project?.name} to ${ttProjectName}`)

			// Find the existing file for this project
			const files = await getAllFiles();
			const currentFile = files.find(f => f.defaultProjectId === ttProjectId);

			let currentFilePath;

			if (!currentFile) {
				log.debug(`No file found for project ${ttProjectId}`);
				currentFilePath = await this.getFilepathForProjectId( ttProjectId );
				log.debug(`currentFilePath: ${currentFilePath}`);
				if (!currentFilePath) {
					log.debug(`No file found for project ${ttProjectId} and no default file found`);
					return
				}
				if (!currentFilePath) {
					log.debug(`No file found for project ${ttProjectId} and no default file found`);
					return
				}
			} else {
				currentFilePath = currentFile.path;
			}



			// Calculate the correct new file path
			const folder = getDefaultFolder();
			const sanitize = (name: string): string =>
				name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
			const safeProjectName = sanitize(ttProjectName);

			let newFilePath: string;
			if (getSettings().keepProjectFolders && ttProject?.groupId) {
				const group = await db.projectGroups.get(ttProject.groupId);
				const groupName = group?.group?.name;

				if (groupName && groupName.trim().length > 0) {
					const safeGroupName = sanitize(groupName);
					const base = (folder ? folder + "/" : "");
					newFilePath = `${base}${safeGroupName}/${safeProjectName}${FILE_EXT}`;
				} else {
					newFilePath = (folder ? folder + "/" : "") + safeProjectName + FILE_EXT;
				}
			} else {
				newFilePath = (folder ? folder + "/" : "") + safeProjectName + FILE_EXT;
			}

			log.debug(`Renaming project file from ${currentFilePath} to ${newFilePath}`);

			// Check if the file needs to be renamed
			if (currentFilePath !== newFilePath) {
				const vaultFile = this.app.vault.getAbstractFileByPath(currentFilePath);
				if (vaultFile && vaultFile instanceof TFile) {
					log.debug(`Renaming ${currentFilePath} to ${newFilePath}`);
					await this.app.vault.rename(vaultFile, newFilePath);
					log.debug(`Updating file path in database from ${currentFilePath} to ${newFilePath}`);
					await this.updateRenamedFilePath(currentFilePath, newFilePath);
				} else {
					log.warn(`File ${currentFilePath} not found in vault, updating database only`);
					await this.updateRenamedFilePath(currentFilePath, newFilePath);
				}
			}
		}
	}

	private async checkFilesForDuplicates(taskIds: Record<string, string>, duplicates: Record<string, string[]>) {
		const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
		const settings = getSettings();
		const otherduplicates: Record<string, string[]> = {};
		for (const file of markdownFiles) {
			try {
				const fileMap = new NewFileMap(this.plugin.app, this.plugin, file);
				await fileMap.init();

				if (fileMap.hasTasks(settings.enableFullVaultSync)) {
					const foundTaskIds = fileMap.getTasks();
					foundTaskIds.forEach(taskId => {
						if (!otherduplicates.hasOwnProperty(taskId)) {
							otherduplicates[taskId] = [];
						}
						otherduplicates[taskId].push(file.path);
					});
				}
			} catch (e) {
				log.error(`Failed to process file ${file.path}`, e);
			}
		}

		for (const taskId in otherduplicates) {
			const paths = otherduplicates[taskId];
			if (paths.length > 1) {
				if (!taskIds.hasOwnProperty(taskId)) {
					taskIds[taskId] = paths[0];
					duplicates[taskId] = paths.slice(1);
				} else {
					if (!duplicates.hasOwnProperty(taskId)) {
						duplicates[taskId] = [];
					}
					paths.forEach(path => {
						if (path !== taskIds[taskId] && !duplicates[taskId].includes(path)) {
							duplicates[taskId].push(path);
						}
					});
				}
			}
		}

		log.debug("Other Duplicates: ", otherduplicates);
		return duplicates;
	}
}
