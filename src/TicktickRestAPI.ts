import { Tick } from 'ticktick-api-lvt'
import { App} from 'obsidian';
import UltimateTickTickSyncForObsidian from "../main";
//convert date from obsidian event
// Usage example
//const str = "2023-03-27";
//const utcStr = localDateStringToUTCDatetimeString(str);
//console.log(dateStr); // Output 2023-03-27T00:00:00.000Z
function localDateStringToUTCDatetimeString(localDateString:string) {
    try {
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
    api: TickTickRestAPI;
    
    constructor(app:App, plugin:UltimateTickTickSyncForObsidian) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
        this.api = this.initializeAPI();
    }
    
    
    async initializeAPI(){
        const api = new Tick({username: this.plugin.settings.username, password: this.plugin.settings.password});
        let apiInitialized = await api.login();
        console.log(`Logged In: ${apiInitialized}`);   
        this.plugin.settings.apiInitialized  = apiInitialized;        
        return(api)
    }
    
    async AddTask({ projectId, content, parentId = null, dueDate, dueDatetime,labels, description,priority }: { projectId: string, content: string, parentId?: string , dueDate?: string, dueDatetime?: string, labels?: Array<string>, description?: string,priority?:number }) {
        const api = await this.initializeAPI()
        try {
            if(dueDate){
                dueDatetime = localDateStringToUTCDatetimeString(dueDatetime)
                dueDate = null
            }
            const newTask = await api.addTask({
                projectId,
                content,
                parentId,
                dueDate,
                labels,
                description,
                priority
            }, false);
            return newTask;
        } catch (error) {
            throw new Error(`Error adding task: ${error.message}`);
        }
    }
    
    
    //options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}
    async GetActiveTasks(options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}) {
        const api = await this.initializeAPI()
        try {
            const result = await api.getTasks(options);
            return result;
        } catch (error) {
            throw new Error(`Error get active tasks: ${error.message}`);
        }
    }
    
    
    //Also note that to remove the due date of a task completely, you should set the due_string parameter to no date or no due date.
    //api does not have a function to update task project id
    async UpdateTask(taskId: string, updates: { content?: string, description?: string, labels?:Array<string>,dueDate?: string,dueDatetime?: string,dueString?:string,parentId?:string,priority? :number }) {
        const api = await this.initializeAPI()
        if (!taskId) {
            throw new Error('taskId is required');
        }
        if (!updates.content && !updates.description &&!updates.dueDate && !updates.dueDatetime && !updates.dueString && !updates.labels &&!updates.parentId && !updates.priority) {
            throw new Error('At least one update is required');
        }
        try {
            if(updates.dueDate){
                console.log(updates.dueDate)
                updates.dueDatetime = localDateStringToUTCDatetimeString(updates.dueDate)
                updates.dueDate = null
                console.log(updates.dueDatetime)
            }
            const updatedTask = await api.updateTask(taskId, updates);
            return updatedTask;
        } catch (error) {
            throw new Error(`Error updating task: ${error.message}`);
        }
    }
    
    
    
    
    //open a task
    async OpenTask(taskId:string) {
        const api = await this.initializeAPI()
        try {
            
            const isSuccess = await api.reopenTask(taskId);
            console.log(`Task ${taskId} is reopened`)
            return(isSuccess)
            
        } catch (error) {
            console.error('Error open a task:', error);
            return
        }
    }
    
    // Close a task in TickTick API
    async CloseTask(taskId: string): Promise<boolean> {
        const api = await this.initializeAPI()
        try {
            const isSuccess = await api.closeTask(taskId);
            console.log(`Task ${taskId} is closed`)
            return isSuccess;
        } catch (error) {
            console.error('Error closing task:', error);
            throw error; // Throw an error so that the caller can catch and handle it
        }
    }
    
    
    
    
    // get a task by Id
    async getTaskById(taskId: string) {
        const api = await this.initializeAPI()
        if (!taskId) {
            throw new Error('taskId is required');
        }
        try {
            const task = await api.getTask(taskId);
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
        const api = await this.initializeAPI()
        if (!taskId) {
            throw new Error('taskId is required');
        }
        try {
            const task = await api.getTask(taskId);
            const due = task.due ?? null
            return due;
        } catch (error) {
            throw new Error(`Error updating task: ${error.message}`);
        }
    }
    
    
    //get all projects
    async GetAllProjects() {
        console.log("Get ALL PRoects")
        const api = await this.initializeAPI()
        try {
            const result = await api.getProjects();
            return(result)
            
        } catch (error) {
            console.error('Error get all projects', error);
            return false
        }
    }
    
    //get project groups
    async GetProjectGroups() {
        console.log("Get project gruops") 
        const api = await this.initializeAPI()
        try {
            const result = await api.getProjectGroups()

            return(result)
            
        } catch (error) {
            console.error('Error get all projects', error);
            return false
        }
    }
    
}





















