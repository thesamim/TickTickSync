import { App} from 'obsidian';
import UltimateTickTickSyncForObsidian from "../main";

interface Due {
    date?: string;
    [key: string]: any; // allow for additional properties
}

export class CacheOperation {
    app:App;
    plugin: UltimateTickTickSyncForObsidian;
    
    constructor(app:App, plugin: UltimateTickTickSyncForObsidian) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }
    
    
    
    
    
    async getFileMetadata(filepath:string) {
        return this.plugin.settings.fileMetadata[filepath] ?? null
    }
    
    async getFileMetadatas(){
        return this.plugin.settings.fileMetadata ?? null
    }
    
    async newEmptyFileMetadata(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if(metadatas[filepath]) {
            return
        }
        else{
            metadatas[filepath] = {}
        }
        metadatas[filepath].TickTickTasks = [];
        metadatas[filepath].TickTickCount = 0;
        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        
    }
    
    async updateFileMetadata(filepath:string,newMetadata) {
        const metadatas = this.plugin.settings.fileMetadata
        
        // If the metadata object does not exist, create a new object and add it to metadatas
        if (!metadatas[filepath]) {
            metadatas[filepath] = {}
        }
        
        //Update attribute values ​​in the metadata object
        metadatas[filepath].TickTickTasks = newMetadata.TickTickTasks;
        metadatas[filepath].TickTickCount = newMetadata.TickTickCount;
        
        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        
    }
    
    async deleteTaskIdFromMetadata(filepath:string,taskId:string){
        console.log(filepath)
        const metadata = await this.getFileMetadata(filepath)
        console.log(metadata)
        const newTickTickTasks = metadata.TickTickTasks.filter(function(element){
            return element !== taskId
        })
        const newTickTickCount = metadata.TickTickCount - 1
        let newMetadata = {}
        newMetadata.TickTickTasks = newTickTickTasks
        newMetadata.TickTickCount = newTickTickCount
        console.log(`new metadata ${newMetadata}`)
        
        
    }
    
    //delete filepath from filemetadata
    async deleteFilepathFromMetadata(filepath:string){
        Reflect.deleteProperty(this.plugin.settings.fileMetadata, filepath);
        this.plugin.saveSettings()
        console.log(`${filepath} is deleted from file metadatas.`)
    }
    
    
    //Check errors in filemata where the filepath is incorrect.
    async checkFileMetadata(){
        const metadatas = await this.getFileMetadatas()
        for (const key in metadatas) {
            let filepath = key
            const value = metadatas[key];
            let file = this.app.vault.getAbstractFileByPath(key)
            if(!file && (value.TickTickTasks?.length === 0 || !value.TickTickTasks)){
                console.log(`${key} is not existed and metadata is empty.`)
                await this.deleteFilepathFromMetadata(key)
                continue
            }
            if(value.TickTickTasks?.length === 0 || !value.TickTickTasks){
                //todo
                //delelte empty metadata
                continue
            }
            //check if file exists
            
            if(!file){
                //search new filepath
                console.log(`file ${filepath} is not exist`)
                const TickTickId1 = value.TickTickTasks[0]
                console.log(TickTickId1)
                const searchResult = await this.plugin.fileOperation.searchFilepathsByTaskidInVault(TickTickId1)
                console.log(`new file path is`)
                console.log(searchResult)
                
                //update metadata
                await this.updateRenamedFilePath(filepath,searchResult)
                this.plugin.saveSettings()
                
            }
            
            
            //const fileContent = await this.app.vault.read(file)
            //check if file include all tasks
            
            
            /*
            value.TickTickTasks.forEach(async(taskId) => {
                const taskObject = await this.plugin.cacheOperation.loadTaskFromCacheyID(taskId)
                
                
            });
            */
        }
        
    }
    
    getDefaultProjectNameForFilepath(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectName
        }
        else{
            const defaultProjectId = metadatas[filepath].defaultProjectId
            const defaultProjectName = this.getProjectNameByIdFromCache(defaultProjectId)
            return defaultProjectName
        }
    }
    
    
    getDefaultProjectIdForFilepath(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectId
        }
        else{
            const defaultProjectId = metadatas[filepath].defaultProjectId
            return defaultProjectId
        }
    }
    
    setDefaultProjectIdForFilepath(filepath:string,defaultProjectId:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath]) {
            metadatas[filepath] = {}
        }
        metadatas[filepath].defaultProjectId = defaultProjectId
        
        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        
    }
    
    
    //Read all tasks from Cache
    loadTasksFromCache() {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            return savedTasks;
        } catch (error) {
            console.error(`Error loading tasks from Cache: ${error}`);
            return [];
        }
    }
    
    
    // Overwrite and save all tasks to cache
    saveTasksToCache(newTasks) {
        try {
            this.plugin.settings.TickTickTasksData.tasks = newTasks
            
        } catch (error) {
            console.error(`Error saving tasks to Cache: ${error}`);
            return false;
        }
    }
    
    
    
    
    //append event to Cache
    appendEventToCache(event:Object[]) {
        try {
            this.plugin.settings.TickTickTasksData.events.push(event)
        } catch (error) {
            console.error(`Error append event to Cache: ${error}`);
        }
    }
    
    //append events to Cache
    appendEventsToCache(events:Object[]) {
        try {
            this.plugin.settings.TickTickTasksData.events.push(...events)
        } catch (error) {
            console.error(`Error append events to Cache: ${error}`);
        }
    }
    
    
    //Read all events from the Cache file
    loadEventsFromCache() {
        try {
            
            const savedEvents = this.plugin.settings.TickTickTasksData.events
            return savedEvents;
        } catch (error) {
            console.error(`Error loading events from Cache: ${error}`);
        }
    }
    
    
    
    //Append to Cache file
    appendTaskToCache(task) {
        try {
            if(task === null){
                return
            }
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            //const taskAlreadyExists = savedTasks.some((t) => t.id === task.id);
            //if (!taskAlreadyExists) {
            //, when using the push method to insert a string into a Cache object, it will be treated as a simple key-value pair, where the key is the numeric index of the array and the value is the string itself. But if you use the push method to insert another Cache object (or array) into the Cache object, the object will become a nested sub-object of the original Cache object. In this case, the key is the numeric index and the value is the nested Cache object itself.
            //}
            this.plugin.settings.TickTickTasksData.tasks.push(task);
        } catch (error) {
            console.error(`Error appending task to Cache: ${error}`);
        }
    }
    
    
    
    
    //Read the task with the specified id
    loadTaskFromCacheyID(taskId) {
        try {
            
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            //console.log(savedTasks)
            const savedTask = savedTasks.find((t) => t.id === taskId);
            //console.log(savedTask)
            return(savedTask)
        } catch (error) {
            console.error(`Error finding task from Cache: ${error}`);
            return [];
        }
    }
    
    //Overwrite the task with the specified id in update
    updateTaskToCacheByID(task) {
        try {
            
            
            //Delete the existing task
            this.deleteTaskFromCache(task.id)
            //Add new task
            this.appendTaskToCache(task)
            
        } catch (error) {
            console.error(`Error updating task to Cache: ${error}`);
            return [];
        }
    }
    
    //The structure of due {date: "2025-02-25",isRecurring: false,lang: "en",string: "2025-02-25"}
    
    
    
    modifyTaskToCacheByID(taskId: string, { content, due }: { content?: string, due?: Due }): void {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks;
            const taskIndex = savedTasks.findIndex((task) => task.id === taskId);
            
            if (taskIndex !== -1) {
                const updatedTask = { ...savedTasks[taskIndex] };
                
                if (content !== undefined) {
                    updatedTask.content = content;
                }
                
                if (due !== undefined) {
                    if (due === null) {
                        updatedTask.due = null;
                    } else {
                        updatedTask.due = due;
                    }
                }
                
                savedTasks[taskIndex] = updatedTask;
                
                this.plugin.settings.TickTickTasksData.tasks = savedTasks;
            } else {
                throw new Error(`Task with ID ${taskId} not found in cache.`);
            }
        } catch (error) {
            // Handle the error appropriately, eg by logging it or re-throwing it.
        }
    }
    
    
    //open a task status
    reopenTaskToCacheByID(taskId:string) {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            
            
            // Loop through the array to find the item with the specified ID
            for (let i = 0; i < savedTasks.length; i++) {
                if (savedTasks[i].id === taskId) {
                    //Modify the properties of the object
                    savedTasks[i].isCompleted = false;
                    break; // Found and modified the item, break out of the loop
                }
            }
            this.plugin.settings.TickTickTasksData.tasks = savedTasks
            
        } catch (error) {
            console.error(`Error open task to Cache file: ${error}`);
            return [];
        }
    }
    
    
    
    //close a task status
    closeTaskToCacheByID(taskId:string):Promise<void> {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            
            // Loop through the array to find the item with the specified ID
            for (let i = 0; i < savedTasks.length; i++) {
                if (savedTasks[i].id === taskId) {
                    //Modify the properties of the object
                    savedTasks[i].isCompleted = true;
                    break; // Found and modified the item, break out of the loop
                }
            }
            this.plugin.settings.TickTickTasksData.tasks = savedTasks
            
        } catch (error) {
            console.error(`Error close task to Cache file: ${error}`);
            throw error; // Throw an error so that the caller can catch and handle it
        }
    }
    
    
    //Delete task by ID
    deleteTaskFromCache(taskId) {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            const newSavedTasks = savedTasks.filter((t) => t.id !== taskId);
            this.plugin.settings.TickTickTasksData.tasks = newSavedTasks
        } catch (error) {
            console.error(`Error deleting task from Cache file: ${error}`);
        }
    }
    
    
    
    
    
    //Delete task through ID array
    deleteTaskFromCacheByIDs(deletedTaskIds) {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            const newSavedTasks = savedTasks.filter((t) => !deletedTaskIds.includes(t.id))
            this.plugin.settings.TickTickTasksData.tasks = newSavedTasks
        } catch (error) {
            console.error(`Error deleting task from Cache : ${error}`);
        }
    }
    
    
    //Find project id by name
    getProjectIdByNameFromCache(projectName:string) {
        try {
            const savedProjects = this.plugin.settings.TickTickTasksData.projects
            const targetProject = savedProjects.find(obj => obj.name === projectName);
            const projectId = targetProject ? targetProject.id : null;
            return(projectId)
        } catch (error) {
            console.error(`Error finding project from Cache file: ${error}`);
            return(false)
        }
    }
    
    
    
    getProjectNameByIdFromCache(projectId:string) {
        try {
            const savedProjects = this.plugin.settings.TickTickTasksData.projects
            const targetProject = savedProjects.find(obj => obj.id === projectId);
            const projectName = targetProject ? targetProject.name : null;
            return(projectName)
        } catch (error) {
            console.error(`Error finding project from Cache file: ${error}`);
            return(false)
        }
    }
    
    
    
    //save projects data to json file
    async saveProjectsToCache() {
        try{
            //get projects
            console.log("here")
            console.log(`Save Projects to cachetry with ${this.plugin.tickTickRestAPI}`)
            const projectGroups = await this.plugin.tickTickRestAPI?.GetProjectGroups();
            const projects = await this.plugin.tickTickRestAPI?.GetAllProjects();
            
            
            if(this.plugin.settings.debugMode){
                if (projectGroups !== undefined && projectGroups !== null) {
                    console.log("==== projectGroups")
                    console.log(projectGroups.map((item) => item.name));
                }else {
                    console.log("==== No projectGroups")
                }
                // ===============
                if (projects !== undefined && projects !== null) {
                    console.log("==== projects -->") 
                    // console.log(projects.map((item) => item.name));
                    projects.forEach(async project => {
                        const singleProject = await this.plugin.TickTickRestAPI?.getProjects(project.id);
                        const sections = await this.plugin.TickTickRestAPI?.getProjectSections(project.id);
                        console.log(`Project: ${project.name} -- ${sections}`);
                        if (sections !== undefined && sections !== null && sections.length > 0) {
                            sections.forEach(section => {
                                console.log(project.name + '--' + section.name);
                            })
                        } else {
                            console.log(project.name + '--' + 'no sections')
                        }
                    })
                } else {
                    console.log("==== No projects")
                }
                
                // ================
            }
            if(!projects){
                return false
            }
            
            //save to json
            this.plugin.settings.TickTickTasksData.projects = projects
            
            return true
            
        }catch(error){
            console.log(`error downloading projects: ${error}`)
            return false
        }
        
    }
    
    
    async updateRenamedFilePath(oldpath:string,newpath:string){
        try{
            console.log(`oldpath is ${oldpath}`)
            console.log(`newpath is ${newpath}`)
            const savedTask = await this.loadTasksFromCache()
            //console.log(savedTask)
            const newTasks = savedTask.map(obj => {
                if (obj.path === oldpath) {
                    return { ...obj, path: newpath };
                }else {
                    return obj;
                }
            })
            //console.log(newTasks)
            await this.saveTasksToCache(newTasks)
            
            //update filepath
            const fileMetadatas = this.plugin.settings.fileMetadata
            fileMetadatas[newpath] = fileMetadatas[oldpath]
            delete fileMetadatas[oldpath]
            this.plugin.settings.fileMetadata = fileMetadatas
            
        }catch(error){
            console.log(`Error updating renamed file path to cache: ${error}`)
        }
        
        
    }
    
}
