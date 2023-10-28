import { App} from 'obsidian';
import UltimateTickTickSyncForObsidian from "../main";
import { ITask } from 'ticktick-api-lvt/dist/types/Task';
import { IProject } from 'ticktick-api-lvt/dist/types/Project';

//todo: do we need this?
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
    
   
    async newEmptyFileMetadata(filepath:string, projectId: string){
        const metadatas = this.plugin.settings.fileMetadata
        if(metadatas[filepath]) {
            return
        }
        else{
            metadatas[filepath] = {}
        }
        metadatas[filepath].TickTickTasks = [];
        metadatas[filepath].TickTickCount = 0;
        if (projectId) {
            metadatas[filepath].defaultProjectId = projectId;
        }
        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        return this.plugin.settings.fileMetadata[filepath]
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
        console.log("Deleting from metadata")
        // console.log(filepath)
        const metadata = await this.getFileMetadata(filepath)
        // console.log(metadata)
        const newTickTickTasks = metadata.TickTickTasks.filter(function(element){
            return element !== taskId
        })
        const newTickTickCount = metadata.TickTickCount - 1
        let newMetadata = {}
        newMetadata.TickTickTasks = newTickTickTasks
        newMetadata.TickTickCount = newTickTickCount
        // console.log(`new metadata ${newMetadata}`)
    }
    
    async deleteTaskIdFromMetadataByTaskId(taskId: string) {
        const metadatas = await this.getFileMetadatas()
        for (var file in metadatas) {
          var tasks = metadatas[file].TickTickTasks;
          var count = metadatas[file].TickTickCount;
          
          if (tasks && tasks.includes(taskId)) {
            tasks.splice(tasks.indexOf(taskId), 1);
            metadatas[file].TickTickCount = count - 1;
            if (tasks.length === 0) {
              delete metadatas[file];
            }
            break;
          }
        }
      }
    //delete filepath from filemetadata
    async deleteFilepathFromMetadata(filepath:string){
        Reflect.deleteProperty(this.plugin.settings.fileMetadata, filepath);
        await this.plugin.saveSettings()
        // console.log(`${filepath} is deleted from file metadatas.`)
    }
    
    
    //Check errors in filemata where the filepath is incorrect.
    async checkFileMetadata(): Promise<number> {
        const metadatas = await this.getFileMetadatas()
        // console.log("md: ", metadatas)
        
        for (const key in metadatas) {
            let filepath = key
            const value = metadatas[key];
            // console.log("File: ", value)
            let file = this.app.vault.getAbstractFileByPath(key)
            if(!file && (value.TickTickTasks?.length === 0 || !value.TickTickTasks)){
                console.log(`${key} does not exist and metadata is empty.`)
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
                // console.log(`file ${filepath} is not exist`)
                const TickTickId1 = value.TickTickTasks[0]
                // console.log(TickTickId1)
                const searchResult = await this.plugin.fileOperation.searchFilepathsByTaskidInVault(TickTickId1)
                // console.log(`new file path is`)
                // console.log(searchResult)
                
                //update metadata
                await this.updateRenamedFilePath(filepath,searchResult)
                await this.plugin.saveSettings()
                
            }
            
            //const fileContent = await this.app.vault.read(file)
            //check if file include all tasks
            
            
            /*
            value.TickTickTasks.forEach(async(taskId) => {
                const taskObject = await this.plugin.cacheOperation.loadTaskFromCacheyID(taskId)
                
                
            });
            */
            
        }
        return Object.keys(metadatas).length;        
    }
    
    async getDefaultProjectNameForFilepath(filepath:string){
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
    
    
    async getDefaultProjectIdForFilepath(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectId
        }
        else{
            const defaultProjectId = metadatas[filepath].defaultProjectId
            return defaultProjectId
        }
    }
    
    async getFilepathForProjectId(projectId:string){
        const metadatas = this.plugin.settings.fileMetadata
        

        //If this project is set as a default for a file, return that file.
        for (const key in metadatas) {
            const value = metadatas[key];
            if (metadatas[key].defaultProjectId === projectId) {
                return key; 
            }
        };
        console.log("Not found")
        //otherwise, return the project name as a md file and hope for the best.
        //TODO: Does thi do what I think it does?
        let filePath = await this.getProjectNameByIdFromCache(projectId) + ".md"

        if (!filePath) {
            filePath = this.plugin.settings.defaultProjectName + ".md"
        }
        console.log("getFilepathForProjectId filepath: ", filePath)
        return filePath;
    }

    async setDefaultProjectIdForFilepath(filepath:string,defaultProjectId:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath]) {
            metadatas[filepath] = {}
        }
        metadatas[filepath].defaultProjectId = defaultProjectId
        
        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        
    }
    
    
    //Read all tasks from Cache
    async loadTasksFromCache() {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            return savedTasks;
        } catch (error) {
            console.error(`Error loading tasks from Cache: ${error}`);
            return [];
        }
    }
    
    
    // Overwrite and save all tasks to cache
    async saveTasksToCache(newTasks) {
        try {
            this.plugin.settings.TickTickTasksData.tasks = newTasks
            
        } catch (error) {
            console.error(`Error saving tasks to Cache: ${error}`);
            return false;
        }
    }
    
    
    //Append to Cache file
    async appendTaskToCache(task: ITask) {
        try {
            if(task === null){
                return
            }
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            if (!savedTasks) {
                this.plugin.settings.TickTickTasksData.tasks = [];
                await this.plugin.saveSettings();
            }
            this.plugin.settings.TickTickTasksData.tasks.push(task);
        } catch (error) {
            console.error(`Error appending task to Cache: ${error}`);
        }
    }
    
    
    async appendTasksToCache(tasks: ITask[]) {
        tasks.forEach(async task => {
            await this.appendTaskToCache(task);
            
        });
    }
    
    //Read the task with the specified id
    async loadTaskFromCacheID(taskId) {
        // console.log("loadTaskFromCacheID")
        try {
            
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            // console.log("saved Tasks", savedTasks)
            const savedTask = savedTasks.find((t) => t.id === taskId);
            // console.log("saved Task: ", savedTask)
            return(savedTask)
        } catch (error) {
            console.error(`Error finding task from Cache: ${error}`);
            return [];
        }
    }
    
    //Overwrite the task with the specified id in update
    async updateTaskToCacheByID(task) {
        try {
            //Delete the existing task
            this.deleteTaskFromCache(task.id)
            //Add new task
            await this.appendTaskToCache(task)
            
        } catch (error) {
            console.error(`Error updating task to Cache: ${error}`);
            return [];
        }
    }
    
    async getProjectIdForTask(taskId: string) {
        const savedTasks = this.plugin.settings.TickTickTasksData.tasks;
            const taskIndex = savedTasks.findIndex((task) => task.id === taskId);
            
            if (taskIndex !== -1) {
                console.log(savedTasks[taskIndex].id, savedTasks[taskIndex].projectId);
                return savedTasks[taskIndex].projectId;
            }
    }
    //The structure of due {date: "2025-02-25",isRecurring: false,lang: "en",string: "2025-02-25"}
    
    
    //Todo: This is probably broke ass.
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
                    savedTasks[i].status = 0;
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
                    savedTasks[i].status = 0;
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
    deleteTaskFromCache(taskId: string) {
        try {
            console.log("Single Task delete")
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            const newSavedTasks = savedTasks.filter((t) => t.id !== taskId);
            this.plugin.settings.TickTickTasksData.tasks = newSavedTasks
        } catch (error) {
            console.error(`Error deleting task from Cache file: ${error}`);
        }
    }
    
    
    
    
    
    //Delete task through ID array
    async deleteTaskFromCacheByIDs(deletedTaskIds: string[]) {
        try {
            console.log("Deleting Tasks from Cache")
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            console.log("We start with: ", savedTasks.length)
            console.log("we're going to delete: ", deletedTaskIds.length)
            const newSavedTasks = savedTasks.filter((t) => !deletedTaskIds.includes(t.id))
            console.log("We end up with ", newSavedTasks.length)
            console.log("Hope the math works.")
            this.plugin.settings.TickTickTasksData.tasks = newSavedTasks
            //clean up file meta data
            deletedTaskIds.forEach(async taskId => {
                await this.deleteTaskIdFromMetadataByTaskId(taskId)    
            });

            
        } catch (error) {
            console.error(`Error deleting task from Cache : ${error}`);
        }
    }
    
    
    //Find project id by name
    async getProjectIdByNameFromCache(projectName:string) {
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
    
    
    
    async getProjectNameByIdFromCache(projectId:string) {
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
            // console.log(`Save Projects to cache with ${this.plugin.tickTickRestAPI}`)
            const projectGroups = await this.plugin.tickTickRestAPI?.GetProjectGroups();
            const projects: IProject[] = await this.plugin.tickTickRestAPI?.GetAllProjects();
            //todo: consider doing it all from here. For now, just want the inbox ID
            const allResources = await this.plugin.tickTickRestAPI?.getAllResources();
            const inboxId = allResources["inboxId"];
            this.plugin.settings.defaultProjectId = inboxId;
            this.plugin.settings.defaultProjectName = "Inbox";

            
            let inboxProject = {id: inboxId, name: "Inbox"};

            projects.push(inboxProject);

            if(this.plugin.settings.debugMode){
                if (projectGroups !== undefined && projectGroups !== null) {
                    console.log("==== projectGroups")
                    console.log(projectGroups.map((item) => item.name));
                }else {
                    console.log("==== No projectGroups")
                }
                // ===============
                if (projects !== undefined && projects !== null) {
                    console.log("==== projects -->", projects.length) 
                    projects.forEach(async project => {
                        
                        const sections = await this.plugin.tickTickRestAPI?.getProjectSections(project.id);
                        if (sections !== undefined && sections !== null && sections.length > 0) {
                            console.log(`Project: ${project.name}`);
                            sections.forEach(section => {
                                console.log('\t' + section.name); 
                            })
                        } else {
                            console.log(`Project: ${project.name}`);
                            console.log('\t' + 'no sections')
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
            //TODO: Do we want to deal with sections.
            this.plugin.settings.TickTickTasksData.projects = projects
            await this.plugin.saveSettings(); 
            return true
            
        }catch(error){
            console.error(`error downloading projects: ${error}`)
            return false
        }
        
    }
    
    
    async updateRenamedFilePath(oldpath:string,newpath:string){
        try{
            // console.log(`oldpath is ${oldpath}`)
            // console.log(`newpath is ${newpath}`)
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
            console.error(`Error updating renamed file path to cache: ${error}`)
        }
        
        
    }
    
}
