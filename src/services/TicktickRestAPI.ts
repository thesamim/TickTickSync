import type { ITask } from '@/api/types/Task';
import { type IBatch, Tick } from '@/api';
import { App, Notice } from 'obsidian';
import TickTickSync from '@/main';
import type { IProject } from '@/api/types/Project';
import { getSettings, updateSettings } from '@/settings';
//logging
import log from '@/utils/logger';
import { getTick } from '@/api/tick_singleton_factory';
import Dexie from 'dexie';

export class TickTickRestAPI {
	get checkpoint(): number {
		return this._checkpoint;
	}

	set checkpoint(value: number) {
		this._checkpoint = value;
	}
	app: App;
	plugin: TickTickSync;
	api: Tick | null;
	token: string;
	baseURL: string;
	private _checkpoint: number;

	constructor(app: App, plugin: TickTickSync, api: Tick | null) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
		this.token = getSettings().token;
		this.baseURL = getSettings().baseURL;
		this._checkpoint = getSettings().checkPoint;

		if (!this.token || this.token === '') {
			new Notice('Please login from Settings.', 5000);
			this.api = null;
			log.error('No Token');
			throw new Error('API Not Initialized.');
		} else {
			if (getSettings().debugMode) {
				log.debug(JSON.stringify({
					baseUrl: this.baseURL,
					token: '[' + this.token.substring(0, 10) + '...]' + ' len: ' + this.token.length
				}));
			}
			if (!api) {
				this.api = getTick({
					baseUrl: getSettings().baseURL,
					token: this.token,
					checkPoint: getSettings().checkPoint
				});
				this.api.inboxProperties = { id: getSettings().inboxID, sortOrder: 0 };
				//this.plugin.settings.checkPoint = this.api.checkpoint;
			} else {
				this.api = api;
			}
			//getSettings().apiInitialized = false;
		}
	}


	async initializeAPI() {
		if (this.api === null || this.api === undefined) {
			throw new Error('API Not Initialized. Please restart Obsidian.');
		}

		let apiInitialized = getSettings().token; //getSettings().apiInitialized;
		if (!apiInitialized)
			try {
				const userSettings = await this.api?.getUserSettings();
				if (userSettings) {
					apiInitialized = true;

					await this.api?.getInboxProperties();
					let bSaveSettings = false;
					if (getSettings().inboxID != this.api?.inboxId) {
						//they've logged in with a different user id!
						bSaveSettings = true;
					}
					//this.plugin.settings.inboxID = this.api?.inboxId;
					//this.token = this.plugin.settings.token = this.api?.token;

					//TickTick doesn't allow default Inbox to be renamed. This is safe to do.
					//updateSettings({inboxName: "Inbox"})
					if (!getSettings().defaultProjectId) {
						updateSettings({
							defaultProjectId: this.api?.inboxId,
							defaultProjectName: 'Inbox'
						});
					}
					if (bSaveSettings) {
						await this.plugin.saveSettings();
					}
				} else {
					log.error(this.api?.lastError);
				}
				//updateSettings({apiInitialized: apiInitialized});

				if (apiInitialized) {
					if (getSettings().debugMode) {
						log.debug(`Logged In: ${apiInitialized}`);
					}
				} else {
					new Notice('Login failed, please login through settings.');
					log.error('Login failed! ');
					//updateSettings({apiInitialized: false});
				}
			} catch (error) {
				log.error('Login failed! ', error);
				//updateSettings({apiInitialized: false});
				//apiInitialized = false;
				new Notice(`Login failed: ${error}\nPlease login again`);
			} finally {
				await this.plugin.saveSettings();
			}
	}


	async createTask(taskToAdd: ITask) {
		await this.initializeAPI();
		try {
			const newTask = await this.api?.addTask(taskToAdd);
			return newTask;
		} catch (error) {
			throw new Error(`Error adding task: ${error.message}`);
		}
	}

	async deleteTask(deletedTaskId: string, deletedTaskProjectId: string) {
		await this.initializeAPI();
		try {
			const response = await this.api?.deleteTask(deletedTaskId, deletedTaskProjectId);
			return response;
		} catch (error) {
			throw new Error(`Error deleting task: ${error.message}`);
		}
	}

	async getProjectSections(projectId: string) {
		await this.initializeAPI();
		try {
			const response = await this.api?.getProjectSections(projectId);
			return response;
		} catch (error) {
			throw new Error(`Error getting Sections: ${error.message}`);
		}
	}

	//options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}
	// async GetActiveTasks(options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}) {
	async GetActiveTasks() {
		await this.initializeAPI();
		try {
			//TODO: ALL Tasks are fetched. Evaluate filtering.
			// log.debug("getting all tasks, look into filtering.")
			const result = await this.api?.getTasks();
			return result;
		} catch (error) {
			throw new Error(`Error get active tasks: ${error.message}`);
		}
	}


	//Also note that to remove the due date of a task completely, you should set the due_string parameter to no date or no due date.
	//api does not have a function to update task project id

	async updateTask(taskToUpdate: ITask) {
		await this.initializeAPI();

		try {
			// @ts-ignore
			let updatedTask: ITask | null | undefined = {};
			const saveDateHolder = taskToUpdate.dateHolder;
			const updateResult = await this.api?.updateTask(taskToUpdate);
			if (!updateResult) {
				//bad shit happened.
				log.error('Error', 'Update Failed.', this.api?.lastError, taskToUpdate);
				const error = 'Error updating task: ' + this.api?.lastError;
				throw new Error(error);
			}
			// log.debug("update result: ", updateResult.id2error);
			if (JSON.stringify(updateResult.id2error) === '{}') {
				// log.debug('it is fine');
				//because of the due date BS, we need it back.
				updatedTask = await this.getTaskById(taskToUpdate.id, taskToUpdate.projectId);
				if (updatedTask) {
					updatedTask.dateHolder = saveDateHolder;
				} else {
					log.error('Didn\'t get back the updated Task');
				}
			}
			return updatedTask;
		} catch (error) {
			throw new Error(`Error updating task: ${error.message}`);
		}
	}


	async modifyTaskStatus(taskId: string, projectId: string, taskStatus: number) {
		await this.initializeAPI();
		try {
			let task = await this.api?.getTask(taskId, projectId);
			if (task) {
				task.status = taskStatus;
				const isSuccess = await this.api?.updateTask(task);
				// log.debug(`Task ${taskId} is reopened`)
				return (isSuccess);
			} else {
				return false;
			}
		} catch (error) {
			log.error('Error modifying task:', error);
			return;
		}
	}


	//open a task
	async OpenTask(taskId: string, projectId: string) {
		await this.initializeAPI();
		try {
			this.modifyTaskStatus(taskId, projectId, 0);
		} catch (error) {
			log.error('Error open a task:', error);
			return;
		}
	}

	// Close a task in TickTick API
	async CloseTask(taskId: string, projectId: string): Promise<boolean> {
		await this.initializeAPI();
		try {
			let result = this.modifyTaskStatus(taskId, projectId, 2);
			return result;
		} catch (error) {
			log.error('Error closing task:', error);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}


	// get a task by Id
	async getTaskById(taskId: string, projectId?: string): Promise<ITask | null | undefined> {
		await this.initializeAPI();
		if (!taskId) {
			throw new Error('taskId is required');
		}

		try {
			const task = await this.api?.getTask(taskId, projectId);
			return task;
		} catch (error) {
			if (error.response && error.response.status) {
				const statusCode = error.response.status;
				throw new Error(`Error retrieving task. Status code: ${statusCode}`);
			} else {
				throw new Error(`Error retrieving task: ${error.message}`);
			}
		}
	}

	//get a task due by id
	async getTaskDueById(taskId: string) {
		await this.initializeAPI();
		if (!taskId) {
			throw new Error('taskId is required');
		}
		try {
			const task = await this.api?.getTask(taskId, null);
			const due = task?.dueDate ?? null;
			return due;
		} catch (error) {
			throw new Error(`Error get Task Due By ID: ${error.message}`);
		}
	}


	//get all projects
	async GetAllProjects(): Promise<IProject[]> {
		await this.initializeAPI();
		try {
			return await this.api?.getProjects() ?? [];
		} catch (error) {
			log.error('Error get all projects', error);
			return [];
		}
	}

	//get project groups
	async GetProjectGroups() {
		await this.initializeAPI();
		try {
			const result = await this.api?.getProjectGroups();

			if ((result?.length == 0) && (this.api?.lastError)) {
				if (this.api?.lastError.statusCode != 200) {
					let lastError = this.api?.lastError;
					log.error('Error: ', lastError.operation, lastError.statusCode, lastError.errorMessage);
					throw new Error(lastError.errorMessage);
				}
			}
			return (result);

		} catch (error) {
			log.error('Error get project groups', error);
			new Notice('Unable to get project groups: ' + error, 5000);
			return false;
		}
	}

	//TODO: Added for completeness. Evaluate use later.
	async getUserResources(): Promise<any[]> {
		await this.initializeAPI();
		try {
			const result = await this.api?.getUserSettings();

			return (result);

		} catch (error) {
			log.error('Error get user resources', error);
			return [];
		}
	}

	//TODO: Added for completeness. Evaluate use later.
	async getAllCompletedItems(): Promise<any[]> {
		await this.initializeAPI();
		try {
			const result = await this.api?.getAllCompletedItems();

			return (result);

		} catch (error) {
			log.error('Error get all completed items', error);
			return [];
		}
	}

	async getUpdatedTasks(since: number): Promise<{ update: ITask[], delete: string[] }> {
		await this.initializeAPI();
		if (!this.api) {
			log.error('getAllResources No API.');
			return { update: [], delete: [] };
		}
		try {
			const result = await this.api.getUpdatedTasks(since);
			this._checkpoint = this.api.checkpoint;
			return result;

		} catch (error) {
			log.error('Error get updated tasks', error);
		}
		return { update: [], delete: [] };
	}


	async getAllResources(): Promise<IBatch | null> {
		await this.initializeAPI();
		if (!this.api) {
			log.error('getAllResources No API.');
			return null;
		}
		try {
			const result = await this.api.getAllResources();
			if (!result || (this.api.lastError && this.api.lastError.statusCode != 200)) {
				throw new Error('getAllResources No Results.');
			}

			//checkpoint, may have changed. Save it if it has.
			if (getSettings().checkPoint != result.checkPoint) {
				this.api.checkpoint = result.checkPoint;
				getSettings().checkPoint = <number>this.api?.checkpoint;
				await this.plugin.saveSettings();
			}
			return result;

		} catch (error) {
			log.error('Error get all resources', error);
		}
		return null;
	}

	//TODO: Will need interpretation
	async getAllTasks(): Promise<any[]> {
		await this.initializeAPI();
		try {
			//This returns the SyncBean object, which has ALL the task details
			const result = await this.api?.getTaskDetails();
			if (!result || result.length === 0 && this.api?.lastError.statusCode != 200) {
				throw new Error('No Results.');
			}
			return (result);

		} catch (error) {
			log.error('Error get all Tasks', error);
			return [];
		}
	}

	async exportData(): Promise<string> {
		await this.initializeAPI();
		//This is a CSV backup.
		const result = await this.api?.exportData();
		if (!result) {
			//TODO Assume if something bad happened, API done logged it.
			let error = JSON.stringify(this.api?.lastError);
			error = error.replace(/{/g, '\n').replace(/,/g, '\n');
			throw new Error(`Back up failed ${error}`);
		}
		return result;
	}

	async moveTaskProject(task: ITask, fromProject: string, toProject: string) {
		await this.initializeAPI();

		let result = await this.api?.projectMove(task.id, fromProject, toProject);
		if (!result) {
			log.error('Project Moved Failed: ', this.api?.lastError);
		}

		//Near as I can tell, this is redundant, but TickTick does it. I think it may be a
		// sortorder thing, Just do it.
		await this.api?.updateTask(task);

	}

	async moveTaskParent(taskId: string, oldParentId: string, newParentId: string, projectId: string) {

		if (oldParentId) {
			//Turns out TT does not adjust the parent's children. We have to do it.
			const task = await this.plugin.cacheOperation.loadTaskFromCacheID(oldParentId);
			// log.debug('childIds before filtering:', task?.childIds);
			if (task?.childIds && task.childIds.length > 0) {
				task.childIds = task.childIds.filter(id => id !== taskId);
			}

			// log.debug('childIds after filtering:', task?.childIds);
			const updateResult = await this.api?.updateTask(task);
			// log.debug('updateResult', updateResult);
		}

		const moveResult = await this.api?.parentMove(taskId, newParentId, projectId);
		// log.debug('moveResult of moveResult', moveResult);
	}

}
