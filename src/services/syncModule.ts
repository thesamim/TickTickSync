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
import { TaskDeletionModal } from '@/modals/TaskDeletionModal';
import { getSettings, updateProjectGroups } from '@/settings';
import { FileMap, type ITaskItemRecord } from '@/services/fileMap';
import log from '@/utils/logger';
import type { DBData, LocalTask } from '@/db/schema';
import { upsertTask } from '@/db/db';


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

	async deletedTaskCheck(file_path: string | null): Promise<void> {

		let file;
		let currentFileValue;
		let view;
		let filepath;

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path);
			if ((file) && (file instanceof TFolder)) {
				//leave folders alone.
				return;
			}
			filepath = file_path;
			if (file instanceof TFile) {
				currentFileValue = await this.app.vault.read(file);
			}
		} else {
			view = this.app.workspace.getActiveViewOfType(MarkdownView);
			//const editor = this.app.workspace.activeEditor?.editor
			file = this.app.workspace.getActiveFile();
			filepath = file?.path;
			//Use view.data instead of vault.read. vault.read is delayed
			currentFileValue = view?.data;
		}

		let fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath, null);
		// log.debug("fileMetaData: ", fileMetadata)
		if (!fileMetadata || !fileMetadata.TickTickTasks) {
			// log.debug('fileMetaData has no task')
			return;
		}


		let fileMetadata_TickTickTasks: TaskDetail[] = fileMetadata.TickTickTasks;
		if (currentFileValue) {
			const currentFileValueWithOutFileMetadata = currentFileValue.replace(/^---[\s\S]*?---\n/, '');
			const deletedTaskIds = await this.findMissingTaskIds(currentFileValueWithOutFileMetadata, fileMetadata_TickTickTasks, filepath);
			const numDeletedTasks = deletedTaskIds.length;
			if (numDeletedTasks > 0) {
				await this.deleteTasksByIds(deletedTaskIds);
				//update filemetadata so we don't try to delete items for deleted tasks.
				fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath, null);
				if (!fileMetadata || !fileMetadata.TickTickTasks) {
					return;
				}
				fileMetadata_TickTickTasks = fileMetadata.TickTickTasks;
			}
			//That's Tasks out of the way. Their items will be magically deleted.
			//Now go through all the items, if any are deleted, their tasks have to be updated.
			const deletedItems: string[] = [];
			for (const task of fileMetadata_TickTickTasks) {
				if (!task.taskItems) {
					continue;
				}
				for (const taskItem of task.taskItems) {
					if (!currentFileValueWithOutFileMetadata.includes(taskItem)) {
						deletedItems.push(taskItem);
					}
				}
				if (deletedItems.length > 0) {
					//this will remove items, update the file metadata and update the cache in one swell foop.
					try {
						let updatedTask = await this.plugin.cacheOperation?.removeTaskItem(fileMetadata, task.taskId, deletedItems);
						if (updatedTask) {
							let taskURL = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath);
							if (taskURL) {
								updatedTask.title = updatedTask.title + ' ' + taskURL;
							}
							let updateResult = await this.plugin.tickTickRestAPI?.UpdateTask(updatedTask);
						}
					} catch (error) {
						log.error('Task Item removal failed: ', error);
					}
				}
			}
			// log.debug("deleted items: ", deletedItems)

		} else {
			//We had a file. There is no content. User deleted ALL tasks, all items will be deleted as a side effect.
			let deletedTaskIDs = fileMetadata_TickTickTasks.map((taskDetail) => taskDetail.taskId);
			//But first check if the tasks are elsewhere.
			if (deletedTaskIDs.length > 0) {
				let saveTheseTasks: string[] = [];
				for (const taskId of deletedTaskIDs) {
					const location = this.plugin.cacheOperation?.getFilepathForTask(taskId);
					if (location && location != filepath) {
						log.debug('== found:', taskId, location);
						saveTheseTasks.push(taskId);
					}
				}
				// log.debug("== saved:", saveTheseTasks)
				deletedTaskIDs = deletedTaskIDs
					.filter((taskId) => {
							return !saveTheseTasks.includes(taskId);
						}
					);

			}
			//They're really really gone. RIP
			if (deletedTaskIDs.length > 0) {
				//TODO: Assuming that if they for real deleted everything, it will get caught on the next sync
				log.error('Content not readable.', currentFileValue, filepath, ' file could open elsewhere or deleted.');
				new Notice(`All content from ${file_path} APPEARS to have been removed.\n` +
					'If this is correct, please confirm task deletion. Otherwise, cancel task deletion.', 0);

				await this.deleteTasksByIds(deletedTaskIDs);
			}
		}

	}

	async findMissingTaskIds(currentContent: string, taskDetails: TaskDetail[], filePath: string) {

		// Extract all taskIds from the currentContent, considering the specific structure.
		const regex = /%%\[ticktick_id:: ([a-f0-9]{24})\]%%/g;
		const matches: RegExpMatchArray = currentContent.matchAll(regex);
		const existingTaskIds = new Set([...matches].map((match) => match[1]));
		// Find taskIds in the tasks list that are not present in the existingTaskIds set.
		// Filter and extract taskIds from taskDetails
		let missingTaskIds = taskDetails
			.filter((taskDetail) => !existingTaskIds.has(taskDetail.taskId))
			.map((taskDetail: TaskDetail) => taskDetail.taskId);// Explicitly create an array of strings

		//ok, but if they're just being moved? See if we can find them elsewhere first.
		//
		if (missingTaskIds && missingTaskIds.length > 0) {
			let saveTheseTasks: string[] = [];
			for (const taskId of missingTaskIds) {
				const location = this.plugin.cacheOperation?.getFilepathForTask(taskId);
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

		if ((!this.plugin.taskParser.hasTickTickId(lineTxt) && this.plugin.taskParser.hasTickTickTag(lineTxt))) {
			//Whether #ticktick is included, but not ticktickid: Task just added.
			try {

				const currentTask = await this.plugin.taskParser.convertLineToTask(lineTxt, line, fileMap.getFilePath(), fileMap, null);
				const newTask = await this.plugin.tickTickRestAPI?.AddTask(currentTask) as ITask;
				if (currentTask.parentId) {
					let parentTask = this.plugin.cacheOperation?.loadTaskFromCacheID(currentTask.parentId);
					parentTask = this.plugin.taskParser.addChildToParent(parentTask, currentTask.parentId);
					parentTask = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
					await this.plugin.cacheOperation?.updateTaskToCache(parentTask);
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

	async fullTextNewTaskCheck(file_path: string): Promise<boolean> {
		let file;
		let currentFileValue;
		let view;
		let filepath = null;
		let editor = null;
		let cursor = null;

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path);
			if ((file) && (file instanceof TFolder)) {
				//leave folders alone.
				return false;
			}
			if (file) {
				filepath = file_path;
			} else {
				log.error(`File: ${file_path} not found. Removing from Meta Data`);
				await this.plugin.cacheOperation?.deleteFilepathFromMetadata(file_path);
				return false;
			}
		} else {
			throw new Error('No file path provided');
			// const workspace = this.app.workspace;
			// view = workspace.getActiveViewOfType(MarkdownView);
			// editor = workspace.activeEditor?.editor;
			// file = workspace.getActiveFile();
			// filepath = file?.path;
			// //Use view.data instead of vault.read. vault.read is delayed
			// currentFileValue = view?.data;
		}
		const fileMap = new FileMap(this.app, this.plugin, file);
		await fileMap.init();

		if (getSettings().enableFullVaultSync) {
			await this.plugin.fileOperation?.addTickTickTagToFile(fileMap);
		}

		const lines = fileMap.getFileLines().split('\n');
		for (let line = 0; line < lines.length; line++) {
			const linetxt = lines[line];
			await this.addTask(linetxt, line, editor, cursor, fileMap);
		}
		return true;
	}

	//Deal with Tasks and Task Items here because they are single line entities.
	async lineModifiedTaskCheck(filepath: string | undefined, lineText: string, lineNumber: number | undefined, fileMap: FileMap): Promise<boolean> {
		let modified = false;
		if (getSettings().enableFullVaultSync) {
			//new empty metadata
			let metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath);
			//TODO: I'm pretty sure this is redundant. Don't feel like taking it out now because it's been here forever and it works.
			if (!metadata) {
				//But if we still don't have anything bail the F out.
				return false;
			}
			await this.plugin.saveSettings();
		}

		//check task
		let bHashCheckFailed;
		if (this.plugin.taskParser?.hasTickTickId(lineText) && this.plugin.taskParser?.hasTickTickTag(lineText)) {
			const lineTask_ticktick_id = this.plugin.taskParser.getTickTickId(lineText);
			//get notes if any
			const taskRecord = fileMap.getTaskRecord(lineTask_ticktick_id);

			if (!taskRecord) {
				log.error('Task Not Found in file map', fileMap.file, filepath, lineTask_ticktick_id);
				return false;
			}
			if (!taskRecord.task) {
				log.error('Task Not Found in file map', taskRecord, lineTask_ticktick_id);
				return false;
			}

			let taskNotes = '';
			if (taskRecord.taskLines && taskRecord.taskLines.length > 1) {
				taskNotes = this.plugin.taskParser.getNoteString(taskRecord, lineTask_ticktick_id);
			}

			const newHash = await this.plugin.taskParser?.getLineHash(lineText + taskNotes);
			//convertLineToTask has become a pretty expensive operation avoid it.
			//let's see if the saved task has a lineHash.

			const savedTask = this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask_ticktick_id);

			let projectMoved = false;
			let oldFilePath = '';
			if (savedTask) {
				if (savedTask.lineHash) {
					//it has one. Is it the same as this one being edited?
					if (newHash == savedTask.lineHash) {
						bHashCheckFailed = false;
						//but maybe the task moved. Check here.
						const __ret = await this.checkForMoves(lineTask_ticktick_id, filepath);
						projectMoved = __ret.projectMoved;
						oldFilePath = __ret.oldFilePath;
						const bParentchanged = (taskRecord.parentId ? taskRecord.parentId : '') != (savedTask.parentId ? savedTask.parentId : '');
						if (!projectMoved && !bParentchanged) {
							return false;
						} else {
							log.debug('Task Moved.', {
								projectMoved: projectMoved,
								parentChanged: bParentchanged,
								taskrecordparentid: taskRecord.parentId,
								savedtaskparentid: savedTask.parentId,
								lineText: lineText,
								savedTaskTitle: savedTask.title,
								newHash: newHash,
								oldHash: savedTask.lineHash
							});
						}
					} else {
						if (getSettings().debugMode) {
							log.debug('Task Hash Changed.', '\n', lineText, '\n', savedTask.title, '\n', newHash, '\n', savedTask.lineHash);
						}
						bHashCheckFailed = true;
					}
				}
			}

			const lineTask = await this.plugin.taskParser?.convertLineToTask(lineText, lineNumber, filepath, fileMap, taskRecord);

			//TODO: Clean this up!
			if (!savedTask) {
				//Task in note, but not in cache. Assuming this would only happen in testing, delete the task from the note
				log.error(`There is no task for ${lineText.substring(0, 10)} in the local cache. It will be deleted from file ${filepath}`);

				new Notice(`There is no task ${this.plugin.taskParser.getTaskContentFromLineText(lineText)} in the local cache. It will be deleted`);
				const file = this.plugin.app.vault.getAbstractFileByPath(filepath);
				await this.plugin.fileOperation?.deleteTaskFromSpecificFile(file, lineTask, true);
				return false;
			} else {
				//this should only be necessary for a while, until they update all tasks
				if (!savedTask.dateHolder) {
					savedTask.dateHolder = this.plugin.dateMan?.getEmptydateHolder();
					await this.plugin.cacheOperation?.updateTaskToCache(savedTask, null);
				}
				if (!savedTask.lineHash) {
					savedTask.lineHash = await this.plugin.taskParser?.getLineHash(newHash);
				}
			}


			//Check whether the content has been modified
			const lineTaskTitle = lineTask.title;


			//Whether content is modified?
			const titleModified = this.plugin.taskParser?.isTitleChanged(lineTask, savedTask);
			//tag or labels whether to modify
			const tagsModified = this.plugin.taskParser?.isTagsChanged(lineTask, savedTask);
			//project whether to modify


			//Whether status is modified?
			const statusModified = this.plugin.taskParser?.isStatusChanged(lineTask, savedTask);

			//any dates modified
			const someDatesModified = this.plugin.dateMan?.areDatesChanged(lineTask, savedTask);

			const parentIdModified = this.plugin.taskParser?.isParentIdChanged(lineTask, savedTask);
			//check priority
			const priorityModified = !(lineTask.priority == savedTask.priority);


			const taskItemsModified = this.plugin.taskParser.areItemsChanged(lineTask.items, savedTask.items);

			let notesModidified = false;
			//TODO: Should only have content or desc. Checking for both anyway.
			if (getSettings().syncNotes) {
				if (lineTask.content) {
					notesModidified = this.plugin.taskParser.areNotesChanged(lineTask.content, savedTask.content);
				} else if (lineTask.desc) {
					notesModidified = this.plugin.taskParser.areNotesChanged(lineTask.desc, savedTask.desc);
				}
			}

			try {
				let contentChanged = false;
				let tagsChanged = false;
				let projectChanged = false;
				let statusChanged = false;
				let datesChanged = false;
				let parentIdChanged = false;
				let priorityChanged = false;
				let taskItemsChanged = false;
				let notesChanged = false;


				if (titleModified) {
					if (getSettings().debugMode) {
						log.debug(`Title modified for task ${lineTask_ticktick_id}\n"New:" ${lineTask.title}\n"Cached:" ${savedTask.title}`);
					}
					// savedTask.title = lineTaskTitle
					contentChanged = true;
				}

				if (tagsModified) {
					if (getSettings().debugMode) {
						log.debug(`Tags modified for task ${lineTask_ticktick_id}, , ${lineTask.tags}, ${savedTask.tags}`);
					}
					// savedTask.tags = lineTask.tags
					tagsChanged = true;
				}


				if (someDatesModified) {
					if (getSettings().debugMode) {
						log.debug(`Dates modified for task ${lineTask_ticktick_id}`);
						// log.debug('new: ', lineTask.dueDate, 'old: ', savedTask.dueDate);
					}
					//log.debug(savedTask.due.date)
					// savedTask.dueDate = lineTask.dueDate
					datesChanged = true;
				}

				//let's not lose the time zone!
				lineTask.timeZone = savedTask.timeZone;

				if (projectMoved) {
					// log.debug(`Project id modified for task ${lineTask_ticktick_id}, ${lineTask.projectId}, ${savedTask.projectId}`)
					await this.plugin.tickTickRestAPI?.moveTaskProject(lineTask, savedTask.projectId, lineTask.projectId);
					let noticeMessage = '';
					if (getSettings().debugMode) {
						log.debug('Project Moved');
					}
					noticeMessage = `Task ${lineTask_ticktick_id}: ${this.plugin.taskParser.getTaskContentFromLineText(lineTaskTitle)} has moved from ` +
						`${oldFilePath} to ` +
						`${filepath} \n` +
						`If any children were moved, they will be updated to ${getSettings().baseURL} on the next Sync event`;
					new Notice(noticeMessage, 5000);
					if (getSettings().debugMode) {
						log.debug(noticeMessage);
					}
					// savedTask.projectId = lineTask.projectId
					projectChanged = true;
				}


				if (parentIdModified) {

					let oldParent = await this.plugin.cacheOperation?.loadTaskFromCacheID(savedTask.parentId);
					let newParent = await this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask.parentId);
					let noticeMessage = `Task ${lineTask_ticktick_id}:\n${this.plugin.taskParser?.stripOBSUrl(lineTaskTitle).trim()}\n` +
						`used to be a child of:\n${oldParent ? oldParent.title.trim() : 'No old parent found'}\n` +
						`but is now a child of:\n${newParent ? newParent.title.trim() : 'No new parent found.'}\n` +
						`If any children were moved, they will be updated to ${getSettings().baseURL} on the next Sync event`;
					await this.plugin.tickTickRestAPI?.moveTaskParent(lineTask_ticktick_id, savedTask.parentId, lineTask.parentId, lineTask.projectId);

					new Notice(noticeMessage, 5000);
					if (getSettings().debugMode) {
						log.debug(noticeMessage);
					}

					// savedTask.parentId = lineTask.parentId
					parentIdChanged = true;
				}

				if (priorityModified) {

					// savedTask.priority = lineTask.priority
					priorityChanged = true;
				}

				if (taskItemsModified) {
					if (getSettings().debugMode) {
						log.debug('Number of items changed: ', lineTask.items?.length, savedTask.items?.length);
					}
					taskItemsChanged = true;
				}
				if (notesModidified) {
					if (getSettings().debugMode) {
						if (lineTask.content) {
							log.debug('Notes changed: ', lineTask.content, savedTask.content);
						} else {
							log.debug('Desc changed: ', lineTask.desc, savedTask.desc);
						}
					}
					notesChanged = true;
				}


				if (contentChanged || tagsChanged || datesChanged ||
					projectChanged || parentIdChanged || priorityChanged || parentIdChanged || taskItemsChanged || notesChanged) {
					//log.debug(updatedContent)
					savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());

					const saveDateHolder = lineTask.dateHolder; //because it's going to get clobered when we refetch the tas,
					const updatedTask = <ITask>await this.plugin.tickTickRestAPI?.UpdateTask(lineTask);
					//TODO: This feels Kludgy AF. examine ways to get past this.
					updatedTask.dateHolder = saveDateHolder;
					updatedTask.lineHash = newHash;

					//TODO: Should we do ths again?
					//      UpdatedTaskLine is needed when something we're doing needs to reflected in TickTick
					//      I don't think we need to do this anymore.
					//
					// const fileContent = fileMap.getFileLines()?.join('\n');
					//
					// await this.updateTaskLine(updatedTask, lineText, null, null, fileContent, lineNumber, filepath);
					//

					if (!projectChanged) {
						await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, null);
					} else {
						await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, filepath);
					}
					modified = true;
				}
				// log.debug(result)

				if (statusModified) {
					if (getSettings().debugMode) {
						log.debug(`Status modified for task ${lineTask_ticktick_id}`);
					}
					if (lineTask.status != 0) {
						if (getSettings().debugMode) {
							log.debug(`task completed`);
						}
						this.plugin.tickTickRestAPI?.CloseTask(lineTask.id, lineTask.projectId);
						await this.plugin.cacheOperation?.closeTaskToCacheByID(lineTask.id);
					} else {

						if (getSettings().debugMode) {
							log.debug(`task not completed`);
						}
						this.plugin.tickTickRestAPI?.OpenTask(lineTask.id, lineTask.projectId);
						await this.plugin.cacheOperation?.reopenTaskToCacheByID(lineTask.id);
					}
					statusChanged = true;
					new Notice(`Task Status for ${lineTask_ticktick_id} updated `);
				}


				if (contentChanged || tagsChanged || datesChanged ||
					projectChanged || parentIdChanged || priorityChanged || parentIdChanged || taskItemsChanged || notesChanged) {

					// log.debug(lineTask)
					// log.debug(savedTask)
					//`Task ${lastLineTaskticktickId} was modified`
					await this.plugin.saveSettings();
					let message = `Task ${lineTask_ticktick_id} is updated.`;
					// log.debug("#####", message);
					new Notice(message);

					if (contentChanged) {
						message += '\nContent was changed.';
					}
					if (statusChanged) {
						message += '\nStatus was changed.';
					}
					if (datesChanged) {
						message += '\nDue date was changed.';
					}
					if (tagsChanged) {
						message += '\nTags were changed.';
					}
					if (projectChanged) {
						message += '\nProject was changed.';
					}
					if (priorityChanged) {
						message += '\nPriority was changed.';
					}
					if (parentIdModified) {
						message += '\nParent was changed.';
					}
					if (taskItemsChanged) {
						message += '\nTask Items changed';
					}
					if (notesChanged) {
						message += '\nNotes Changed';
					}


					if (getSettings().debugMode) {
						log.debug('Task Changed: ', lineTask.id, '\n', message);
					}

				} else {
					//log.debug(`Task ${lineTask_ticktick_id} did not change`);
				}

			} catch (error) {
				log.error('Error updating task:', error);
			}
			//There's a corner case somewhere, where the line content hash that's saved is not the line content hash
			// from the line in Obsidian. Until I find that corner case, we're just going to reset the line hash here and
			// be done.
			if (!modified && bHashCheckFailed) {
				const updatedHash = await this.plugin.taskParser?.getLineHash(lineText + taskNotes);
				lineTask.lineHash = updatedHash;
				await this.plugin.cacheOperation?.updateTaskToCache(lineTask, null);
				await this.plugin.saveSettings();
				log.debug(`Updated hash: ${updatedHash}`);
			}
		} else {
			if (this.plugin.taskParser.isMarkdownTask(lineText)) {
				modified = await this.handleTaskItem(lineText, fileMap, lineNumber);
			}
		}


		return modified;
	}

	async deleteTaskItemCheck(filepath: string, lineText: string, lineNumber: number, fileContent: string): Promise<void> {


		if (!this.plugin.taskParser?.hasTickTickId(lineText) &&
			!this.plugin.taskParser?.hasTickTickTag(lineText) &&
			this.plugin.taskParser?.isMarkdownTask(lineText)) {
			//check for deleted Items.
			let modified = false;
			//Is it a task item?
			//is it a task at all?
			if (!this.plugin.taskParser?.isMarkdownTask(lineText)) {
				//Nah Brah. Bail.
				return;
			}
			let parsedItem = this.plugin.taskParser?.taskFromLine(lineText);
			let tabs = parsedItem?.indent;
			let content = parsedItem?.description;
			const thisLineStatus = parsedItem?.status;
			let parentTask;
			if (tabs > 0) {//must be indented at least once.
				const lines = fileContent.split('\n');
				//We're on a task item, need to find it's parent.
				//TODO: Do we get here on deleting a character
				for (let i = lineNumber - 1; i >= 0; i--) {
					const line = lines[i];
					if (this.plugin.taskParser?.hasTickTickId(line) && this.plugin.taskParser?.hasTickTickTag(line)) {
						const ticktickid = this.plugin.taskParser.getTickTickId(line);
						parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(ticktickid);
						if (parentTask && parentTask.items) { //we have some items. Let's assume the order is the same?
							let itemId = '';
							let regex = /%%(.*)%%/;
							let match = regex.exec(content);
							if (match) {
								itemId = match[1];
								const oldItem = parentTask.items.find((item) => item.id === itemId);
								if (oldItem) {
									parentTask.items = parentTask.items.filter(item => item.id !== itemId);
									modified = true;
								}
								break;
							} else {
								//was it not added in the first place? Assume it will sort itself out on the next go around
								log.debug(`${itemId} Not found.`);
								break;
							}
						} else {
							// log.debug(`parent didn't have items.`);
							break;
						}

					}
				}
				if (modified) {
					//do the update mambo. cache and api.
					//TODO: Verify that pushing an item with title and status will just matically add it.
					parentTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
					const result = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
					await this.plugin.cacheOperation?.updateTaskToCache(parentTask);
				}

			}


		}
	}

	async fullTextModifiedTaskCheck(filepath: string | null): Promise<void> {
		try {
			let file;
			let currentFileValue;
			let view;
			if (filepath) {
				file = this.app.vault.getAbstractFileByPath(filepath);
				if ((file) && (file instanceof TFolder)) {
					//leave folders alone.
					return;
				}
			} else {
				view = this.app.workspace.getActiveViewOfType(MarkdownView);
				file = this.app.workspace.getActiveFile();
				filepath = file?.path;
			}

			let hasModifiedTask = false;

			const fileMap = new FileMap(this.app, this.plugin, file);
			await fileMap.init();

			const lines: string [] = fileMap.getFileLines().split('\n');

			//TODO: maybe sort a way to do the whole check in one swell foop.
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (this.plugin.taskParser?.isMarkdownTask(line)) {
					try {
						//TODO: use as service?
						await this.lineModifiedTaskCheck(filepath, line, i, fileMap);
						hasModifiedTask = true;
					} catch (error) {
						log.error('Error modifying task:', error);
					}
				}
			}


			//TODO: at some point, I had a notion to simplify the change handling, this is an after effect.
			if (hasModifiedTask) {
				try {
					// Perform necessary actions on the modified content and file meta data
				} catch (error) {
					log.error('Error processing modified content:', error);
				}
			}
		} catch (error) {
			log.error('Error:', error);
		}
	}

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

	/*
	 * Synchronizes the tasks between TickTick and Obsidian.
	 * //TODO: split this function into smaller functions
	 * return:
	 *  true if the function is in the process of modifying files
	 *  false otherwise
	 */
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
				updateProjectGroups(allResources.projectGroups);
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
			if (Object.keys(getSettings().fileMetadata).length === 0) {
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
				let result = await this.plugin.fileOperation?.synchronizeToVault(newTickTickTasks, false);
				if (result) {
					// Sleep for 1 seconds
					await new Promise(resolve => setTimeout(resolve, 1000));
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
				await this.plugin.tickTickRestAPI?.AddTask(task);
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
				// this.dumpArray('== Update in  Obsidian:', recentUpdates)
				let result = await this.plugin.fileOperation?.synchronizeToVault(recentUpdates, true);
				if (result) {
					// Sleep for 1 seconds
					await new Promise(resolve => setTimeout(resolve, 1000));
					bModifiedFileSystem = true;
				}


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
					const updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task);
					//Cache the title without the URL because that's what we're going to do content compares on.
					updatedTask.title = await this.plugin.taskParser?.stripOBSUrl(updatedTask.title);
					await this.plugin.cacheOperation?.updateTaskToCache(updatedTask);
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
				const savedTask = this.plugin.cacheOperation.loadTaskFromCacheID(taskId);
				if (taskId && savedTask) {
					savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
					const taskRecord = fileMap.getTaskRecord(taskId)
					//NB: lineNumber = 0 is only safe because we KNOW we have a task record.
					const lineTask = await this.plugin.taskParser?.convertLineToTask(lineText, 0, fileMap.getFilePath(), fileMap, taskRecord);
					const merged = { ...savedTask, ...lineTask };
					Object.assign(lineTask, merged);
					const updatedTask = <ITask>await this.plugin.tickTickRestAPI?.UpdateTask(lineTask);
					await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, null);
				}
			}
		}
	}

	//get the TickTick data into the task line.

	//Check if user moved the task.
	private async checkForMoves(taskId: string, filepath: string) {
		let projectMoved = false;
		const oldFilePath = this.plugin.cacheOperation.getFilepathForTask(taskId);
		if (oldFilePath && oldFilePath !== filepath) {
			projectMoved = true;
		}
		return { projectMoved, oldFilePath };
	}

	private async updateTaskLine(newTask: ITask, lineTxt: string, editor: Editor | null, cursor: EditorPosition | null, line: number | null, fileMap: FileMap) {
		let newTaskCopy = { ...newTask };
		newTaskCopy.items = [];

		const numTabs = this.plugin.taskParser.getNumTabs(lineTxt);
		let text = await this.plugin.taskParser?.convertTaskToLine(newTaskCopy, numTabs);

		if (editor && cursor) {
			const from = { line: cursor.line, ch: 0 };
			const to = { line: cursor.line, ch: lineTxt.length };
			editor?.replaceRange(text, from, to);
			return text;
		} else {
			try {
				// save file
				fileMap.modifyTask(text, line);
				//It would be more efficient to do one update when all is processed....
				const file = this.app.vault.getAbstractFileByPath(fileMap.getFilePath());
				await this.app.vault.modify(file, fileMap.getFileLines());
				// log.error("Modified: ", file?.path, new Date().toISOString());
			} catch (error) {
				log.error(error);
			}
		}
	}

	private async confirmDeletion(taskIds: string[], reason: string) {
		const tasksTitles = await this.plugin.cacheOperation?.getTaskTitles(taskIds);


		const myModal = new TaskDeletionModal(this.app, tasksTitles, reason, (result) => {
			this.ret = result;
		});
		const bConfirmation = await myModal.showModal();

		return bConfirmation;
	}

	private async handleTaskItem(lineText: string, fileMap: FileMap, lineNumber: number | undefined) {
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

		const parentTask = this.plugin.cacheOperation?.loadTaskFromCacheID(parentID);
		if (parentTask && parentTask.items) { //we have some items.
			if (itemId) {
				const oldItem = parentTask.items.find((item) => item.id == itemId);
				if (oldItem) {
					if (oldItem.title.trim() != newItem.description.trim()) {
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
				if (modified) {
					await this.plugin.cacheOperation?.updateTaskToCache(parentTask, filepath);
				}
			}
		}

		return modified;
	}

	private async updateTask(parentTask: ITask, filepath: string) {
		parentTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
		await this.plugin.cacheOperation?.updateTaskToCache(parentTask);
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
		const result = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
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

	async pullFromTickTick(db: Low<DBData>) {
		const since = db.data.meta?.lastFullSync || 0;

		const remoteTasks = await this.plugin.tickTickRestAPI?.getUpdatedTasks(since);

		for (const rt of remoteTasks) {
			let localTask: LocalTask = {};
			localTask.task = rt;
			localTask.source = "ticktick";

			upsertTask(db, localTask);
		}
	}

}
