import { App, Notice, TFile, TFolder } from 'obsidian';
import TickTickSync from '@/main';
import type { ITask } from './api/types/Task';
import { TaskDeletionModal } from './modals/TaskDeletionModal';
import { getSettings } from '@/settings';
import { FileMap } from '@/services/fileMap';
import log from 'loglevel';

export class FileOperation {
	app: App;
	plugin: TickTickSync;


	constructor(app: App, plugin: TickTickSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;

	}


	//Complete a task and mark it as completed
	async completeTaskInTheFile(taskId: string) {
		// Get the task file path
		const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath =  this.plugin.cacheOperation?.getFilepathForTask(taskId);

		// Get the file object and update the content
		const file = this.app.vault.getAbstractFileByPath(filepath);
		const content = await this.app.vault.read(file);

		const lines = content.split('\n');
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
				lines[i] = line.replace('[ ]', '[x]');
				modified = true;
				break;
			}
		}

		if (modified) {
			const newContent = lines.join('\n');
			await this.app.vault.modify(file, newContent);
			// log.trace("Modified: ", file?.path, new Date().toISOString());
		}
	}

	// uncheck completed tasks,
	async uncompleteTaskInTheFile(taskId: string) {
		// Get the task file path
		const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath =  this.plugin.cacheOperation?.getFilepathForTask(taskId);

		// Get the file object and update the content
		const file = this.app.vault.getAbstractFileByPath(filepath);
		const content = await this.app.vault.read(file);

		const lines = content.split('\n');
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
				lines[i] = line.replace(/- \[(x|X)\]/g, '- [ ]');
				modified = true;
				break;
			}
		}

		if (modified) {
			const newContent = lines.join('\n');
			await this.app.vault.modify(file, newContent);
			// log.error("Modified: ", file?.path, new Date().toISOString());
		}
	}

	//add #TickTick at the end of task line, if full vault sync enabled
	async addTickTickTagToFile(fileMap: FileMap) {


		if (fileMap.markAllTasks()) {
			const newContent = fileMap.getFileLines();
			await this.app.vault.modify(fileMap.file, newContent);
			new Notice('New Tasks will be added to TickTick on next Sync.');
			// log.error("Modified: ", file?.path, new Date().toISOString());
		}
	}


	//add TickTick at the line
	async addTickTickLinkToFile(filepath: string) {
		// Get the file object and update the content
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if ((file) && (file instanceof TFolder)) {
			//leave folders alone.
			return;
		}
		const content = await this.app.vault.read(file);

		const lines = content.split('\n');
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (this.plugin.taskParser?.hasTickTickId(line) && this.plugin.taskParser?.hasTickTickTag(line)) {
				if (this.plugin.taskParser?.hasTickTickLink(line)) {
					return;
				}
				const taskID = this.plugin.taskParser?.getTickTickId(line);
				const taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskID);
				const newLine = this.plugin.taskParser?.addTickTickLink(line, taskObject.id, taskObject.projectId);
				lines[i] = newLine;
				modified = true;
			} else {
				continue;
			}
		}

		if (modified) {
			const newContent = lines.join('\n');
			await this.app.vault.modify(file, newContent);
			// log.error("Modified: ", file?.path, new Date().toISOString());


		}
	}

	// sync updated task content to file
	async synchronizeToVault(tasks: ITask[], bUpdating: boolean): Promise<boolean> {
		if (!tasks) {
			log.error('No tasks to add.');
			return false;
		}
		//sort by project id and task id
		tasks.sort((taskA, taskB) =>
			(taskA.projectId.localeCompare(taskB.projectId) ||
				taskA.id.localeCompare(taskB.id)));

		const projectIds = [...new Set(tasks.map(task => task.projectId))];

		for (const projectId of projectIds) {
			let result;
			let taskFile: string | null | undefined = null;
			let projectTasks = tasks.filter(task => task.projectId === projectId);

				//If a task is in the default project, we need to find it on the file system.
				// 1. Find file for each task
				// 2. process the tasks by file.
				const tasksForFiles: { file: string, tasks: ITask[] }[] = [];
				const fileForDefaultProject = await this.plugin.cacheOperation?.getFilepathForProjectId(getSettings().defaultProjectId);
				for (const task of projectTasks) {
					if (task.parentId && task.parentId.length > 0) {
						taskFile = this.plugin.cacheOperation.getFilepathForTask(task.parentId);
					} else {
						taskFile = this.plugin.cacheOperation.getFilepathForTask(task.id);
					}
					log.debug('taskFile', taskFile);
					if (taskFile) {
						log.debug('adding to ', taskFile);
						this.addTaskToTFF(tasksForFiles, taskFile, task);
					} else {
						taskFile = await this.plugin.cacheOperation?.getFilepathForProjectId(task.projectId);
						if(taskFile) {
							log.debug('adding to ', taskFile);
							this.addTaskToTFF(tasksForFiles, taskFile, task);
						} else {
							log.debug('adding to ', fileForDefaultProject);
							this.addTaskToTFF(tasksForFiles, fileForDefaultProject, task);
						}
					}

				}
				for (const { file, tasks } of tasksForFiles) {
					//after redistributing the tasks, make sure they're still in parent/child order.
					this.doTheSortMambo(tasks);
					result = await this.synchronizeToFile(file, tasks, bUpdating);
				}

			// Sleep for 1 second
			if (result) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			if (getSettings().debugMode) {
				let opString = '';
				if (bUpdating) {
					opString = 'updating';
				} else {
					opString = 'adding';
				}
				log.debug('===', taskFile, projectTasks, result ? 'Completed ' + opString + ' task(s).' : ' Failed ' + opString + ' task(s).');
			}
		}
		return true;
	}

	async getOrCreateDefaultFile(taskFile: string) {
		let file;
		//the file doesn't exist. Create it.
		try {
			//TODO: Deal with Folders and sections in the fullness of time.
			const folderPath = getSettings().TickTickTasksFilePath;
			let folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) {
				log.warn(`Folder ${folderPath} does not exit. It will be created`);
				folder = await this.app.vault.createFolder(folderPath);
			}
			//TODO: When we implement this, beware case sensitivity.!

			// if (getSettings().keepProjectFolders && taskFile.includes('/')){
			// 	const groupName = taskFile.substring(0, taskFile.indexOf('/'));
			// 	const folderPath = (getSettings().TickTickTasksFilePath === '/' ?
			// 		'' :
			// 		(getSettings().TickTickTasksFilePath + '/'))
			// 		+ groupName
			// 	const groupFolder = this.app.vault.getAbstractFileByPath(folderPath);
			// 	if (!(groupFolder instanceof TFolder)) {
			// log.warn(`Folder ${folderPath} does not exit. It will be created`);
			// 		await this.app.vault.createFolder(folderPath);
			// 	}
			// }
			new Notice(`Creating new file: ${folder.path}/${taskFile}`);
			log.warn(`Creating new file: ${folder.path}/${taskFile}`);
			taskFile = `${folder.path}/${taskFile}`;
			const whoAdded = `${this.plugin.manifest.name} -- ${this.plugin.manifest.version}`;
			try {
				file = await this.app.vault.create(taskFile, `== Added by ${whoAdded} == `);
			} catch (error) {
				if (error.message.includes('File already exists')) {
					log.info('Attempting to find existing file', taskFile);
					file = this.app.vault.getAbstractFileByPath(taskFile);
					if (!file) {
						const fileName = taskFile.split('/').pop();
						if (fileName) {
							//there's a file on the filesystem. But we can't get to it by name.
							//try to find the file by name case insensitively
							const files = this.app.vault.getMarkdownFiles();
							for (const f of files) {
								log.debug('Checking file', f.path);
								if (f.path.toLowerCase() === fileName.toLowerCase()) {
									log.debug('Found existing file', f.path);
									file = f;
									break;
								}
							}
						}
					}

				} else {
					throw error;
				}
			}
			return file;
		} catch (error) {
			log.error('Error on create file: ', error);
			throw new Error(error);
		}
	}

	// update task content to file
	async updateTaskInFile(newTask: ITask) {
		const taskId = newTask.id;
		// Get the task file path
		const oldTask: ITask = this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);

		this.plugin.dateMan?.addDateHolderToTask(newTask, oldTask);

		let filepath =  this.plugin.cacheOperation?.getFilepathForTask(taskId);
		if (!filepath) {
			filepath = await this.plugin.cacheOperation?.getFilepathForProjectId(newTask.projectId);
			if (!filepath) {
				throw new Error(`File not found for ${newTask.id}, ${newTask.title}`);
			}
		}

		const tFilepath = this.app.vault.getAbstractFileByPath(filepath) as TFile;

		await this.syncTasks(tFilepath, [newTask], true);

	}

	async checkForDuplicates(fileMetadata, taskList: {} | undefined) {
		let taskIds = {};
		let duplicates = {};

		if (!fileMetadata) {
			return;
		}

		let fileName;
		try {

			for (const file in fileMetadata) {
				fileName = file;
				const currentFile = this.app.vault.getAbstractFileByPath(file);
				if ((!currentFile)) {
					log.debug('Duplicate check Skipping ', file, ' because it\'s not found.');
					continue;
				}
				if ((currentFile) && (currentFile instanceof TFolder)) {
					log.debug('Duplicate check Skipping ', file, ' because it\'s a folder.');
					continue;
				}
				try {
					const content = await this.app.vault.read(currentFile);
					for (let taskListKey in taskList) {
						if (content.includes(taskListKey)) {
							if (taskIds[taskListKey]) {
								if (!duplicates[taskListKey]) {
									duplicates[taskListKey] = [taskIds[taskListKey]];
								}
								duplicates[taskListKey].push(file);
							} else {
								taskIds[taskListKey] = file;
							}

						}
					}
				} catch {
					log.error('Duplicate check Skipping ', file, ' because it\'s not readable.');
					continue;
				}

			}
			return duplicates;
		} catch (Fail) {
			const errMsg = `File [${fileName}] not found, or is locked. If file exists, Please try again later.`;
			log.error(Fail, errMsg);
			throw new Error(errMsg);
		}
	}

	// delete task from file
	async deleteTaskFromSpecificFile(filePath: TFile, task: ITask, bConfirmDialog: boolean) {
		// Get the file object and update the content
		if (bConfirmDialog) {
			const bConfirm = await this.confirmDeletion(task.title + 'in File: ' + filePath);
			if (!bConfirm) {
				new Notice('Tasks will not be deleted. Please rectify the issue before the next sync.', 5000);
				return [];
			}
		}
		log.info('Task being deleted from file: ', task.id, filePath);

		const fileMap: FileMap = new FileMap(this.app, this.plugin, filePath);
		await fileMap.init();

		fileMap.deleteTask(task.id);
		const newContent = fileMap.getFileLines();
		await this.app.vault.modify(filePath, newContent);
		this.plugin.lastLines.set(filePath.path, newContent.length);
	}

	async deleteTaskFromFile(task: ITask) {
		const taskId = task.id;
		// Get the task file path

		const filepath =  this.plugin.cacheOperation?.getFilepathForTask(taskId);
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (filepath) {
			await this.deleteTaskFromSpecificFile(file, task, false);
		} else {
			throw new Error(`File not found for ${task.title}. File path found is ${filepath}`);
		}

	}

	//search TickTick_id by content
	async searchTickTickIdFromFilePath(filepath: string, searchTerm: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(filepath);
		const fileContent = await this.app.vault.read(file);
		const fileLines = fileContent.split('\n');
		let TickTickId: string | null = null;

		for (let i = 0; i < fileLines.length; i++) {
			const line = fileLines[i];

			if (line.includes(searchTerm)) {
				const regexResult = /\[ticktick_id::\s*(\w+)\]/.exec(line);

				if (regexResult) {
					TickTickId = regexResult[1];
				}

				break;
			}
		}

		return TickTickId;
	}

	//get all files in the vault
	async getAllFilesInTheVault() {
		const files = this.app.vault.getFiles();
		return (files);
	}

	async searchFilepathsByTaskidInVault(taskId: string) {
		const files = await this.getAllFilesInTheVault();
		const tasks = files.map(async (file) => {
			if (!this.isMarkdownFile(file.path)) {
				return;
			}
			const fileContent = await this.app.vault.cachedRead(file);
			if (fileContent.includes(taskId)) {
				return file.path;
			}
		});

		const results = await Promise.all(tasks);
		const filePaths = results.filter((filePath) => filePath !== undefined);
		return filePaths[0] || null;
		//return filePaths || null
	}

	//search filepath by taskid in vault

	isMarkdownFile(filename: string) {
		// Get the extension of the file name
		let extension = filename.split('.').pop();

		//Convert the extension to lowercase (the extension of Markdown files is usually .md)
		extension = extension.toLowerCase();

		// Determine whether the extension is .md
		if (extension === 'md') {
			return true;
		} else {
			return false;
		}
	}

	private async synchronizeToFile(taskFile: string, projectTasks: ITask[], bUpdating: boolean) {
		let file;
		let result;
		if (taskFile) {
			file = this.app.vault.getAbstractFileByPath(taskFile);
			if (!(file instanceof TFile)) {
				file = await this.getOrCreateDefaultFile(taskFile);
				log.debug('Creating new file: ', file.path);
			}
		}

		//make sure top level tasks are first
		projectTasks = this.doTheSortMambo(projectTasks);

		//only for debugging, in case I lose my sort shit again.
		// let subset = projectTasks.map((task) => {
		// 	return { id: task.id, title: task.title, parent: task.parentId, children: task.childIds };
		// });

		result = await this.syncTasks(file, projectTasks, bUpdating);
		return result;
	}

	private async syncTasks(file: TFile, tasks: ITask[], bUpdating): Promise<boolean> {
		try {
			const newData = await this.persistToFile(tasks, file, bUpdating);
			await this.app.vault.process(file, (data) => {
				data = newData;
				return data;
			});
			return true;
		} catch (error) {
			log.error(`Could not ${bUpdating ? 'update' : 'add'} Tasks to file ${file.path} \n Error: ${error}`);
			return false;
		}
	}

	private async persistToFile(tasks: ITask[], file: TFile, bUpdating: boolean): Promise<string> {
		// Go through the tasks.
		// For every task
		// 	if it has a parent, add it after the parent.
		//  else add at the the insertion point in lines.
		log.debug("Processing File: ", file.path)
		const fileMap = new FileMap(this.app, this.plugin, file);
		await fileMap.init();
		let bTaskMove: boolean = false;


		// log.debug('================');
		// log.debug('Tasks: ', tasks);
		// log.debug('Data: \n', fileMap.getFileLines());
		// log.debug('file: ', file);
		// log.debug('================');

		const addedTasks: string[] = [];

		for (const task of tasks) {
			let numParentTabs = 0;
			const parentID = task.parentId;
			if (parentID) {
				const parentTabs = fileMap.getNumParentTabs(parentID);
				numParentTabs = parentTabs + 1;
			}

			let lineText = '';
			let filePathForNewProject = '';
			//Tired of seeing duplicates because of Sync conflicts.
			if (!bUpdating) {
				lineText = await this.plugin.taskParser?.convertTaskToLine(task, numParentTabs);
				if (fileMap.getTaskIndex(task.id) != -1) {
					log.warn('A Task was being added but was already in file: ', task.id, task.title);
					//it's in the file, but not in cache. Just update it.
					fileMap.updateTask(task, lineText);
					await this.plugin.cacheOperation?.updateTaskToCache(task, file.path);
					addedTasks.push(task.id);
					continue;
				} else {
					fileMap.addTask(task, lineText);
				}
			} else {
				//For updates doing the dateHolder mambo here because we need to make sure we get old dates....
				const oldTask: ITask = this.plugin.cacheOperation?.loadTaskFromCacheID(task.id);
				this.plugin.dateMan?.addDateHolderToTask(task, oldTask);
				lineText = await this.plugin.taskParser?.convertTaskToLine(task, numParentTabs);
				if (oldTask) {
					//Only check for Project/Parent change if task is in cache.
					if ((this.plugin.taskParser?.isProjectIdChanged(oldTask, task))) {
						log.debug('Moving Task: ', task.id, task.title, ' from Project: ', oldTask.projectId, ' to Project: ', task.projectId);
						filePathForNewProject = await this.handleTickTickStructureMove(task, oldTask, lineText, fileMap);
						//because we need to update the OBS URL in TT and fix up the cache.
						bTaskMove = true;
					} else {
						const bParentUpdate = this.plugin.taskParser?.isParentIdChanged(oldTask, task);
						fileMap.updateTask(task, lineText, bParentUpdate);
					}
				} else {
					//how would that happen????
					log.warn('No Old Task found for: ', task.id);
				}
			}

			//We just added tags and url foo, update it on ticktick now.
			let tags = this.plugin.taskParser?.getAllTagsFromLineText(lineText);
			if (tags) {
				task.tags = tags;
			}
			let taskURL = "";
			if (!bTaskMove) {
				taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(file.path);
			} else {
				taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filePathForNewProject);
			}
			if (taskURL) {
				task.title = task.title + ' ' + taskURL;
			}

			if (!bUpdating) {
				//we're updating the task to get the right OBS URL in there.
				let addedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task);
				await this.plugin.cacheOperation?.appendTaskToCache(addedTask, file.path);
			} else {
				if (!bTaskMove) {
					await this.plugin.cacheOperation?.updateTaskToCache(task, file.path);
				} else {
					let addedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task);
					await this.plugin.cacheOperation?.updateTaskToCache(addedTask, filePathForNewProject);
				}

			}
		}

		const resultLines = fileMap.getFileLines();
		this.plugin.lastLines.set(file.path, resultLines.length);
		return resultLines;
	}

	private hasChildren(currentTask: ITask) {

		if (currentTask.childIds) {
			return currentTask.childIds?.length > 0;
		} else {
			return false;
		}
	}

	private async confirmDeletion(taskTitle: string) {
		const tasksTitles = [];
		tasksTitles.push(taskTitle);
		const reason: string = 'task not found in local cache.';
		const myModal = new TaskDeletionModal(this.app, tasksTitles, reason, (result) => {
			this.ret = result;
		});
		const bConfirmation = await myModal.showModal();

		return bConfirmation;
	}


	//Just the notification now.
	private async handleTickTickStructureMove(newTask: ITask, oldTask: ITask, lineText: string, fileMap: FileMap) {
		log.debug('deleting old task: ', oldTask.id, oldTask.title, ' from file');
		const filePathForNewProject = await this.plugin.cacheOperation?.getFilepathForProjectId(newTask.projectId);
		if (!filePathForNewProject) {
			let errmsg = `File not found for moved newTask:  ${newTask.id}, ${newTask.title}`;
			throw new Error(errmsg);
		}
		const tFilePathForProject = this.app.vault.getAbstractFileByPath(filePathForNewProject);
		if (!tFilePathForProject || (!(tFilePathForProject instanceof TFile))) {
			let errmsg = `File not found for moved newTask:  ${newTask.id}, ${newTask.title}`;
			throw new Error(errmsg);
		}
		log.debug('oldFilePath: ', fileMap.getFilePath());
		if (!fileMap || !fileMap.getFilePath()) {
			let errmsg = `File not found for moved newTask:  ${newTask.id}, ${newTask.title}`;
			throw new Error(errmsg);
		}
		fileMap.deleteTask(oldTask.id);
		log.debug('deleted from: ', fileMap.getFilePath());

		await this.plugin.cacheOperation?.deleteTaskFromCache(oldTask.id);

		const newFileMap = new FileMap(this.app, this.plugin, tFilePathForProject);
		await newFileMap.init();
		//insert into the new file.
		log.debug('Adding Task: ', newTask.id, newTask.title, ' to new file: ', newFileMap.getFilePath());
		newFileMap.addTask(newTask, lineText);
		const newData = newFileMap.getFileLines();
		await this.app.vault.process(tFilePathForProject, (data) => {
			data = newData;
			return data;
		});

		//task is updated to cache in the caller....!


		const cleanTitle = this.plugin.taskParser?.stripOBSUrl(newTask.title);
		let message = '';
		if (newTask.projectId != oldTask.projectId) {
			const newProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(newTask.projectId);
			const oldProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(oldTask.projectId);
			message = 'Task Moved.\nTask: ' + cleanTitle + '\nwas moved from\n ' + oldProjectName + '\nto\n' + newProjectName;
		} else {
			if (newTask.parentId) {
				const parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(newTask.parentId);
				const cleanParentTaskTitle = this.plugin.taskParser?.stripOBSUrl(parentTask.title);
				message = 'Task has new Parent.\nTask: ' + cleanTitle + '\nis now a child of\n ' + cleanParentTaskTitle;
			} else {
				message = 'Task is now a top level task.\nTask: ' + cleanTitle;
			}
		}

		new Notice(message, 5000);
		return filePathForNewProject

	}


	private async deleteTaskFromOldFile(oldTask: ITask, newTask: ITask, fileMap: FileMap) {
		const oldFilePath =  this.plugin.cacheOperation?.getFilepathForTask(oldTask.id);
		log.debug('oldFilePath: ', oldFilePath);
		if (!oldFilePath) {
			let errmsg = `File not found for moved newTask:  ${newTask.id}, ${newTask.title}`;
			throw new Error(errmsg);
		}
		fileMap.deleteTask(oldTask.id);
		log.debug('deleted from: ', fileMap.getFilePath());
		return oldFilePath;
	}

	private async moveChildTasks(newTask: ITask, toBeProcessed: string[], filepath: string) {
		for (const childId of newTask.childIds) {
			//Are they going to be processed later?
			if (toBeProcessed.includes(childId)) {
				//We'll deal with it in the downloaded list.
				continue;
			}
			//get it from cache
			const currentChild = await this.plugin.cacheOperation?.loadTaskFromCacheID(childId);
			if (currentChild) {
				currentChild.parentId = newTask.id;
				currentChild.projectId = newTask.projectId;
				const numChildTaskItems = currentChild.items?.length;

				await this.moveTask(filepath, currentChild, numChildTaskItems, currentChild.id, currentChild.projectId);
				const currentChildHasChildren = this.hasChildren(currentChild);
				if (currentChildHasChildren) {
					const currentChild = await this.plugin.cacheOperation?.loadTaskFromCacheID(childId);
					await this.moveChildTasks(currentChild, toBeProcessed, filepath);
				}
			} else {
				//weird move. Don't break. Assume it will be taken care of on the next sync
				log.warn('Child not found: ', childId);
			}

		}
	}

	//TODO: Possibly not needed any longer.
	private async moveTask(filepath: string, task: ITask, oldtaskItemNum: number, oldTaskId: string, oldProjectId: string) {
		const tFilePath = this.app.vault.getAbstractFileByPath(filepath);
		await this.deleteTaskFromSpecificFile(tFilePath, task, false);
		await this.plugin.cacheOperation?.deleteTaskFromCache(oldTaskId);

		await this.synchronizeToVault([task]);
		const cleanTitle = this.plugin.taskParser?.stripOBSUrl(task.title);
		let message = '';
		if (task.projectId != oldProjectId) {
			const newProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(task.projectId);
			const oldProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(oldProjectId);
			message = 'Task Moved.\nTask: ' + cleanTitle + '\nwas moved from\n ' + oldProjectName + '\nto\n' + newProjectName;
		} else {
			if (task.parentId) {
				const parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(task.parentId);
				const cleanParentTaskTitle = this.plugin.taskParser?.stripOBSUrl(parentTask.title);
				message = 'Task has new Parent.\nTask: ' + cleanTitle + '\nis now a child of\n ' + cleanParentTaskTitle;
			} else {
				message = 'Task is now a top level task.\nTask: ' + cleanTitle;
			}
		}

		new Notice(message, 5000);
	}

	//TODO: Get rid of extraneous sorts!
	private compareTasks(a, b) {
		// Check for tasks with no parentId (parent tasks)
		if (!a.parentId && b.parentId) {
			return -1; // Parent task comes first
		} else if (a.parentId && !b.parentId) {
			return 1; // Task with parentId comes after
		} else if (a.parentId && b.parentId) {
			return b.parentId.localeCompare(a.parentId);
		} else {
			return a.sortOrder - b.sortOrder;
		}
	}

	// private compareTasks(a: ITask, b: ITask, depth = 0, tasks: ITask[]) {
	// 	// Check for tasks with no parentId (parent tasks)
	// 	if (!a.parentId && b.parentId) {
	// 		return -1; // Parent task comes first
	// 	} else if (a.parentId && !b.parentId) {
	// 		return 1; // Task with parentId comes after
	// 	} else if (!a.parentId && !b.parentId) {
	// 		// No parent - sort by sortOrder
	// 		return a.sortOrder - b.sortOrder;
	// 	} else {
	// 		// Use a set to track visited tasks to detect circular dependencies
	// 		const visited = new Set();
	//
	// 		let currentA = a;
	// 		while (currentA.parentId && depth < 100) { // Set a maximum depth limit (adjust as needed)
	// 			if (visited.has(currentA.id)) {
	// 				// Circular dependency detected - sort based on task id as a fallback
	// 				return a.id.localeCompare(b.id);
	// 			}
	// 			visited.add(currentA.id);
	// 			currentA = this.getParent(currentA.id, tasks);
	// 		}
	//
	// 		let currentB = b;
	// 		visited.clear(); // Clear visited set for task B
	// 		while (currentB.parentId && depth < 100) {
	// 			if (visited.has(currentB.id)) {
	// 				// Circular dependency detected
	// 				return a.id.localeCompare(b.id);
	// 			}
	// 			visited.add(currentB.id);
	// 			currentB = this.getParent(currentB.id, tasks);
	// 		}
	//
	// 		// If one stack is empty, remaining elements in the other are higher level parents
	// 		return currentA ? -1 : 1;
	// 	}
	// }

	private getParent(taskId, tasks) {
		return tasks.find(task => task.id === taskId);
	}


	// Recursive function to sort tasks, placing child tasks before their parents
	private sortChildrenfirst(tasks: ITask[]): ITask[] {
		const sorted: ITask[] = [];
		const taskMap = new Map<string, ITask>();

		// Map tasks by their IDs for easy lookup
		tasks.forEach(task => taskMap.set(task.id, task));

		// Function to recursively add tasks, making sure children appear before parents
		const addTaskWithChildren = (task: ITask) => {
			if (!sorted.includes(task)) {
				// Add children first
				if (task.childIds) {
					task.childIds.forEach(childId => {
						const childTask = taskMap.get(childId);
						if (childTask) {
							addTaskWithChildren(childTask);
						}
					});
				}

				// Add the current task after its children
				sorted.push(task);
			}
		};

		// Iterate through all tasks and ensure children are added before their parents
		tasks.forEach(task => {
			addTaskWithChildren(task);
		});
		return sorted;
	}

	private sortTasks(tasks) {
		const taskMap = new Map();

		// Populate the map
		tasks.forEach(task => taskMap.set(task.id, { ...task, children: [] }));

		let rootTasks = [];

		// Build the hierarchy
		tasks.forEach(task => {
			if (task.parentId && taskMap.has(task.parentId)) {
				taskMap.get(task.parentId).children.push(taskMap.get(task.id));
			} else {
				rootTasks.push(taskMap.get(task.id));
			}
		});

		// Function to flatten the hierarchy with depth-first traversal
		function flattenHierarchy(taskList, sortedArray = []) {
			for (const task of taskList) {
				sortedArray.push(task);
				if (task.children.length) {
					flattenHierarchy(task.children, sortedArray);
				}
			}
			return sortedArray;
		}

		// Get the sorted array
		return flattenHierarchy(rootTasks).map(({ children, ...task }) => task);
	}

	private doTheSortMambo(tasks: ITask[]) {
		// Example usage with the provided tasks
		const jsonStringifiedTasks = JSON.parse(JSON.stringify(tasks)); // Deep copy the tasks
		const sortedTasks = this.sortTasksByLevel(jsonStringifiedTasks);

		// Format the result to show the hierarchy
		const result = sortedTasks.map(task => {
			const indent = '  '.repeat(task.level - 1);
			return `${indent}${task.title} (Level: ${task.level})`;
		}).join('\n');

		return sortedTasks as ITask[];
	}

	private sortTasksByLevel(tasks: ITask[]) {
		// Create a map of tasks by ID for easy reference
		const taskMap = {};
		tasks.forEach(task => {
			taskMap[task.id] = { ...task, level: 0 };
		});

		// Calculate the level of each task
		tasks.forEach(task => {
			if (!('parentId' in task) || (!task.parentId)) {
				// This is a top-level task
				taskMap[task.id].level = 1;
			} else {
				// Child task - we need to calculate its level
				let currentId = task.id;
				let level = 1;

				while (taskMap[currentId] && ('parentId' in taskMap[currentId]) && taskMap[currentId].parentId) {
					level++;
					//This happened once. It caused an infinite loop. Throw an error.
					if (level > 6) {
						log.debug('this is the issue: ', currentId, ' ', taskMap[currentId].parentId, '');
						new Notice('A circular Parent-Child dependency was found. Please fix in TickTick by checking parent-child relationships.');
						throw new Error('Circular Parent-Child dependency was found.');
					}
					currentId = taskMap[currentId].parentId;
				}

				taskMap[task.id].level = level;
			}
		});

		// Convert back to array and sort by level
		const sortedTasks = Object.values(taskMap);
		sortedTasks.sort((a, b) => {
			// Primary sort by level
			if (a.level !== b.level) {
				return a.level - b.level;
			}

			// Secondary sort by original order (using sortOrder property)
			return a.sortOrder - b.sortOrder;
		});

		return sortedTasks;
	}

	private addTaskToTFF(taskForFiles: { file: string; tasks: ITask[] }[], taskFile: string | null, task: ITask) {
		let fileTaskObj = taskForFiles.find(obj => obj.file === taskFile);
		if (!fileTaskObj) {
			fileTaskObj = { file: taskFile, tasks: [] };
			taskForFiles.push(fileTaskObj);
		}
		fileTaskObj.tasks.push(task);
	}
}
