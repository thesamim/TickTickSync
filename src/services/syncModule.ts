import TickTickSync from '@/main';
import {
	App,
	Editor,
	type EditorPosition,
	type MarkdownFileInfo,
	MarkdownView,
	Notice,
	TFile,
	TFolder
} from 'obsidian';
import type { ITask } from '@/api/types/Task';
import ObjectID from 'bson-objectid';
import type { TaskDetail } from '@/services/cacheOperation';
import { DeletionItem, TaskDeletionModal } from '@/modals/TaskDeletionModal';
import { getSettings } from '@/settings';
import { FileMap, type ITaskItemRecord } from '@/services/fileMap';
import log from '@/utils/logger';
import type { DBData, LocalTask } from '@/db/schema';
import { db } from "@/db/dexie";


type deletedTask = {
	taskId: string,
	projectId: string
}

export class SyncMan {
	private readonly app: App;
	private readonly plugin: TickTickSync;


	constructor(app: App, plugin: TickTickSync) {
		//super(app,settings,tickTickRestAPI,ticktickSyncAPI,taskParser,cacheOperation);
		this.app = app;
		this.plugin = plugin;
	}


	async findMissingTaskIds(currentContent: string, taskDetails: TaskDetail[], filePath: string) {

		// Extract all taskIds from the currentContent, considering the specific structure.
		const regex = /%%\[ticktick_id::\s*([a-zA-Z0-9]+)\]%%/gi;
		const matches = currentContent.matchAll(regex);
		const existingTaskIds = new Set([...matches].map((match) => match[1].toLowerCase()));
		// Find taskIds in the tasks list that are not present in the existingTaskIds set.
		// Filter and extract taskIds from taskDetails
		let missingTaskIds = taskDetails
			.filter((taskDetail) => !existingTaskIds.has(taskDetail.taskId.toLowerCase()))
			.map((taskDetail: TaskDetail) => taskDetail.taskId);// Explicitly create an array of strings

		//ok, but if they're just being moved? See if we can find them elsewhere first.
		//
		if (missingTaskIds && missingTaskIds.length > 0) {
			let saveTheseTasks: string[] = [];
			for (const taskId of missingTaskIds) {
				const location = await this.plugin.cacheOperation?.getFilepathForTask(taskId);
				if (location && location != filePath) {
					log.debug('Task found in different file:', taskId, location);
					saveTheseTasks.push(taskId);
				}
			}
			// log.debug("== saved:", saveTheseTasks)
			missingTaskIds = missingTaskIds
				.filter((taskId) => {
						return !saveTheseTasks.includes(taskId);
					}
				);
			// log.debug("==", filePath, "sanitized", missingTaskIds)
		}
		// else {
		// 	log.debug("== nothing missing.")
		// }
		return missingTaskIds;
	}

	/**
	 * @deprecated Use TaskModificationDetector.checkLineForNewTask() instead
	 * This method will be removed in a future version
	 */
	async lineNewContentTaskCheck(editor: Editor, view: MarkdownView | MarkdownFileInfo): Promise<boolean> {
		//const editor = this.app.workspace.activeEditor?.editor
		//const view =this.app.workspace.getActiveViewOfType(MarkdownView)
		const filepath = view.file?.path;
		const fileContent = view?.data;
		const cursor = editor.getCursor();
		const line = cursor.line;
		const linetxt = editor.getLine(line);
		let before = fileContent?.length;
		const fileMap = new FileMap(this.app, this.plugin, view.file);
		await fileMap.init(fileContent);
		await this.addTask(linetxt, line, editor, cursor, fileMap);
		let after = fileContent?.length;
		// log.debug(" : ", before, after, (before != after))
		return (before != after);
	}

	async addTask(lineTxt: string, line: number, editor: Editor | null, cursor: EditorPosition | null, fileMap: FileMap): Promise<void> {
		//Add task
		if (!lineTxt || lineTxt.length == 0) {
			return;
		}
		log.error("syncmodule addTask called.")

		if ((!this.plugin.taskParser.hasTickTickId(lineTxt) && this.plugin.taskParser.hasTickTickTag(lineTxt))) {
			//Whether #ticktick is included, but not ticktickid: Task just added.
			try {

				const currentTask = await this.plugin.taskParser.convertLineToTask(lineTxt, line, fileMap.getFilePath(), fileMap, null);
				const newTask = await this.plugin.tickTickRestAPI?.createTask(currentTask) as ITask;
				if (currentTask.parentId) {
					let parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(currentTask.parentId);
					parentTask = this.plugin.taskParser.addChildToParent(parentTask, currentTask.parentId);
					parentTask = await this.plugin.tickTickRestAPI?.updateTask(parentTask);
					await this.plugin.cacheOperation?.updateTaskToCache(parentTask, null, Date.now());
				}
				const ticktick_id = newTask.id;
				//log.debug(newTask);
				new Notice(`new task ${newTask.title} id is ${newTask.id}`);

				//If the task is completed
				if (currentTask.status != 0) {
					await this.plugin.tickTickRestAPI?.CloseTask(newTask.id, newTask.projectId);
					await this.plugin.cacheOperation?.closeTaskToCacheByID(ticktick_id);

				}

				//Save the data that TickTick Doesn't know about.
				newTask.dateHolder = currentTask.dateHolder;

				//Get TickTickID and links after updating.
				await this.updateTaskLine(newTask, lineTxt, editor, cursor, line, fileMap);

				//we want the line as it is in Obsidian.
				const taskRecord = fileMap.getTaskRecord(newTask.id);
				const taskString = taskRecord.task;
				const stringToHash = taskString + this.plugin.taskParser.getNoteString(taskRecord, newTask.id);
				newTask.lineHash = await this.plugin.taskParser?.getLineHash(stringToHash);
				await this.plugin.cacheOperation?.appendTaskToCache(newTask, fileMap.getFilePath());
				await this.plugin.saveSettings();
			} catch (error) {
				log.error('Error adding task:', error);
				log.error(`The error occurred in file: ${fileMap.getFilePath()}`);
			}

		}
	}





	/**
	 * @deprecated Use TaskOperationsService.closeTask() instead
	 * This method will be removed in a future version
	 */
	// Close a task by calling API and updating JSON file
	async closeTask(taskId: string): Promise<void> {
		try {
			let projectId = await this.plugin.cacheOperation?.closeTaskToCacheByID(taskId);
			await this.plugin.tickTickRestAPI?.CloseTask(taskId, projectId);
			await this.plugin.saveSettings();
			new Notice(`Task ${taskId} is closed.`);
		} catch (error) {
			log.error('Error closing task:', error);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}

	/**
	 * @deprecated Use TaskOperationsService.reopenTask() instead
	 * This method will be removed in a future version
	 */
	//open task
	async reopenTask(taskId: string): Promise<void> {
		try {
			let projectId = await this.plugin.cacheOperation?.reopenTaskToCacheByID(taskId);
			await this.plugin.tickTickRestAPI?.OpenTask(taskId, projectId);
			await this.plugin.fileOperation.uncompleteTaskInTheFile(taskId);

			await this.plugin.saveSettings();
			new Notice(`Task ${taskId} is reopened.`);
		} catch (error) {
			log.error('Error opening task:', error);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}

	/**
	 * Delete the task with the specified ID from the task list and update the JSON file
	 * @param taskIds array of task IDs to be deleted
	 * @returns Returns the successfully deleted task ID array
	 */
	async deleteTasksByIds(taskIds: string[]): Promise<string[]> {
		const deletedTaskIds = [];

		const bConfirm = await this.confirmDeletion(taskIds, 'The tasks were removed from the file');
		if (!bConfirm) {
			new Notice('Tasks will not be deleted. Please rectify the issue before the next sync.', 5000);
			return [];
		}

		for (const taskId of taskIds) {
			try {
				let response;
				let projectId = await this.plugin.cacheOperation?.getProjectIdForTask(taskId);
				if (projectId) {
					response = await this.plugin.tickTickRestAPI?.deleteTask(taskId, projectId);
				}
				if (response) {
					//log.debug(`Task ${taskId} deleted successfully`);
					new Notice(`Task ${taskId} is deleted.`);
				}
				//TODO: Verify that we are not over deleting.
				//We may end up with stray tasks, that are not in ticktick. if we're here, just delete them anyway.
				deletedTaskIds.push(taskId); // Add the deleted task ID to the array

			} catch (error) {
				log.error(`Failed to delete task ${taskId}: ${error}`);
				// You can add better error handling methods, such as throwing errors or logging here, etc.
			}
		}

		if (!deletedTaskIds.length) {
			if (getSettings().debugMode) {
				log.debug('Task not deleted:', deletedTaskIds);
			}
			return [];
		}

		await this.plugin.cacheOperation?.deleteTaskFromCacheByIDs(deletedTaskIds); // Update JSON file
		await this.plugin.saveSettings();
		//log.debug(`A total of ${deletedTaskIds.length} tasks were deleted`);


		return deletedTaskIds;
	}

	// Synchronize completed task status to Obsidian file
	async syncCompletedTaskStatusToObsidian(unSynchronizedEvents) {
		// Get unsynchronized events
		//log.debug(unSynchronizedEvents)
		try {

			// Handle unsynchronized events and wait for all processing to complete
			const processedEvents = [];
			for (const e of unSynchronizedEvents) { //If you want to modify the code so that completeTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
				//log.debug(`Completing ${e.object_id}`)
				await this.plugin.fileOperation.completeTaskInTheFile(e.object_id);
				await this.plugin.cacheOperation?.closeTaskToCacheByID(e.object_id);
				new Notice(`Task ${e.object_id} is closed.`);
				processedEvents.push(e);
			}

			// Save events to the local database."
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			//TODO: This is just wrong. Probably delete this function or fix this~
			await this.plugin.cacheOperation?.appendTaskToCache(processedEvents);
			await this.plugin.saveSettings();


		} catch (error) {
			log.error('Error synchronizing task status:', error);
		}
	}

	//TODO: Determine deletion candidate
	async syncUncompletedTaskStatusToObsidian(unSynchronizedEvents) {

		//log.debug(unSynchronizedEvents)

		try {

			// Handle unsynchronized events and wait for all processing to complete
			const processedEvents = [];
			for (const e of unSynchronizedEvents) { //If you want to modify the code so that uncompleteTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
				//log.debug(`uncheck task: ${e.object_id}`)
				await this.plugin.fileOperation.uncompleteTaskInTheFile(e.object_id);
				await this.plugin.cacheOperation?.reopenTaskToCacheByID(e.object_id);
				new Notice(`Task ${e.object_id} is reopened.`);
				processedEvents.push(e);
			}


			// Merge new events into existing events and save to JSON
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			//TODO: This is just wrong. Probably delete this function or fix this!
			await this.plugin.cacheOperation?.appendTaskToCache(processedEvents);
			await this.plugin.saveSettings();
		} catch (error) {
			log.error('Error synchronizing task status:', error);
		}
	}


	//TODO: Determine deletion candidate

	/**
	 * @deprecated Use VaultSyncCoordinator.syncVaultWithDatabase() instead
	 * This method will be removed in a future version
	 */
	/*
	 * Synchronizes the tasks between TickTick and Obsidian.
	 * //TODO: split this function into smaller functions
	 * return:
	 *  true if the function is in the process of modifying files
	 *  false otherwise
	 */
	async syncVaultWithDexie(): Promise<void> {
		const tasks = await db.tasks.toArray();
		let syncTag = getSettings().SyncTag?.toLowerCase();
		if (syncTag && syncTag.includes('/')) {
			syncTag = syncTag.replace(/\//g, '-');
		}
		const syncProject = getSettings().SyncProject;
		const andOr = getSettings().tagAndOr;

		// Group tasks by file
		const fileGroups: Map<string, { toAdd: ITask[], toUpdate: ITask[], toDelete: ITask[] }> = new Map();
		const dbUpdates: { localId: string, changes: Partial<LocalTask> }[] = [];

		const projectIdToFilepathCache: Map<string, string> = new Map();

		for (const lt of tasks) {
			const task = lt.task;
			const matchesFilter = this.matchesFilter(task, syncTag, syncProject, andOr);

			let targetFile = lt.file;
			if (!targetFile && matchesFilter && !lt.deleted) {
				// Determine target file for new tasks
				if (projectIdToFilepathCache.has(task.projectId)) {
					targetFile = projectIdToFilepathCache.get(task.projectId)!;
				} else {
					targetFile = await this.plugin.cacheOperation.getFilepathForProjectId(task.projectId);
					if (!targetFile) {
						targetFile = await this.plugin.cacheOperation.getFilepathForProjectId(getSettings().defaultProjectId);
					}
					if (targetFile) {
						projectIdToFilepathCache.set(task.projectId, targetFile);
					}
				}
			}

			if (!targetFile) continue;

			// Normalize targetFile to existing mapping if it only differs by case
			if (lt.file && lt.file.toLowerCase() === targetFile.toLowerCase()) {
				targetFile = lt.file;
			}

			if (!fileGroups.has(targetFile)) {
				fileGroups.set(targetFile, { toAdd: [], toUpdate: [], toDelete: [] });
			}
			const group = fileGroups.get(targetFile)!;

			if (lt.deleted) {
				if (lt.file) {
					group.toDelete.push(task);
				}
			} else if (matchesFilter) {
				const isNew = !lt.file;
				const hasChanged = lt.updatedAt > (lt.lastVaultSync || 0);
				const fileMoved = lt.file && lt.file !== targetFile;

				if (isNew) {
					group.toAdd.push(task);
					// Update Dexie with the chosen file
					dbUpdates.push({ localId: lt.localId, changes: { file: targetFile, lastVaultSync: Date.now() } });
				} else if (fileMoved) {
					// Task moved to a different file (project change)
					// We need to delete it from the old file and add it to the new one
					const oldFile = lt.file;
					if (!fileGroups.has(oldFile)) {
						fileGroups.set(oldFile, { toAdd: [], toUpdate: [], toDelete: [] });
					}
					fileGroups.get(oldFile)!.toDelete.push(task);
					
					group.toAdd.push(task);
					dbUpdates.push({ localId: lt.localId, changes: { file: targetFile, lastVaultSync: Date.now() } });
				} else if (hasChanged) {
					group.toUpdate.push(task);
					dbUpdates.push({ localId: lt.localId, changes: { lastVaultSync: Date.now() } });
				}
			} else if (lt.file) {
				// No longer matches filter, remove from vault
				group.toDelete.push(task);
			}
		}
		log.debug("FileGroups", JSON.stringify(fileGroups,null,4));

		// 1. Handle Deletions (Grouped confirmation)
		const tasksToConfirmDeletionIds: string[] = [];
		for (const group of fileGroups.values()) {
			tasksToConfirmDeletionIds.push(...group.toDelete.map(t => (t.id || (t as any).taskId)));
		}

		let proceedWithDeletions = true;
		if (tasksToConfirmDeletionIds.length > 0) {
			proceedWithDeletions = await this.confirmDeletion(tasksToConfirmDeletionIds, 'tasks deleted from TickTick');
			if (!proceedWithDeletions) {
				new Notice('Tasks will not be deleted from vault.', 5000);
			}
		}

		for (const [filePath, group] of fileGroups) {
			const file = this.app.vault.getAbstractFileByPath(filePath);

			// 1. Handle Deletions (Delayed delete with tombstones: the record stays in Dexie)
			if (proceedWithDeletions && group.toDelete.length > 0) {
				if (file instanceof TFile) {
					await this.plugin.fileOperation?.deleteTasksFromSpecificFile(file, group.toDelete, false);
				}
				for (const task of group.toDelete) {
					// Clear the file field since it's gone from vault, but KEEP the record in Dexie as a tombstone
					const lt = tasks.find(t => t.taskId === (task.id || (task as any).taskId));
					if (lt) {
						dbUpdates.push({ localId: lt.localId, changes: { file: "" } });
					}
				}
			}

			// 2. Handle Updates
			if (group.toUpdate.length > 0) {
				await this.plugin.fileOperation?.synchronizeToVault(filePath, group.toUpdate, true);
			}

			// 3. Handle Additions
			if (group.toAdd.length > 0) {
				await this.plugin.fileOperation?.synchronizeToVault(filePath, group.toAdd, false);
			}
		}

		// Bulk update DB at the end
		if (dbUpdates.length > 0) {
			await db.transaction("rw", db.tasks, async () => {
				for (const update of dbUpdates) {
					await db.tasks.update(update.localId, update.changes);
				}
			});
		}
	}

	private matchesFilter(task: ITask, syncTag?: string, syncProject?: string, andOr?: number): boolean {
		if (!syncTag && !syncProject) return true;

		const hasTag = syncTag ? task.tags?.some(t => t.toLowerCase() === syncTag) : false;
		const hasProject = syncProject ? task.projectId === syncProject : false;

		if (syncTag && syncProject) {
			return andOr === 1 ? (hasTag && hasProject) : (hasTag || hasProject);
		}
		return hasTag || hasProject;
	}

	async syncTickTickToObsidian(): Promise<boolean> {
		//****************
		//****************
		//Tasks in Obsidian, not in TickTick: upload
		//Tasks in TickTick, not in Obsidian: Download
		//Tasks in both: check for updates.
		try {
			const res = await this.plugin.saveProjectsToCache();
			if (!res) {
				log.error('probable network connection error.');
				return false;
			}

			let bModifiedFileSystem = false;
			const allResources = await this.plugin.tickTickRestAPI?.getAllResources();
			if (!allResources) {
				log.error('probable network connection error.');
				return false;
			}

			if (allResources.projectGroups) {
				await db.projectGroups.clear();
				await db.projectGroups.bulkPut(allResources.projectGroups.map(g => ({ id: g.id, group: g })));
			}

			const allTaskDetails = allResources['syncTaskBean'];

			let tasksFromTickTic = allTaskDetails.update;
			let deletedTasks = allTaskDetails.delete;
			// this.dumpArray("tick Tick ", tasksFromTickTic)
			// this.dumpArray("deleted  ", deletedTasks)

			//TODO: Filtering deleted tasks would take an act of congress. Just warn the user in Readme.

			let syncTag: string = getSettings().SyncTag;
			if (syncTag) {
				//TODO: In the fullness of time we need to look at Tag Labels not Tag Names.
				//because TickTick only stores lowercase tags.;
				syncTag = syncTag.toLowerCase();
				if (syncTag.includes('/')) {
					syncTag = syncTag.replace(/\//g, '-');
				}
			}
			//Both Tag and Project limiting present
			if (syncTag && getSettings().SyncProject) {

				//Check for AND/OR presences to determine processing.
				const AndOrIndicator = getSettings().tagAndOr;

				// AND selected. They want only tasks with the tag in the project.
				if (AndOrIndicator == 1) {
					let tasksWithTag;
					tasksWithTag = tasksFromTickTic.filter(task => {
						tasksWithTag = task.tags?.includes(syncTag); //because TickTick only stores lowercase tags.
						return tasksWithTag;
					});
					if (tasksWithTag) {
						tasksFromTickTic = tasksWithTag.filter(task => {
							return task.projectId === getSettings().SyncProject;
						});
					}
				} else {
					//OR they want tasks with either the tag or the project
					let tasksWithTag = tasksFromTickTic.filter(task => {
						return task.tags?.includes(syncTag);
					});
					let tasksInProject = tasksFromTickTic.filter(task => {
						return task.projectId === getSettings().SyncProject;
					});

					tasksFromTickTic = [...tasksWithTag, ...tasksInProject].reduce((acc, current) => {
						const existing = acc.find(item => item.id === current.id);
						if (existing) {
							Object.assign(existing, current);
						} else {
							acc.push(current);
						}
						return acc;
					}, []);
				}
			} else {
				//Either tag or project is present
				//Will process whichever one is present.
				if (syncTag || getSettings().SyncProject) {
					tasksFromTickTic = tasksFromTickTic.filter(task => {
						const hasTag = task.tags?.includes(syncTag);
						const hasProjectId = task.projectId === getSettings().SyncProject;
						return hasTag || hasProjectId;
					});
				}
			}

			// this.dumpArray('== remote:', tasksFromTickTic);
			let tasksInCache = await this.plugin.cacheOperation?.loadTasksFromCache();
			// this.dumpArray("cache", tasksInCache)

			if (getSettings().debugMode) {
				if (tasksFromTickTic) {
					log.debug('We have: ', tasksFromTickTic.length, ' recent tasks on ' + this.plugin.tickTickRestAPI?.api?.apiUrl);
					const closedTasks = tasksFromTickTic.filter(task => task.status != 0);
					const openTasks = tasksFromTickTic.filter(task => task.status === 0);
					log.debug('openTasks', openTasks.length, 'closedTasks', closedTasks.length);
				} else {
					log.debug('No tasks found.');
				}
				if (tasksInCache) {
					log.debug('There are: ', tasksInCache.length, ' tasks in Cache.');
				} else {
					log.debug('There are no tasks in cache.');
				}

			}


			// this.dumpArray('== local:', tasksInCache);

			if (tasksInCache) {
				tasksInCache = tasksInCache.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
				// log.debug("local tasks: ", tasksInCache.length);
			} else {
				tasksInCache = [];
			}
			if (tasksFromTickTic) {
				tasksFromTickTic = tasksFromTickTic.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
				// log.debug("local tasks: ", tasksInCache.length);
			} else {
				tasksFromTickTic = [];
			}

			// Check for new tasks in TickTick
			//TODO: Pretty sure this is a corner case, but if we have tasks in cache, but nothing in fileMetadata, then
			//      the files got deleted at some point. We want to force creation of the files....
			//      VERIFY: This doesn't bite us in the ass.

			let newTickTickTasks = [];
 		const filesMetadata = await this.plugin.cacheOperation.getFileMetadatas();
 		if (Object.keys(filesMetadata).length === 0) {
				newTickTickTasks = tasksFromTickTic;
			} else {
				newTickTickTasks = tasksFromTickTic.filter(task => !tasksInCache.some(t => t.id === task.id));
			}

			// this.dumpArray('== Add to Obsidian:', newTickTickTasks);
			//download remote only tasks to Obsidian
			if (newTickTickTasks.length > 0) {
				//New Tasks, create their dateStruct
				newTickTickTasks.forEach((newTickTickTask: ITask) => {
					this.plugin.dateMan?.addDateHolderToTask(newTickTickTask);
				});
				// Group by file
				const tasksByFile = new Map<string, ITask[]>();
				for (const task of newTickTickTasks) {
					let taskFile = await this.plugin.cacheOperation.getFilepathForProjectId(task.projectId);
					if (!taskFile) {
						taskFile = await this.plugin.cacheOperation.getFilepathForProjectId(getSettings().defaultProjectId);
					}
					if (taskFile) {
						if (!tasksByFile.has(taskFile)) tasksByFile.set(taskFile, []);
						tasksByFile.get(taskFile)!.push(task);
					}
				}
				for (const [taskFile, tasks] of tasksByFile) {
					await this.plugin.fileOperation?.synchronizeToVault(taskFile, tasks, false);
				}
				bModifiedFileSystem = true;
			}


			// Check for deleted tasks in TickTick
			const deletedTickTickTasks = tasksInCache.filter(task => !tasksFromTickTic.some(t => t.id === task.id));
			// this.dumpArray('deletedTickTickTasks Deleted tasks in TickTick:', deletedTickTickTasks);

			const reallyDeletedTickTickTasks = deletedTickTickTasks.filter(task => deletedTasks.some(t => t.taskId === task.id));
			// this.dumpArray('== reallyDeletedTickTickTasks deleted from TickTick:', reallyDeletedTickTickTasks);


			if (reallyDeletedTickTickTasks.length > 0) {
				const taskTitlesForConfirmation = reallyDeletedTickTickTasks.map((task: ITask) => task.id);

				const bConfirm = await this.confirmDeletion(taskTitlesForConfirmation, 'tasks deleted from TickTick');

				if (bConfirm) {
					//Need to have deletes in parentage order else everything goes Tango Uniform
					reallyDeletedTickTickTasks.sort((left, right) => {
						if (!left.parentId && right.parentId) {
							return -1;
						} else if (left.parentId && !right.parentId) {
							return 1;
						} else {
							return 0;
						}
					});
					for (const task of reallyDeletedTickTickTasks) {
						try {
							await this.plugin.fileOperation?.deleteTaskFromFile(task);
						} catch (error) {
							//Assume that the file is goine, but we're trying to clear cache anyway.
							log.debug('Task deletion failed.', error);
						}
						try {
							await this.plugin.cacheOperation?.deleteTaskFromCache(task.id);
							bModifiedFileSystem = true;
						} catch (error) {
							log.debug('Task deletion failed.', error);
							bModifiedFileSystem = true;
						}

					}

				}
			}


			// Check for new tasks in Obsidian
			const newObsidianTasks = tasksInCache.filter(task => !tasksFromTickTic.some(t => t.id === task.id));
			const reallyNewObsidianTasks = newObsidianTasks.filter(task => reallyDeletedTickTickTasks.some(t => t.taskId === task.id));
			//this.dumpArray('== Add to TickTick:', reallyNewObsidianTasks);
			//upload local only tasks to TickTick

			for (const task of reallyNewObsidianTasks) {
				await this.plugin.tickTickRestAPI?.createTask(task);
				bModifiedFileSystem = true;
			}


			// Check for updated tasks in TickTick
			const tasksUpdatedInTickTick = tasksFromTickTic.filter(task => {
				const modifiedTask = tasksInCache.find(t => t.id === task.id);
				return modifiedTask && (new Date(modifiedTask.modifiedTime) < new Date(task.modifiedTime));
			});
			// this.dumpArray('Tasks Updated in TickTick:', tasksUpdatedInTickTick);


			// Check for updated tasks in Obsidian
			const tasksUpdatedInObsidian = tasksInCache.filter(task => {
				const modifiedTask = tasksFromTickTic.find(t => t.id === task.id);
				return modifiedTask && (new Date(modifiedTask.modifiedTime) > new Date(task.modifiedTime));
			});
			// this.dumpArray('Tasks updated in Obsidian:', tasksUpdatedInObsidian);

			//   // Check for updated tasks in Obsidian
			//   const updatedObsidianTasks = tasksInCache.filter(task => {
			//     const tickTickTask = tasksFromTickTic.find(t => t.id === task.id);
			//     return tickTickTask && ((tickTickTask.title !== task.title) || (tickTickTask.modifiedTime !== task.modifiedTime));
			// });
			// //this.dumpArray('updatedObsidianTasks:', updatedObsidianTasks);

			//If they are updated in ticktick more recently, update from ticktick to obsidian

			const recentUpdates = tasksUpdatedInTickTick.filter(tickTask => {
				const obsTask = tasksUpdatedInObsidian.find(obsTask => obsTask.id === tickTask.id);
				if (obsTask && (obsTask.modifiedTime === undefined)) {
					//No mod time on obs side: ticktick got modified.
					return true;
				} else {
					return obsTask && new Date(tickTask.modifiedTime) > new Date(obsTask.modifiedTime);
				}
			});


			if (recentUpdates.length > 0) {
				// Group by file
				const tasksByFile = new Map<string, ITask[]>();
				for (const task of recentUpdates) {
 				const taskFile = await this.plugin.cacheOperation.getFilepathForTask(task.id);
					if (taskFile) {
						if (!tasksByFile.has(taskFile)) tasksByFile.set(taskFile, []);
						tasksByFile.get(taskFile)!.push(task);
					}
				}
				for (const [taskFile, tasks] of tasksByFile) {
					await this.plugin.fileOperation?.synchronizeToVault(taskFile, tasks, true);
				}
				bModifiedFileSystem = true;


				await this.plugin.saveSettings();
				//If we just farckled the file system, stop Syncing to avoid race conditions.
				if (getSettings().debugMode) {
					log.debug(bModifiedFileSystem ? 'File System Modified.' : 'No synchronization changes.');
				}
			}
			return bModifiedFileSystem;

		} catch (err) {
			log.error('An error occurred while synchronizing:', err);
		}
		return false;
	}


	// Synchronize completed task status to Obsidian file

	dumpArray(which: string, arrayIn: ITask[]) {
		log.debug(which, arrayIn);
		// arrayIn.forEach(item => {
		// 		log.debug(' ', item);
		// 		// log.debug(' ',
		// 		// 	item.id, '--',
		// 		// 	// item.title,
		// 		// 	// item.parentId,
		// 		// 	// item.childIds,
		// 		// 	'modification time: ', item.modifiedTime);
		// 	}
		// );

	}

	async backupTickTickAllResources() {
		try {
			// log.debug("backing up.")
			// if (this.plugin.tickTickSyncAPI) {
			// log.debug("It's defined", this.plugin.tickTickSyncAPI)
			// }
			let bkupFolder = getSettings().bkupFolder;
			if (bkupFolder[bkupFolder.length - 1] != '/') {
				bkupFolder += '/';
			}
			const now: Date = new Date();
			const timeString: string = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;

			const name = bkupFolder + 'ticktick-backup-' + timeString + '.csv';
			log.debug('Creating Backup: ', name);

			const bkupData = await this.plugin.tickTickRestAPI?.exportData();


			if (bkupData) {
				await this.app.vault.create(name, bkupData);
				//log.debug(`ticktick backup successful`)
				new Notice(`TickTick backup data is saved in the path ${name}`);
			}
		} catch (error) {
			log.error('An error occurred while creating TickTick backup', error);
			new Notice('An error occurred while creating TickTick backup' + error, 5000);
		}

	}

	/**
	 * @deprecated Use TaskOperationsService.updateTaskContentForFile() instead
	 * This method will be removed in a future version
	 */
	//After renaming the file, check all tasks in the file and update all links.
	async updateTaskContent(filepath: string) {
		const metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath);
		if (!metadata || !metadata.TickTickTasks) {
			return;
		}
		const taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
		try {
			for (const taskDetail of metadata.TickTickTasks) {
				const task = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetail.taskId);
				if (task) {


					task.title = task.title + ' ' + taskURL;
					const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(task);
					//Cache the title without the URL because that's what we're going to do content compares on.
					updatedTask.title = await this.plugin.taskParser?.stripOBSUrl(updatedTask.title);
					await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, null, Date.now());
				} else {
					const error = 'Task: ' + taskDetail + 'from file: ' + filepath + 'not found.';
					throw new Error(error);
				}
			}
		} catch (error) {
			log.error('An error occurred in updateTaskDescription:', error);
		}


	}

	///End of Test

	async forceUpdates(file_path: string) {
		let file;
		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path);
			if ((file) && (file instanceof TFolder)) {
				//leave folders alone.
				return false;
			}
			if (!file) {
				log.error(`File: ${file_path} not found. Removing from Meta Data`);
				await this.plugin.cacheOperation?.deleteFilepathFromMetadata(file_path);
				return false;
			}
		} else {
			throw new Error('No file path provided');
		}
		const fileMap = new FileMap(this.app, this.plugin, file);
		await fileMap.init();

		const lines = fileMap.getFileLines().split('\n');
		for (let line = 0; line < lines.length; line++) {
			const lineText = lines[line];
			if (this.plugin.taskParser?.hasTickTickId(lineText) && this.plugin.taskParser?.hasTickTickTag(lineText)) {
				const taskId = this.plugin.taskParser.getTickTickId(lineText);
				const savedTask = await this.plugin.cacheOperation.loadTaskFromCacheID(taskId);
				if (taskId && savedTask) {
					savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
					const taskRecord = fileMap.getTaskRecord(taskId)
					//NB: lineNumber = 0 is only safe because we KNOW we have a task record.
					const lineTask = await this.plugin.taskParser?.convertLineToTask(lineText, 0, fileMap.getFilePath(), fileMap, taskRecord);
					const merged = { ...savedTask, ...lineTask };
					Object.assign(lineTask, merged);
					const updatedTask = <ITask>await this.plugin.tickTickRestAPI?.updateTask(lineTask);
					await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, null, Date.now());
				}
			}
		}
	}

	//get the TickTick data into the task line.

	//Check if user moved the task.
	private async checkForMoves(taskId: string, filepath: string) {
		let projectMoved = false;
		const oldFilePath = await this.plugin.cacheOperation.getFilepathForTask(taskId);
		if (oldFilePath && oldFilePath !== filepath) {
			projectMoved = true;
		}
		return { projectMoved, oldFilePath };
	}



	private async confirmDeletion(taskIds: string[], reason: string) {
		const items = await this.plugin.cacheOperation?.getDeletionItems(taskIds);


		const myModal = new TaskDeletionModal(this.app, items, reason, (result) => {
		});
		const bConfirmation = await myModal.showModal();

		return bConfirmation;
	}

	async handleTaskItem(lineText: string, fileMap: FileMap, lineNumber: number | undefined) {
		if (lineText.contains("Copy Tasks from")) {
			log.debug("Copy Tasks from found.");
		}
		let modified = false;
		let added = false;
		//it's a task. Is it a task item?
		//is it a task at all?
		if (!this.plugin.taskParser?.isMarkdownTask(lineText)) {
			//Nah Brah. Bail.
			return false;
		}
		let currentObject: ITaskItemRecord;
		const lineItemId = this.plugin.taskParser.getLineItemId(lineText);
		if (lineItemId) {
			currentObject = fileMap.getTaskItemRecord(lineItemId);
		} else {
			if (lineNumber) {
				currentObject = fileMap.getTaskItemRecordByLine(lineNumber);
			}
		}
		if (!currentObject) {
			//a text line of no interest.
			log.warn('Item not found in file map: ', lineText);
			return false;
		}

		if ((!currentObject.parentId || currentObject.parentId === '' || currentObject.parentId.length < 1)) {
			return false;
		}

		const parentID = currentObject.parentId;
		const itemId = currentObject.ID;

		const newItem = this.plugin.taskParser?.taskFromLine(lineText);

		const parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(parentID);
		if (parentTask && parentTask.items) { //we have some items.
			if (itemId) {
				const oldItem = parentTask.items.find((item) => item.id == itemId);
				if (oldItem) {
					if (oldItem.title.trim() != newItem.description.trim() ||
						oldItem.status != (newItem?.status ? 2 : 0)) {
						oldItem.title = newItem?.description.trim();
						oldItem.status = newItem?.status ? 2 : 0;
						modified = true;
					}
				} else {
					//TODO: Assume that there's a timing issue, and assume that this item really needs to live
					log.warn('', newItem, 'not found in parent items. Forcibly adding...');
					parentTask.items.push({
						id: itemId,
						title: newItem?.description,
						status: newItem?.status ? 2 : 0
					});
					modified = true;
				}
			} else {
				const Oid = ObjectID();
				const OidHexString = Oid.toHexString();
				parentTask.items.push({
					id: OidHexString,
					title: newItem?.description,
					status: newItem?.status ? 2 : 0
				});
				const updatedItemContent = `${lineText} %%${OidHexString}%%`;
				//Update the line in the file.
				try {
					const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
					const editor = markDownView?.app.workspace.activeEditor?.editor;
					const from = { line: lineNumber, ch: 0 };
					const to = { line: lineNumber, ch: updatedItemContent.length };
					editor?.setLine(lineNumber, updatedItemContent);
				} catch (error) {
					log.error(`Error updating item: ${error}`);
				}
				added = true;
			}

		} else {
			if (getSettings().debugMode) {
				// log.debug(`parent didn't have items.`);
			}
		}

		if (modified || added) {
			//do the update mambo. cache and api.
			if (parentTask) {
				const filepath = fileMap.getFilePath();
				modified = await this.updateTask(parentTask, filepath);
			}
		}

		return modified;
	}

	private async updateTask(parentTask: ITask, filepath: string) {
		parentTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
		await this.plugin.cacheOperation?.updateTaskToCache(parentTask, filepath, Date.now());
		if (getSettings().fileLinksInTickTick !== 'noLink') {
			let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
			//If getSettings().fileLinksInTickTick === "noteLink") it's already been handled in
			//   convertLineToTask
			if (getSettings().fileLinksInTickTick === 'taskLink') {
				if (taskURL) {
					parentTask.title = parentTask.title + ' ' + taskURL;
				}
			}
		}
		log.debug("LFT ####. Title: ", parentTask.title)
		const result = await this.plugin.tickTickRestAPI?.updateTask(parentTask);
		const updateFailed = !result;
		new Notice(`Task ${parentTask.title} modified.`);
		return !updateFailed;
	}

	private findTaskOrItemByLineNumber(tasks, lineNumber) {
		for (let task of tasks) {
			if (lineNumber >= task.startLine && lineNumber <= task.endLine) {
				return task;
			}
		}
		return null; // Return null if no task or item is found for the given line number
	}



}
