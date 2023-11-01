import { Tick } from 'ticktick-api-lvt'
import ITask from "ticktick-api-lvt/src/types/Task"
import { App, Notice} from 'obsidian';
import UltimateTickTickSyncForObsidian from "../main";
import { IProject } from 'ticktick-api-lvt/dist/types/Project';

//convert date from obsidian event
// Usage example
//const str = "2023-03-27";
//const utcStr = localDateStringToUTCDatetimeString(str);
//console.log(dateStr); // Output 2023-03-27T00:00:00.000Z
function localDateStringToUTCDatetimeString(localDateString:string) {
    try {
        console.log(`data string: ${localDateString}`)
        if(localDateString === null){
            return null
        }
        localDateString = localDateString + "T08:00";
        let localDateObj = new Date(localDateString);
        let ISOString = localDateObj.toISOString()
        return(ISOString);
    } catch (error) {
        console.error(`Error extracting date from string '${localDateString}': ${error}`);
        return null;
    }
}

export class TickTickRestAPI {
    [x: string]: any;
    app:App;
    plugin: UltimateTickTickSyncForObsidian;
    api: Tick;
    
    constructor(app:App, plugin:UltimateTickTickSyncForObsidian) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }
    
    
    async initializeAPI(){
        //Because we can't have async constructors, make sure the first call initializes the API
        if (this.api === null || this.api === undefined) {
            let apiInitialized;
            try {
                const api = new Tick({username: this.plugin.settings.username, password: this.plugin.settings.password});
                apiInitialized = await api.login();
                console.log(`Login Result: ${apiInitialized}`); 
                this.plugin.settings.apiInitialized  = apiInitialized;  
                
                if (apiInitialized) {
                    this.api = api;
                    console.log(`Logged In: ${apiInitialized}`);   
                } else {
                    new Notice("Login failed, please check userID and password")
                }
            } catch(error) {
                console.error("Login failed! ", error);
                this.plugin.settings.apiInitialized  = false;
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

    async getProjectSections(projectId: string ) {
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
            //TODO: Filtering here.
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
        // if (!taskId) {
        //     throw new Error('taskId is required');
        // }
        // if (!updates.content && !updates.description &&!updates.dueDate &&  !updates.labels &&!updates.parentId && !updates.priority) {
        //     throw new Error('At least one update is required');
        // }
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
            console.log("Due Date on Modify Task: ", thisTask.dueDate);
            thisTask.dueDate = fixDueDate(thisTask.dueDate);
            
            const isSuccess = await this.api.updateTask(thisTask);
            // console.log(`Task ${taskId} is reopened`)
            return(isSuccess)
        } catch (error) {
            console.error('Error modifying task:', error);
            return
        }
    }
    
    
    //open a task
    async OpenTask(taskId:string, projectId: string) {
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
    async getTaskById(taskId: string, projectId: string) {
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
            const due = task[0].due ?? null
            return due;
        } catch (error) {
            throw new Error(`Error get Task Due By ID: ${error.message}`);
        }
    }
    
    
    //get all projects
    async GetAllProjects() : Promise<IProject[]> {
        await this.initializeAPI(); 
        try {
            const result = await this.api.getProjects();
            return(result)
            
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
            
            return(result)
            
        } catch (error) {
            console.error('Error get project groups', error);
            return false
        }
    }
    //TODO: Added for completeness, but I don't thing we use it anywhere.
    async getUserResources() : Promise<any[]> {
        await this.initializeAPI();
        try {
            const result = await this.api.getUserSettings();
            
            return(result)
            
        } catch (error) {
            console.error('Error get user resources', error);
            return []
        }
    }
    
    //TODO: Added for completeness, but I don't thing we use it anywhere.
    async getAllCompletedItems() : Promise<any[]> {
        await this.initializeAPI();
        try {
            const result = await this.api.getAllCompletedItems();
            
            return(result)
            
        } catch (error) {
            console.error('Error get all completed items', error);
            return []
        }
    }

    //TODO: Will need interpretation
    async getAllResources() : Promise<any[]> {
        await this.initializeAPI();
        try {
            const result = await this.api.getAllResources();
            
            return(result)
            
        } catch (error) {
            console.error('Error get all resources', error);
            return []
        }
    }

    //TODO: Will need interpretation
    async getAllTasks() : Promise<any[]> {
        await this.initializeAPI();
        try {
            //This returns the SyncBean object, which has ALL the task details
            const result = await this.api.getTasksStatus(); 
            
            return(result)
            
        } catch (error) {
            console.error('Error get all Tasks', error);
            return []
        }
    }



}




function fixDueDate(dueDate: string) : string{
    if (dueDate) {
        console.log(dueDate);
        dueDate = localDateStringToUTCDatetimeString(dueDate);
        console.log(dueDate);
    }
    return dueDate;
}

