import TickTickSync from '@/main';
import {
	App,
	MarkdownView,
	Notice,
	TFile,
	TFolder
} from 'obsidian';
import type { ITask } from '@/api/types/Task';
import ObjectID from 'bson-objectid';
import { TaskDeletionModal } from '@/modals/TaskDeletionModal';
import { getSettings } from '@/settings';
import { NewFileMap, type ITaskItemRecord } from '@/services/newFileMap';
import log from '@/utils/logger';
import { db } from "@/db/dexie";

export class SyncMan {
	private readonly app: App;
	private readonly plugin: TickTickSync;


	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
	}

	async syncTickTickToObsidian(): Promise<boolean> {
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
							await this.plugin.taskRepository.deleteTask(task.id);
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
	async updateTaskContent(filepath: string) {
		await this.plugin.taskOperationsService.updateTaskContentForFile(filepath);
	}

	///End of Test


	//Update TT after reconstructing the task
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
		const fileMap = new NewFileMap(this.app, this.plugin, file as TFile);
		await fileMap.init();

		const lines = fileMap.getFileLines().split('\n');
		for (let line = 0; line < lines.length; line++) {
			const lineText = lines[line];
			if (this.plugin.taskParser?.hasTickTickId(lineText) && this.plugin.taskParser?.hasTickTickTag(lineText)) {
				const taskId = this.plugin.taskParser.getTickTickId(lineText);
				const savedTask = await this.plugin.taskRepository.loadTaskById(taskId);
				if (taskId && savedTask) {
					savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
					const taskRecord = fileMap.getTaskRecord(taskId)
					//NB: lineNumber = 0 is only safe because we KNOW we have a task record.
					const lineTask = await this.plugin.taskParser?.convertLineToTask(lineText, 0, fileMap.getFilePath(), fileMap, taskRecord);
					const merged = { ...savedTask, ...lineTask };
					Object.assign(lineTask, merged);
					const updatedTask = <ITask>await this.plugin.tickTickRestAPI?.updateTask(lineTask);
					//let's go ahead and do the file while we're at it.
					const updatedLineText = await this.plugin.taskParser.convertTaskToLine(updatedTask, this.plugin.taskParser.getNumTabs(lineText))
					fileMap.updateTask(updatedTask, updatedLineText )
					await this.plugin.taskRepository.upsertTask(updatedTask, null, Date.now());
				}
			}
		}
		const fileLines = fileMap.getFileLines()
		await this.app.vault.process(file as TFile, (data) => {
			data = fileLines
			return data;
		});
	}

	private async confirmDeletion(taskIds: string[], reason: string) {
		const items = await this.plugin.cacheOperation?.getDeletionItems(taskIds);


		const myModal = new TaskDeletionModal(this.app, items, reason, (result) => {
		});
		const bConfirmation = await myModal.showModal();

		return bConfirmation;
	}

	async handleTaskItem(lineText: string, fileMap: NewFileMap, lineNumber: number | undefined) {
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

		// Verify this is a genuine task item, not note-level content.
		if (lineNumber !== undefined) {
			const fileLines = fileMap.getFileLines().split('\n');
			for (let i = lineNumber - 1; i >= 0; i--) {
				const ancestorLine = fileLines[i];
				if (this.plugin.taskParser.isMarkdownTask(ancestorLine) && this.plugin.taskParser.hasTickTickId(ancestorLine)) {
					const ancestorTabs = this.plugin.taskParser.getNumTabs(ancestorLine);
					if (!this.plugin.taskParser.isTaskItem(lineText, ancestorTabs)) {
						return false;
					}
					break;
				}
			}
		}

		const parentID = currentObject.parentId;
		const itemId = currentObject.ID;

		const newItem = this.plugin.taskParser?.taskFromLine(lineText);

		const parentTask = await this.plugin.taskRepository.loadTaskById(parentID);
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
		await this.plugin.taskRepository.upsertTask(parentTask, filepath, Date.now());
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


}
