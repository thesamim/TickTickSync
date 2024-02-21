import {Tick} from 'ticktick-api-lvt'
import {ITask} from "ticktick-api-lvt/dist/types/Task"
import {App, Notice} from 'obsidian';
import TickTickSync from "../main";
import {IProject} from 'ticktick-api-lvt/dist/types/Project';

export class TickTickRestAPI {
	[x: string]: any;

	app: App;
	plugin: TickTickSync;
	api: Tick | null;
	token: string;
	baseUrl: string;

	constructor(app: App, plugin: TickTickSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
		this.token = this.plugin.settings.token;
		this.baseURL = this.plugin.settings.baseURL;

		if (!this.token || this.token === "" ) {
			new Notice("Please login from Settings.", 0)
			this.api = null;
			console.error("No Token")
		} else {
			if (this.plugin.settings.debugMode) {
				console.log(JSON.stringify({
					baseUrl: this.baseURL,
					token: "[" + this.token.substring(0, 10) + "...]" + " len: " + this.token.length
				}));
			}
			this.api = new Tick({baseUrl: this.plugin.settings.baseURL, token: this.token});
			this.plugin.settings.apiInitialized = false;
		}
	}

	async initializeAPI() {
		if (this.api === null || this.api === undefined) {
			throw new Error("API Not Initialized. Please restart Obsidian.")
		}
		let apiInitialized = this.plugin.settings.apiInitialized;
		if (!apiInitialized)
			try {
				const userSettings = await this.api?.getUserSettings();
				if (userSettings) {
					apiInitialized = true;

					await this.api?.getInboxProperties()
					// console.log("InobxID: ", this.api?.inboxId)
					this.plugin.settings.inboxID = this.api?.inboxId;

					//TickTick doesn't allow default Inbox to be renamed. This is safe to do.
					this.plugin.settings.inboxName = "Inbox"
					if (!this.plugin.settings.defaultProjectId) {
						this.plugin.settings.defaultProjectId = this.api?.inboxId;
						this.plugin.settings.defaultProjectName = "Inbox";
					}
				} else {
					if (this.plugin.settings.debugMode) {
						console.log(userSettings)
					}
					console.error(this.api?.lastError);
				}
				this.plugin.settings.apiInitialized = apiInitialized;

				if (apiInitialized) {
					if (this.plugin.settings.debugMode) {
						console.log(`Logged In: ${apiInitialized}`);
					}
				} else {
					new Notice("Login failed, please login through settings.")
					console.error("Login failed! ");
					this.plugin.settings.apiInitialized = false;
				}
			} catch (error) {
				console.error("Login failed! ", error);
				this.plugin.settings.apiInitialized = false;
				apiInitialized = false;
				new Notice(`Login failed: ${error}\nPlease login again`)
			} finally {
				this.plugin.saveSettings();
			}
	}


	async AddTask(taskToAdd: ITask) {
		await this.initializeAPI();
		try {
			//This hurts my feelings. But TickTick looks at startdate before duedate.
			//For now, just null out the due date.
			taskToAdd.dueDate = '';
			const newTask = await this.api?.addTask(taskToAdd);
			console.log(newTask);
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
			// console.log("getting all tasks, look into filtering.")
			const result = await this.api?.getTasks();
			return result;
		} catch (error) {
			throw new Error(`Error get active tasks: ${error.message}`);
		}
	}


	//Also note that to remove the due date of a task completely, you should set the due_string parameter to no date or no due date.
	//api does not have a function to update task project id

	async UpdateTask(taskToUpdate: ITask) {
		await this.initializeAPI();

		try {
			//This hurts my feelings. But TickTick looks at startdate before duedate.
			//For now, just null out the due date.
			taskToUpdate.dueDate = '';
			let updatedTask = {};
			const updateResult = await this.api?.updateTask(taskToUpdate);
			// console.log("update result: ", updateResult.id2error);
			return updatedTask;
		} catch (error) {
			throw new Error(`Error updating task: ${error.message}`);
		}
	}


	async modifyTaskStatus(taskId: string, projectId: string, taskStatus: number) {
		await this.initializeAPI();
		try {
			let thisTask = await this.api?.getTask(taskId, projectId);
			// console.log("Got task: ", thisTask)
			thisTask.status = taskStatus;


			const isSuccess = await this.api?.updateTask(thisTask);
			// console.log(`Task ${taskId} is reopened`)
			return (isSuccess)
		} catch (error) {
			console.error('Error modifying task:', error);
			return
		}
	}


	//open a task
	async OpenTask(taskId: string, projectId: string) {
		await this.initializeAPI();
		try {
			this.modifyTaskStatus(taskId, projectId, 0)
		} catch (error) {
			console.error('Error open a task:', error);
			return
		}
	}

	// Close a task in TickTick API
	async CloseTask(taskId: string, projectId: string): Promise<boolean> {
		await this.initializeAPI();
		try {
			let result = this.modifyTaskStatus(taskId, projectId, 2);
			return result;
		} catch (error) {
			console.error('Error closing task:', error);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}


	// get a task by Id
	async getTaskById(taskId: string, projectId: string): Promise<ITask> {
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
			const due = task[0]?.dueDate ?? null
			return due;
		} catch (error) {
			throw new Error(`Error get Task Due By ID: ${error.message}`);
		}
	}


	//get all projects
	async GetAllProjects(): Promise<IProject[]> {
		await this.initializeAPI();
		try {
			const result = await this.api?.getProjects();
			return (result)

		} catch (error) {
			console.error('Error get all projects', error);
			return []
		}
	}

	//get project groups
	async GetProjectGroups() {
		await this.initializeAPI();
		try {
			const result = await this.api?.getProjectGroups()

			if ((result?.length == 0) && (this.api?.lastError)) {
				if (this.api?.lastError.statusCode != 200) {
					throw new Error(this.api?.lastError)
				}
			}
			return (result)

		} catch (error) {
			console.error('Error get project groups', error);
			return false
		}
	}

	//TODO: Added for completeness. Evaluate use later.
	async getUserResources(): Promise<any[]> {
		await this.initializeAPI();
		try {
			const result = await this.api?.getUserSettings();

			return (result)

		} catch (error) {
			console.error('Error get user resources', error);
			return []
		}
	}

	//TODO: Added for completeness. Evaluate use later.
	async getAllCompletedItems(): Promise<any[]> {
		await this.initializeAPI();
		try {
			const result = await this.api?.getAllCompletedItems();

			return (result)

		} catch (error) {
			console.error('Error get all completed items', error);
			return []
		}
	}

	//TODO: Will need interpretation
	async getAllResources(): Promise<any[]> {
		await this.initializeAPI();
		try {
			const result = await this.api?.getAllResources();

			return (result)

		} catch (error) {
			console.error('Error get all resources', error);
			return []
		}
	}

	//TODO: Will need interpretation
	async getAllTasks(): Promise<any[]> {
		await this.initializeAPI();
		try {
			//This returns the SyncBean object, which has ALL the task details
			const result = await this.api?.getTasksStatus();
			if (!result || result.length === 0 && this.api?.lastError.statusCode!= 200) {
				throw new Error("No Results.")
			}
			return (result)

		} catch (error) {
			console.error('Error get all Tasks', error);
			return []
		}
	}
	async exportData(): Promise<string> {
		await this.initializeAPI();
		//This is a CSV backup.
		const result = await this.api?.exportData();
		if (!result) {
			let error = this.api?.lastError;
			let bodyParts = JSON.parse(error.body)
			console.error("Back error status.", "\nStatus Code:", error.statusCode, "\nError Code: ", bodyParts.errorCode, "\nError Message: ", bodyParts.errorMessage)
			throw new Error(`Back up failed`)
		}
		return (result)
	}

	async moveTaskProject(task: ITask, fromProject: string, toProject: string) {
		await this.initializeAPI();

		let result = await this.api?.projectMove(task.id, fromProject, toProject);
		if (!result) {
			console.error("Project Moved Failed: ", this.api?.lastError)
		}

		//Near as I can tell, this is redundant, but TickTick does it. I think it may be a
		// sortorder thing, Just do it.
		await this.api?.updateTask(task)

	}

	async moveTaskParent(taskId: string, newParentId: string, projectId: string ) {

		const task = await this.api?.getTask(taskId, projectId);

		//For some reason, ticktick updates the task with the new parent id first, then do the parentMove. Seems
		//redundant to me, but there must be a reason. Right?
		(task as unknown as ITask).parentId = newParentId;
		let result = await this.api?.updateTask(task);

		result = await this.api?.parentMove(taskId, newParentId, projectId);


	}

}
