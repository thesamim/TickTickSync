import TickTickSync from "../main";
import {App, Editor, EditorPosition, MarkdownView, Notice, TFile, TFolder} from 'obsidian';
import { ITask } from './api/types/Task';
import ObjectID from 'bson-objectid';
import {TaskDetail} from "./cacheOperation"
import {RegExpMatchArray} from 'typescript';
import {TaskDeletionModal} from "./modals/TaskDeletionModal";

type deletedTask = {
	taskId: string,
	projectId: string
}

export class SyncMan {

	app: App;
	plugin: TickTickSync;


	constructor(app: App, plugin: TickTickSync) {
		//super(app,settings,tickTickRestAPI,ticktickSyncAPI,taskParser,cacheOperation);
		this.app = app;
		this.plugin = plugin;

	}


	async deletedTaskCheck(file_path: string | null): Promise<void> {

		let file
		let currentFileValue
		let view
		let filepath

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path)
			if ((file) && (file instanceof TFolder)) {
				//leave folders alone.
				return;
			}
			filepath = file_path
			if (file instanceof TFile) {
				currentFileValue = await this.app.vault.read(file)
			}
		} else {
			view = this.app.workspace.getActiveViewOfType(MarkdownView);
			//const editor = this.app.workspace.activeEditor?.editor
			file = this.app.workspace.getActiveFile()
			filepath = file?.path
			//Use view.data instead of vault.read. vault.read is delayed
			currentFileValue = view?.data
		}

		let fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath, null)
		// console.log("fileMetaData: ", fileMetadata)
		if (!fileMetadata || !fileMetadata.TickTickTasks) {
			// console.log('fileMetaData has no task')
			return;
		}


		let fileMetadata_TickTickTasks: TaskDetail[] = fileMetadata.TickTickTasks;
		if (currentFileValue) {
			const currentFileValueWithOutFileMetadata = currentFileValue.replace(/^---[\s\S]*?---\n/, '');
			const deletedTaskIds = await this.findMissingTaskIds(currentFileValueWithOutFileMetadata, fileMetadata_TickTickTasks, filepath)
			const numDeletedTasks = deletedTaskIds.length
			if (numDeletedTasks > 0) {

				await this.deleteTasksByIds(deletedTaskIds);
				//update filemetadata so we don't try to delete items for deleted tasks.
				fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath, null)
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
						let updatedTask = await this.plugin.cacheOperation?.removeTaskItem(fileMetadata, task.taskId, deletedItems)
						if (updatedTask) {
							let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath)
							if (taskURL) {
								updatedTask.title = updatedTask.title + " " + taskURL;
							}
							let updateResult = await this.plugin.tickTickRestAPI?.UpdateTask(updatedTask);
						}
					} catch (error) {
						console.error("Task Item removal failed: ", error);
					}
				}
			}
			// console.log("deleted items: ", deletedItems)

		} else {
			//We had a file. There is no content. User deleted ALL tasks, all items will be deleted as a side effect.
			const deletedTaskIDs = fileMetadata_TickTickTasks.map((taskDetail) => taskDetail.taskId);
			if (deletedTaskIDs.length > 0) {
				//TODO: Assuming that if they for real deleted everything, it will get caught on the next sync
				console.error("Content not readable.", currentFileValue, filepath, " file is possibly open elsewhere?");

				// new Notice(`All content from ${file} APPEARS to have been removed.\n` +
				// 	"If this is correct, please confirm task deletion.", 0)
				//
				// await this.deleteTasksByIds(deletedTaskIDs);
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
			.map((taskDetail: TaskDetail) => taskDetail.taskId)// Explicitly create an array of strings

		//ok, but if they're just being moved? See if we can find them elsewhere first.
		//
		if (missingTaskIds && missingTaskIds.length > 0) {
			let saveTheseTasks: string[] = []
			for (const taskId of missingTaskIds) {
				const location = await this.plugin.cacheOperation?.findTaskInFiles(taskId)
				if (location) {
					saveTheseTasks.push(taskId);
				}
			}
			// console.log("== saved:", saveTheseTasks)
			missingTaskIds = missingTaskIds
				.filter((taskId) => {
						return !saveTheseTasks.includes(taskId)
					}
			 	)
			// console.log("==", filePath, "sanitized", missingTaskIds)
		}
		// else {
		// 	console.log("== nothing missing.")
		// }
		return missingTaskIds;
	}

	async lineContentNewTaskCheck(editor: Editor, view: MarkdownView): Promise<boolean> {
		//const editor = this.app.workspace.activeEditor?.editor
		//const view =this.app.workspace.getActiveViewOfType(MarkdownView)
		const filepath = view.file?.path
		const fileContent = view?.data
		const cursor = editor.getCursor()
		const line = cursor.line
		const linetxt = editor.getLine(line)
		let before = fileContent?.length
		await this.addTask(linetxt, filepath, line, fileContent, editor, cursor);
		let after = fileContent?.length
		// console.log(" : ", before, after, (before != after))
		return   (before != after);
	}

	async addTask(lineTxt: string, filePath: string, line: number, fileContent: string, editor: Editor | null, cursor: EditorPosition | null) {
		//Add task
		// if (this.plugin.settings.debugMode) {
		// 	console.log("Adding to: ", filePath)
		// }

		if ((!this.plugin.taskParser?.hasTickTickId(lineTxt) && this.plugin.taskParser?.hasTickTickTag(lineTxt))) {
			//Whether #ticktick is included, but not ticktickid: Task just added.
			try {
				const currentTask = await this.plugin.taskParser?.convertLineToTask(lineTxt, filePath, line, fileContent)
				const newTask = await this.plugin.tickTickRestAPI?.AddTask(currentTask)
				if (currentTask.parentId) {
					let parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(currentTask.parentId);
					parentTask = this.plugin.taskParser?.addChildToParent(parentTask, currentTask.parentId);
					parentTask = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
					await this.plugin.cacheOperation?.updateTaskToCacheByID(parentTask);
				}
				const {id: ticktick_id, projectId: ticktick_projectId, url: ticktick_url} = newTask;
				//console.log(newTask);
				new Notice(`new task ${newTask.title} id is ${newTask.id}`)
				//newTask writes to cache
				//Will handle meta data there.
				await this.plugin.cacheOperation?.appendTaskToCache(newTask, filePath)

				//If the task is completed
				if (currentTask.status != 0) {
					await this.plugin.tickTickRestAPI?.CloseTask(newTask.id)
					await this.plugin.cacheOperation?.closeTaskToCacheByID(ticktick_id)

				}
				await this.plugin.saveSettings()
				//May seem redundant, but puts task line formatting in one place.
				return await this.updateTaskLine(newTask, lineTxt, editor, cursor, fileContent, line, filePath);
			} catch (error) {
				console.error('Error adding task:', error);
				console.error(`The error occurred in file: ${filePath}`)
				return fileContent;
			}

		}
		return fileContent;
	}

	//This method was added at some point to handle the date moving logic that happens in converTaskToLine.
	// an unfortunate side effect: it farckles up the items. For now only update the task and not the items.
	// The assumption being that when this is called Items will be handled elsewhere.
	private async updateTaskLine(newTask: ITask, lineTxt: string, editor: Editor | null, cursor: EditorPosition | null, fileContent: string, line: number| null, filePath: string) {
		//TODO: Validate this is ok.
		let newTaskCopy = {...newTask}
		newTaskCopy.items = []
		let text = await this.plugin.taskParser?.convertTaskToLine(newTaskCopy);
		const tabs = this.plugin.taskParser?.getTabs(lineTxt);
		text = tabs + text;

		if (editor && cursor) {
			const from = { line: cursor.line, ch: 0 };
			const to = { line: cursor.line, ch: lineTxt.length };
			editor?.replaceRange(text, from, to);
			return text;
		} else {
			try {
				// save file
				const lines = fileContent.split('\n');
				lines[line] = text;
				const file = this.app.vault.getAbstractFileByPath(filePath);
				const newContent = lines.join('\n');
				await this.app.vault.modify(file, newContent);
				// console.error("Modified: ", file?.path, new Date().toISOString());
				return newContent;
			} catch (error) {
				console.error(error);
				return text;
			}
		}
	}

	async fullTextNewTaskCheck(file_path: string): Promise<boolean> {
		let file
		let currentFileValue
		let view
		let filepath = null;
		let editor = null;
		let cursor = null;

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path)
			if ((file) && (file instanceof TFolder)) {
				//leave folders alone.
				return false;
			}
			if (file) {
				filepath = file_path
				currentFileValue = await this.app.vault.read(file)
			} else {
				console.error(`File: ${file_path} not found. Removing from Meta Data`)
				await this.plugin.cacheOperation?.deleteFilepathFromMetadata(file_path);
				return false;
			}
		} else {
			const workspace = this.app.workspace;
			view = workspace.getActiveViewOfType(MarkdownView);
			editor = workspace.activeEditor?.editor
			file = workspace.getActiveFile()
			filepath = file?.path
			//Use view.data instead of vault.read. vault.read is delayed
			currentFileValue = view?.data
		}

		if (this.plugin.settings.enableFullVaultSync) {
			//console.log('full vault sync enabled')
			//console.log(filepath)
			// console.log("Called from sync.")
			await this.plugin.fileOperation?.addTickTickTagToFile(filepath)
		}

		const content = currentFileValue
		const lines = content.split('\n')
		for (let line = 0; line < lines.length; line++) {
			const linetxt = lines[line]
			currentFileValue = await this.addTask(linetxt, filepath, line, currentFileValue, editor, cursor);
		}
		return true;
	}


	async lineModifiedTaskCheck(filepath: string | undefined, lineText: string, lineNumber: number | undefined, fileContent: string): Promise<boolean> {
		let modified = false;
		if (this.plugin.settings.enableFullVaultSync) {
			//new empty metadata
			let metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath)
			//TODO: I'm pretty sure this is redundant. Don't feel like taking it out now because it's been here forever and it works.
			if (!metadata) {
				//But if we still don't have anything bail the F out.
				return false;
			}
			await this.plugin.saveSettings()
		}

		//check task
		if (this.plugin.taskParser?.hasTickTickId(lineText) && this.plugin.taskParser?.hasTickTickTag(lineText)) {
			const lineTask = await this.plugin.taskParser?.convertLineToTask(lineText, filepath, lineNumber, fileContent)
			const lineTask_ticktick_id = lineTask.id
			const savedTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask_ticktick_id)

			if (!savedTask) {
				//Task in note, but not in cache. Assuming this would only happen in testing, delete the task from the note
				console.error(`There is no task ${lineTask.id}, ${lineTask.title} in the local cache. It will be deleted`)

				new Notice(`There is no task ${lineTask.id}, ${lineTask.title} in the local cache. It will be deleted`)
				//TODO: If there is no task in cache, we can't tell how many items there are. How did the task from from cache in the first place?
				await this.plugin.fileOperation?.deleteTaskFromSpecificFile(filepath, lineTask.id, lineTask.title, lineTask.items?.length,true);
				return false
			}

			//Check whether the content has been modified
			const lineTaskTitle = lineTask.title;


			//Whether content is modified?
			const titleModified = this.plugin.taskParser?.isTitleChanged(lineTask, savedTask)
			//tag or labels whether to modify
			const tagsModified = this.plugin.taskParser?.isTagsChanged(lineTask, savedTask)
			//project whether to modify

			const projectModified = this.plugin.taskParser?.isProjectIdChanged(lineTask, savedTask)
			//Check if task has been in moved inside Obsidian
			const oldFilePath = await  this.plugin.cacheOperation?.isProjectMoved(lineTask, filepath);
			let projectMoved = false;
			if (oldFilePath) {
				projectMoved = true;
			}

			//Whether status is modified?
			const statusModified = this.plugin.taskParser?.isStatusChanged(lineTask, savedTask)
			//due date whether to modify
			const dueDateModified = this.plugin.taskParser?.isDueDateChanged(lineTask, savedTask)

			const parentIdModified = this.plugin.taskParser?.isParentIdChanged(lineTask, savedTask);
			//check priority
			const priorityModified = !(lineTask.priority == savedTask.priority)

			const taskItemsModified = lineTask.items?.length != savedTask.items?.length;


			try {
				let contentChanged = false;
				let tagsChanged = false;
				let projectChanged = false;
				let statusChanged = false;
				let dueDateChanged = false;
				let parentIdChanged = false;
				let priorityChanged = false;
				let taskItemsChanged = false;


				if (titleModified) {
					if (this.plugin.settings.debugMode) {
						console.log(`Title modified for task ${lineTask_ticktick_id}\n"New:" ${lineTask.title}\n"Cached:" ${savedTask.title}`)
					}
					// savedTask.title = lineTaskTitle
					contentChanged = true;
				}

				if (tagsModified) {
					if (this.plugin.settings.debugMode) {
						console.log(`Tags modified for task ${lineTask_ticktick_id}, , ${lineTask.tags}, ${savedTask.tags}`)
					}
					// savedTask.tags = lineTask.tags
					tagsChanged = true;
				}


				if (dueDateModified) {
					if (this.plugin.settings.debugMode) {
						console.log(`Due date modified for task ${lineTask_ticktick_id}`)
						console.log("new: ", lineTask.dueDate, "old: ", savedTask.dueDate)
					}
					//console.log(savedTask.due.date)
					// savedTask.dueDate = lineTask.dueDate
					dueDateChanged = true;
				}

				//let's not lose the time zone!
				lineTask.timeZone = savedTask.timeZone;

				if (projectModified || projectMoved) {

					// console.log(`Project id modified for task ${lineTask_ticktick_id}, ${lineTask.projectId}, ${savedTask.projectId}`)
					await this.plugin.tickTickRestAPI?.moveTaskProject(lineTask, savedTask.projectId, lineTask.projectId);

					let noticeMessage = "";
					if (projectModified) {
						if (this.plugin.settings.debugMode) {
							console.log("Project Modified");
						}
						noticeMessage = `Task ${lineTask_ticktick_id}: ${lineTaskTitle} has moved from ` +
							`${await this.plugin.cacheOperation?.getProjectNameByIdFromCache(savedTask.projectId)} to ` +
							`${await this.plugin.cacheOperation?.getProjectNameByIdFromCache(lineTask.projectId)} \n` +
							`If any children were moved, they will be updated to ${this.plugin.settings.baseURL} on the next Sync event`
					} else if (projectMoved) {
						if (this.plugin.settings.debugMode) {
							console.log("Project Moved");
						}
						noticeMessage = `Task ${lineTask_ticktick_id}: ${lineTaskTitle} has moved from ` +
							`${oldFilePath} to ` +
							`${filepath} \n` +
							`If any children were moved, they will be updated to ${this.plugin.settings.baseURL} on the next Sync event`
					}
					new Notice(noticeMessage, 0);
					if (this.plugin.settings.debugMode) {
						console.log(noticeMessage);
					}

					// savedTask.projectId = lineTask.projectId
					projectChanged = true;
				}


				if (parentIdModified) {

					let oldParent = await this.plugin.cacheOperation?.loadTaskFromCacheID(savedTask.parentId);
					let newParent = await this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask.parentId)
					let noticeMessage = `Task ${lineTask_ticktick_id}:\n${this.plugin.taskParser?.stripOBSUrl(lineTaskTitle).trim()}\n` +
						`used to be a child of:\n${oldParent ? oldParent.title.trim() : "No old parent found"}\n` +
						`but is now a child of:\n${newParent ? newParent.title.trim() : "No new parent found."}\n`+
						`If any children were moved, they will be updated to ${this.plugin.settings.baseURL} on the next Sync event`
					await this.plugin.tickTickRestAPI?.moveTaskParent(lineTask_ticktick_id, lineTask.parentId, lineTask.projectId)

					new Notice(noticeMessage, 0)
					if (this.plugin.settings.debugMode) {
						console.log(noticeMessage);
					}

					// savedTask.parentId = lineTask.parentId
					parentIdChanged = true;
				}

				if (priorityModified) {

					// savedTask.priority = lineTask.priority
					priorityChanged = true;
				}

				if (taskItemsModified) {
					if (this.plugin.settings.debugMode) {
						console.log("Number of items changed: ", lineTask.items?.length, savedTask.items?.length)
					}
					taskItemsChanged = true;
				}


				if (contentChanged || tagsChanged || dueDateChanged ||
					projectChanged ||  parentIdChanged || priorityChanged || parentIdChanged || taskItemsChanged) {
					//console.log(updatedContent)
					//TODO: Breaking SOC here.
					savedTask.modifiedTime = this.plugin.taskParser?.formatDateToISO(new Date());

					const updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(lineTask)
					if (!projectChanged) {
						await this.plugin.cacheOperation?.updateTaskToCacheByID(updatedTask, null);
					} else {
						await this.plugin.cacheOperation?.updateTaskToCacheByID(updatedTask, filepath);
					}
					//May seem redundant, but puts task line formatting in one place.
					await this.updateTaskLine(updatedTask, lineText, null, null, fileContent, lineNumber, filepath);

					modified = true;
				}
				// console.log(result)

				if (statusModified) {
					if (this.plugin.settings.debugMode) {
						console.log(`Status modified for task ${lineTask_ticktick_id}`)
					}
					if (lineTask.status != 0) {
						if (this.plugin.settings.debugMode) {
							console.log(`task completed`)
						}
						this.plugin.tickTickRestAPI?.CloseTask(lineTask.id, lineTask.projectId);
						await this.plugin.cacheOperation?.closeTaskToCacheByID(lineTask.id);
					} else {
						if (this.plugin.settings.debugMode) {
							console.log(`task not completed`)
						}
						this.plugin.tickTickRestAPI?.OpenTask(lineTask.id, lineTask.projectId);
						await this.plugin.cacheOperation?.reopenTaskToCacheByID(lineTask.id);
					}
					statusChanged = true;
					new Notice(`Task Status for ${lineTask_ticktick_id} updated `);
				}


				if (contentChanged || tagsChanged || dueDateChanged ||
					projectChanged ||  parentIdChanged || priorityChanged || parentIdChanged || taskItemsChanged) {

					// console.log(lineTask)
					// console.log(savedTask)
					//`Task ${lastLineTaskticktickId} was modified`
					await this.plugin.saveSettings()
					let message = `Task ${lineTask_ticktick_id} is updated.`;
					new Notice(message);

					if (contentChanged) {
						message += "\nContent was changed.";
					}
					if (statusChanged) {
						message += "\nStatus was changed.";
					}
					if (dueDateChanged) {
						message += "\nDue date was changed.";
					}
					if (tagsChanged) {
						message += "\nTags were changed.";
					}
					if (projectChanged) {
						message += "\nProject was changed.";
					}
					if (priorityChanged) {
						message += "\nPriority was changed.";
					}
					if (parentIdModified) {
						message += "\nParent was changed."
					}
					if (taskItemsChanged) {
						message += "\nTask Items changed"
					}


					if (this.plugin.settings.debugMode) {
						console.log("Task Changed: ", lineTask.id, "\n", message)
					}

				} else {
					//console.log(`Task ${lineTask_ticktick_id} did not change`);
				}

			} catch (error) {
				console.error('Error updating task:', error);
			}


		} else { //Not a task, check Items.
			modified = await this.handleTaskItem(lineText, filepath, fileContent, lineNumber);
		}
		return modified
	}

	private async handleTaskItem(lineText: string, filepath: string, fileContent: string, lineNumber: number): Promise<boolean> {
		let modified = false;
		let added = false;
		//it's a task. Is it a task item?
		//is it a task at all?
		if (!this.plugin.taskParser?.isMarkdownTask(lineText)) {
			//Nah Brah. Bail.
			return;
		}
		let parsedItem = await this.plugin.taskParser?.taskFromLine(lineText, filepath);
		if (this.plugin.settings.debugMode) {
			if (!parsedItem) {
				console.error(`Task construction failed in line: ${lineText}`)
			}
		}
		if (!parsedItem.description || !(parsedItem.status)) {
			//empty item. Bail.
			return;
		}
		let tabs = parsedItem?.indentation;
		let content = parsedItem?.description;
		if (content?.trim().length == 0) {
			//they hit enter, but haven't typed anything yet.
			// it will get added when they actually type something
			modified = false
			return modified;
		}
		const thisLineStatus = parsedItem.status.isCompleted();
		let parentTask: ITask = null;
		if (tabs.length > 0) {//must be indented at least once.
			const lines = fileContent.split('\n');
			let itemId = "";
			let regex = /%%(.*)%%/;
			let match = regex.exec(content);
			if (match) {
				itemId = match[1];
			}

			for (let i = lineNumber - 1; i >= 0; i--) {
				const line = lines[i];
				if (this.plugin.taskParser?.hasTickTickId(line) && this.plugin.taskParser?.hasTickTickTag(line)) {
					const ticktickid = this.plugin.taskParser.getTickTickIdFromLineText(line);
					parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(ticktickid);
					if (parentTask && parentTask.items) { //we have some items.
						if (itemId) {
							const oldItem = parentTask.items.find((item) => item.id === itemId);
							if (oldItem) {
								content = content.replace(regex, ""); //We just want content now.
								//TODO deal with "Won't do" which is -1
								const oldItemStatus = oldItem.status == 0 ? false : true;
								if (content.trim() != oldItem.title.trim()) {
									// console.log(`[${content}] vs [${oldItem.title}] and ${thisLineStatus} vs ${oldItemStatus}`)
									oldItem.title = content;
									modified = true;
								}
								if (thisLineStatus != oldItemStatus) {
									// console.log(`[${content}] vs [${oldItem.title}] and ${thisLineStatus} vs ${oldItemStatus}`)
									oldItem.status = thisLineStatus ? 2 : 0;
									modified = true;
								}
								break;
							} else {
								//TODO: Should ought to do something about this. Like either delete it from TT or
								//      delete it from OBS. Or something.
								console.error("item ID", itemId," ", content.trim(), " not found in", parentTask.title)
								break;
							}
						} else {
							const Oid = ObjectID();
							const OidHexString = Oid.toHexString();
							parentTask.items.push({
								id: OidHexString,
								title: content,
								status: thisLineStatus ? 2 : 0
							})
							const updatedItemContent = `${lineText} %%${OidHexString}%%`
							//Update the line in the file.
							try {
								const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
								const editor = markDownView?.app.workspace.activeEditor?.editor;
								const from = {line: lineNumber, ch: 0};
								const to = {line: lineNumber, ch: updatedItemContent.length};
								editor?.setLine(lineNumber, updatedItemContent);
							} catch (error) {
								console.error(`Error updating item: ${error}`)
							}
							added = true;
							break;
						}

					} else {
						if (this.plugin.settings.debugMode) {
							console.log(`parent didn't have items.`)
						}
						break;
					}
					break;
				}
			}
			if (modified || added) {
				//do the update mambo. cache and api.
				if (parentTask) {
					parentTask.modifiedTime = this.plugin.taskParser?.formatDateToISO(new Date());
					await this.plugin.cacheOperation?.updateTaskToCacheByID(parentTask);
					let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath)
					if (taskURL) {
						parentTask.title = parentTask.title + " " + taskURL;
					}
					const result = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask)
					const action = added ? "added" : "modified";
					new Notice(`new Item ${content} ${action}`)
					modified = true;
				}
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
			let parsedItem = await this.plugin.taskParser?.taskFromLine(lineText, filepath);
			let tabs = parsedItem?.indentation;
			let content = parsedItem.description;
			const thisLineStatus = parsedItem.status.isCompleted();
			let parentTask;
			if (tabs.length > 0) {//must be indented at least once.
				const lines = fileContent.split('\n');
				//We're on a task item, need to find it's parent.
				//TODO: Do we get here on deleting a character
				for (let i = lineNumber - 1; i >= 0; i--) {
					const line = lines[i];
					if (this.plugin.taskParser?.hasTickTickId(line) && this.plugin.taskParser?.hasTickTickTag(line)) {
						const ticktickid = this.plugin.taskParser.getTickTickIdFromLineText(line);
						parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(ticktickid);
						if (parentTask && parentTask.items) { //we have some items. Let's assume the order is the same?
							let itemId = "";
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
								console.log(`${itemId} Not found.`)
								break;
							}
						} else {
							console.log(`parent didn't have items.`)
							break;
						}

					}
				}
				if (modified) {
					//do the update mambo. cache and api.
					//TODO: Verify that pushing an item with title and status will just matically add it.
					parentTask.modifiedTime = this.plugin.taskParser?.formatDateToISO(new Date());
					const result = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask)
					await this.plugin.cacheOperation?.updateTaskToCacheByID(parentTask);
				}

			}


		}
	}

	async fullTextModifiedTaskCheck(file_path: string | null): Promise<void> {

		let file;
		let currentFileValue;
		let view;
		let filepath;

		try {
			if (file_path) {
				file = this.app.vault.getAbstractFileByPath(file_path);
				if ((file) && (file instanceof TFolder)) {
					//leave folders alone.
					return;
				}
				filepath = file_path;
				currentFileValue = await this.app.vault.read(file);
			} else {
				view = this.app.workspace.getActiveViewOfType(MarkdownView);
				file = this.app.workspace.getActiveFile();
				filepath = file?.path;
				currentFileValue = view?.data;
			}

			const content = currentFileValue;

			let hasModifiedTask = false;
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (this.plugin.taskParser?.isMarkdownTask(line)) {
					try {
						await this.lineModifiedTaskCheck(filepath, line, i, content);
						hasModifiedTask = true;
					} catch (error) {
						console.error('Error modifying task:', error);
						continue;
					}
				}
			}

			//todo: what was I thinking?
			if (hasModifiedTask) {
				try {
					// Perform necessary actions on the modified content and file meta data
				} catch (error) {
					console.error('Error processing modified content:', error);
				}
			}
		} catch (error) {
			console.error('Error:', error);
		}
	}


	// Close a task by calling API and updating JSON file
	async closeTask(taskId: string): Promise<void> {
		try {
			let projectId = await this.plugin.cacheOperation?.closeTaskToCacheByID(taskId);
			await this.plugin.tickTickRestAPI?.CloseTask(taskId, projectId);
			await this.plugin.fileOperation?.completeTaskInTheFile(taskId)

			this.plugin.saveSettings()
			new Notice(`Task ${taskId} is closed.`)
		} catch (error) {
			console.error('Error closing task:', error);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}

	//open task
	async reopenTask(taskId: string): Promise<void> {
		try {
			let projectId = await this.plugin.cacheOperation?.reopenTaskToCacheByID(taskId)
			await this.plugin.tickTickRestAPI?.OpenTask(taskId, projectId)
			await this.plugin.fileOperation.uncompleteTaskInTheFile(taskId)

			this.plugin.saveSettings()
			new Notice(`Task ${taskId} is reopened.`)
		} catch (error) {
			console.error('Error opening task:', error);
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

		const bConfirm = await this.confirmDeletion(taskIds, "The tasks were removed from the file");
		if (!bConfirm) {
			new Notice("Tasks will not be deleted. Please rectify the issue before the next sync.", 0)
			return [];
		}

		const api = await this.plugin.tickTickRestAPI?.initializeAPI()
		for (const taskId of taskIds) {
			try {
				let response;
				let projectId = await this.plugin.cacheOperation?.getProjectIdForTask(taskId);
				if (projectId) {
					response = await this.plugin.tickTickRestAPI?.deleteTask(taskId, projectId);
				}
				if (response) {
					//console.log(`Task ${taskId} deleted successfully`);
					new Notice(`Task ${taskId} is deleted.`)
				}
				//TODO: Verify that we are not over deleting.
				//We may end up with stray tasks, that are not in ticktick. if we're here, just delete them anyway.
				deletedTaskIds.push(taskId); // Add the deleted task ID to the array

			} catch (error) {
				console.error(`Failed to delete task ${taskId}: ${error}`);
				// You can add better error handling methods, such as throwing exceptions or logging here, etc.
			}
		}

		if (!deletedTaskIds.length) {
			if (this.plugin.settings.debugMode) {
				console.log("Task not deleted");
			}
			return [];
		}

		await this.plugin.cacheOperation?.deleteTaskFromCacheByIDs(deletedTaskIds); // Update JSON file
		this.plugin.saveSettings()
		//console.log(`A total of ${deletedTaskIds.length} tasks were deleted`);


		return deletedTaskIds;
	}


	//TODO: Determine deletion candidate
	// Synchronize completed task status to Obsidian file
	async syncCompletedTaskStatusToObsidian(unSynchronizedEvents) {
		// Get unsynchronized events
		//console.log(unSynchronizedEvents)
		try {

			// Handle unsynchronized events and wait for all processing to complete
			const processedEvents = []
			for (const e of unSynchronizedEvents) { //If you want to modify the code so that completeTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
				//console.log(`Completing ${e.object_id}`)
				await this.plugin.fileOperation.completeTaskInTheFile(e.object_id)
				await this.plugin.cacheOperation?.closeTaskToCacheByID(e.object_id)
				new Notice(`Task ${e.object_id} is closed.`)
				processedEvents.push(e)
			}

			// Save events to the local database."
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			//TODO: This is just wrong. Probably delete this function or fix this~
			await this.plugin.cacheOperation?.appendTaskToCache(processedEvents)
			this.plugin.saveSettings()


		} catch (error) {
			console.error('Error synchronizing task status:', error)
		}
	}


	// Synchronize completed task status to Obsidian file
	//TODO: Determine deletion candidate
	async syncUncompletedTaskStatusToObsidian(unSynchronizedEvents) {

		//console.log(unSynchronizedEvents)

		try {

			// Handle unsynchronized events and wait for all processing to complete
			const processedEvents = []
			for (const e of unSynchronizedEvents) { //If you want to modify the code so that uncompleteTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
				//console.log(`uncheck task: ${e.object_id}`)
				await this.plugin.fileOperation.uncompleteTaskInTheFile(e.object_id)
				await this.plugin.cacheOperation?.reopenTaskToCacheByID(e.object_id)
				new Notice(`Task ${e.object_id} is reopened.`)
				processedEvents.push(e)
			}


			// Merge new events into existing events and save to JSON
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			//TODO: This is just wrong. Probably delete this function or fix this!
			await this.plugin.cacheOperation?.appendTaskToCache(processedEvents)
			this.plugin.saveSettings()
		} catch (error) {
			console.error('Error synchronizing task status:', error)
		}
	}

	async syncTickTickToObsidian() {
		//Tasks in Obsidian, not in TickTick: upload
		//Tasks in TickTick, not in Obsidian: Download
		//Tasks in both: check for updates.
		try {
			const res = await this.plugin.cacheOperation?.saveProjectsToCache();
			if (!res) {
				console.error("probable network connection error.")
				return;
			}
			let bModifiedFileSystem = false;
			let allTaskDetails = await this.plugin.tickTickRestAPI?.getAllTasks();

			let tasksFromTickTic = allTaskDetails.update;
			let deletedTasks = allTaskDetails.delete;
			//TODO: Filtering deleted tasks would take an act of congress. Just warn the user in Readme.
			if (this.plugin.settings.SyncTag && this.plugin.settings.SyncProject) {
				let hasTag;
				hasTag = tasksFromTickTic.filter(task => {
					hasTag = task.tags?.includes(this.plugin.settings.SyncTag.toLowerCase()); //because TickTick only stores lowercase tags.
					return hasTag;
				});
				if (hasTag) {
					tasksFromTickTic = hasTag.filter(task => {
						return task.projectId === this.plugin.settings.SyncProject;
					});
				} else {
					//nothing to process
					return;
				}

			} else if (this.plugin.settings.SyncTag || this.plugin.settings.SyncProject) {
				tasksFromTickTic = tasksFromTickTic.filter(task => {
					const hasTag = task.tags?.includes(this.plugin.settings.SyncTag.toLowerCase());//because TickTick only stores lowercase tags.
					const hasProjectId = task.projectId === this.plugin.settings.SyncProject;
					return hasTag || hasProjectId;
				});
				if (!tasksFromTickTic || !(tasksFromTickTic.length >0)) {
					//nothing to process
					return;
				}
			}
			let tasksInCache = await this.plugin.cacheOperation?.loadTasksFromCache()
			if (this.plugin.settings.debugMode) {
				console.log("We have: ", tasksFromTickTic.length, " tasks on " + this.plugin.tickTickRestAPI?.api?.apiUrl)
				console.log("There are: ", tasksInCache.length, " tasks in Cache.");
			}


			tasksFromTickTic = tasksFromTickTic.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0))
			// console.log("num remote tasks: ", tasksFromTickTic.length)


			if (tasksInCache) {
				tasksInCache = tasksInCache.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0))
				// console.log("local tasks: ", tasksInCache.length);
			} else {
				tasksInCache = [];
			}
			if (tasksFromTickTic) {
				tasksFromTickTic = tasksFromTickTic.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0))
				// console.log("local tasks: ", tasksInCache.length);
			} else {
				tasksFromTickTic = [];
			}
			// Check for new tasks in TickTick

			const newTickTickTasks = tasksFromTickTic.filter(task => !tasksInCache.some(t => t.id === task.id));
			// this.dumpArray('== Add to Obsidian:', newTickTickTasks);
			//download remote only tasks to Obsidian
			if (newTickTickTasks.length > 0) {
				let result = await this.plugin.fileOperation?.addTasksToFile(newTickTickTasks)
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
				const taskTitlesForConfirmation = reallyDeletedTickTickTasks.map((task: ITask) => task.id)

				const bConfirm = await this.confirmDeletion(taskTitlesForConfirmation, "tasks deleted from TickTick");

				if (bConfirm) {
					for (const task of reallyDeletedTickTickTasks) {
						try {
							await this.plugin.fileOperation?.deleteTaskFromFile(task);
						} catch (error) {
							console.log("Tasks with no associated file found.")
						}
						await this.plugin.cacheOperation?.deleteTaskFromCache(task.id)
						bModifiedFileSystem = true;
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
			//this.dumpArray('Tasks Updated in TickTick:', tasksUpdatedInTickTick);


			// Check for updated tasks in Obsidian
			const tasksUpdatedInObsidian = tasksInCache.filter(task => {
				const modifiedTask = tasksFromTickTic.find(t => t.id === task.id);
				return modifiedTask && (new Date(modifiedTask.modifiedTime) > new Date(task.modifiedTime));
			});
			//this.dumpArray('Tasks updated in Obsidian:', tasksUpdatedInObsidian);

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



			//Need to have updates in parentage order else everything goes Tango Uniform
			recentUpdates.sort((left, right) => {
				if (!left.parentId && right.parentId) {
					return -1;
				} else if (left.parentId && !right.parentId) {
					return 1;
				} else {
					return 0;
				}
			});


			// this.dumpArray('== Update in  Obsidian:', recentUpdates);

			const toBeProcessed = recentUpdates.map(task => task.id)
			for (const task of recentUpdates) {
				await this.plugin.fileOperation?.updateTaskInFile(task, toBeProcessed );
				await this.plugin.cacheOperation?.updateTaskToCacheByID(task);
				bModifiedFileSystem = true;
			}
			if (bModifiedFileSystem) {
				// Sleep for 5 second
				await new Promise(resolve => setTimeout(resolve, 5000));
			}


			await this.plugin.saveSettings();
			//If we just farckled the file system, stop Syncing to avoid race conditions.
			if (this.plugin.settings.debugMode) {
				console.log(bModifiedFileSystem ? "File System Modified." : "No synchronization changes.")
			}
			return bModifiedFileSystem;

		} catch (err) {
			console.error('An error occurred while synchronizing:', err);
		}
	}

	dumpArray(which: string, arrayIn: ITask[]) {
		console.log(which)
		arrayIn.forEach(item => console.log(" ", item.id, "--", item.title, item.parentId, item.childIds, "modification time: ", item.modifiedTime))
	}

	///End of Test


	async backupTickTickAllResources() {
		try {
			// console.log("backing up.")
			// if (this.plugin.tickTickSyncAPI) {
			// console.log("It's defined", this.plugin.tickTickSyncAPI)
			// }
			const bkupData = await this.plugin.tickTickRestAPI?.exportData()

			if (bkupData) {
				const now: Date = new Date();
				const timeString: string = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;

				const name = "ticktick-backup-" + timeString + ".csv"

				await this.app.vault.create(name, bkupData)
				//console.log(`ticktick backup successful`)
				new Notice(`TickTick backup data is saved in the path ${name}`)
			}
		} catch (error) {
			console.error("An error occurred while creating TickTick backup");
		}

	}


	//After renaming the file, check all tasks in the file and update all links.
	async updateTaskContent(filepath: string) {
		const metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath)
		if (!metadata || !metadata.TickTickTasks) {
			return
		}
		const taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath)
		try {
			for (const taskDetail of metadata.TickTickTasks) {
				const task = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetail.taskId);
				if (task) {


					task.title = task.title + " " + taskURL;
					const updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task)
					//Cache the title without the URL because that's what we're going to do content compares on.
					updatedTask.title = await this.plugin.taskParser?.stripOBSUrl(updatedTask.title)
					await this.plugin.cacheOperation?.updateTaskToCacheByID(updatedTask);
				} else {
					const error = "Task: " +  taskDetail +  "from file: " +  filepath +  "not found.";
					throw new Error(error);
				}
			}
		} catch (error) {
			console.error('An error occurred in updateTaskDescription:', error);
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



}
