import { Tick } from 'ticktick-api-lvt'
import {ITask} from "ticktick-api-lvt/dist/types/Task"
import { App, Notice } from 'obsidian';
import TickTickSync from "../main";
import { IProject } from 'ticktick-api-lvt/dist/types/Project';


export class TickTickRestAPI {
    [x: string]: any;
    app: App;
    plugin: TickTickSync;
    api: Tick;

    constructor(app: App, plugin: TickTickSync) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }


    async initializeAPI() {
        //Because we can't have async constructors, make sure the first call initializes the API
        if (this.api === null || this.api === undefined) {
            let apiInitialized;
            try {
				const userName = this.plugin.settings.username;
				const password = this.plugin.settings.password;
				const token = this.plugin.settings.token;
				if (!token || token === "" || !userName || userName === "" || !password || password === "") {
					new Notice("Please login from Settings.", 0)
				}
				//TODO: prevent repeated logins
                const api = new Tick({ username: userName, password: password, token: token });
                apiInitialized = await api.login();

                this.plugin.settings.apiInitialized = apiInitialized;

                if (apiInitialized) {
                    this.api = api;
                    if (this.plugin.settings.debugMode) {
                        console.log(`Logged In: ${apiInitialized}`);
                    }
                } else {
                    new Notice("Login failed, please check userID and password")
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
    }

    async AddTask(taskToAdd: ITask) {
        await this.initializeAPI();
        try {
            const newTask = await this.api.addTask(taskToAdd);
            return newTask;
        } catch (error) {
            throw new Error(`Error adding task: ${error.message}`);
        }
    }

    async deleteTask(deletedTaskId: string, deletedTaskProjectId: string) {
        await this.initializeAPI();
        try {
            const response = await this.api.deleteTask(deletedTaskId, deletedTaskProjectId);
            return response;
        } catch (error) {
            throw new Error(`Error deleting task: ${error.message}`);
        }
    }

    async getProjectSections(projectId: string) {
        await this.initializeAPI();
        try {
            const response = await this.api.getProjectSections(projectId);
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
            const result = await this.api.getTasks();
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
            const updatedTask = await this.api.updateTask(taskToUpdate);
            return updatedTask;
        } catch (error) {
            throw new Error(`Error updating task: ${error.message}`);
        }
    } 


    async modifyTaskStatus(taskId: string, projectId: string, taskStatus: number) {
        await this.initializeAPI();
        try {
            let thisTask = await this.api.getTask(taskId, projectId);
            // console.log("Got task: ", thisTask)
            thisTask.status = taskStatus;


            const isSuccess = await this.api.updateTask(thisTask);
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
    async getTaskById(taskId: string, projectId: string) : Promise<ITask>  {
        await this.initializeAPI();
        if (!taskId) {
            throw new Error('taskId is required');
        }

        try {
            const task = await this.api.getTask(taskId, projectId);
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
            const task = await this.api.getTask(taskId);
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
            const result = await this.api.getProjects();
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
            const result = await this.api.getProjectGroups()

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
            const result = await this.api.getUserSettings();

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
            const result = await this.api.getAllCompletedItems();

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
            const result = await this.api.getAllResources();

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
            const result = await this.api.getTasksStatus();

            return (result)

        } catch (error) {
            console.error('Error get all Tasks', error);
            return []
        }
    }



}
