import UltimateTickTickSyncForObsidian from "../main";
import { App, Editor, MarkdownView, Notice} from 'obsidian';
import { TickTickSyncAPI } from "./TicktickSyncAPI";
import { ITask } from "ticktick-api-lvt/dist/types/Task";


type FileMetadata = {
    TickTickTasks: string[];
    TickTickCount: number;
};

export class TickTickSync {
    app:App;
    plugin: UltimateTickTickSyncForObsidian;
    
    
    constructor(app:App, plugin:UltimateTickTickSyncForObsidian) {
        //super(app,settings,tickTickRestAPI,ticktickSyncAPI,taskParser,cacheOperation);
        this.app = app;
        this.plugin = plugin;
        
    }
    
    
    
    
    
    async deletedTaskCheck(file_path:string): Promise<void> {
        
        let file
        let currentFileValue
        let view
        let filepath
        
        if(file_path){
            file = this.app.vault.getAbstractFileByPath(file_path)
            filepath = file_path
            currentFileValue = await this.app.vault.read(file)
        }
        else{
            view = this.app.workspace.getActiveViewOfType(MarkdownView);
            //const editor = this.app.workspace.activeEditor?.editor
            file = this.app.workspace.getActiveFile()
            filepath = file?.path
            //Use view.data instead of vault.read. vault.read is delayed
            currentFileValue = view?.data
        }
        
        
        //console.log(filepath)
        
        
        //const fileMetadata = await this.plugin.fileOperation.getFileMetadata(file);
        const fileMetadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
        // console.log("fileMetaData: ", fileMetadata)
        if (!fileMetadata || !fileMetadata.TickTickTasks) {
            // console.log('fileMetaData has no task')
            return;
        }
        
        
        
        
        //console.log(currentFileValue)
        const currentFileValueWithOutFileMetadata = currentFileValue.replace(/^---[\s\S]*?---\n/, '');
        const fileMetadata_TickTickTasks = fileMetadata.TickTickTasks;
        const fileMetadata_TickTickCount = fileMetadata.TickTickCount;
        
        const deleteTasksPromises = fileMetadata_TickTickTasks
        .filter((taskId) => !currentFileValueWithOutFileMetadata.includes(taskId))
        .map(async (taskId) => {
            try {                
                var taskIds = [];
                taskIds.push(taskId)
                console.log(taskIds)
                await this.deleteTasksByIds(taskIds);
            } catch (error) {
                console.error(`Failed to delete task ${taskId}: ${error}`);
            }
        });
        
        const deletedTaskIds = await Promise.all(deleteTasksPromises);
        const deletedTaskAmount = deletedTaskIds.length
        if (deletedTaskAmount) {
            //console.log("No task deleted");
            return;
        }
        await this.plugin.cacheOperation.deleteTaskFromCacheByIDs(deletedTaskIds)
        //console.log(`Deleted ${deletedTaskAmount} tasks`)
        this.plugin.saveSettings()
        // Update newFileMetadata_TickTickTasks array
        
        // Disable automatic merging
        
        const newFileMetadata_TickTickTasks = fileMetadata_TickTickTasks.filter(
            (taskId) => !deletedTaskIds.includes(taskId)
            );
            
            
            /*
            await this.plugin.fileOperation.updateFileMetadata(file, (fileMetadata) => {
                fileMetadata.TickTickTasks = newFileMetadata_TickTickTasks;
                fileMetadata.TickTickCount = fileMetadata_TickTickCount - deletedTaskAmount;
            });
            */
            const newFileMetadata = {TickTickTasks:newFileMetadata_TickTickTasks,TickTickCount:(fileMetadata_TickTickCount - deletedTaskAmount)}
            await this.plugin.cacheOperation.updateFileMetadata(filepath,newFileMetadata)
        }
        
        async lineContentNewTaskCheck(editor:Editor,view:MarkdownView): Promise<void>{
            //const editor = this.app.workspace.activeEditor?.editor
            //const view =this.app.workspace.getActiveViewOfType(MarkdownView)
            
            const filepath = view.file?.path
            const fileContent = view?.data
            const cursor = editor.getCursor()
            const line = cursor.line
            const linetxt = editor.getLine(line)
            
            //Add task
            console.log("lineContentNewTaskCheck", linetxt, this.plugin.taskParser.hasTickTickId(linetxt), this.plugin.taskParser.hasTickTickTag(linetxt) )
            if ((!this.plugin.taskParser.hasTickTickId(linetxt) && this.plugin.taskParser.hasTickTickTag(linetxt))) { //Whether #ticktick is included
                console.log("!!!!!Adding on line Content check")
                
                try {
                    const currentTask =await this.plugin.taskParser.convertTextToTickTickTaskObject(linetxt,filepath,line,fileContent)
                    // console.log("Adding because line content new check.")
                    const newTask = await this.plugin.tickTickRestAPI.AddTask(currentTask)
                    if (currentTask.parentId) {
                        let parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(currentTask.parentId);
                        parentTask = this.plugin.taskParser.addChildToParent(parentTask, currentTask.parentId);
                        await this.plugin.cacheOperation?.updateTaskToCacheByID(parentTask);
                        await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
                    }
                    const { id: ticktick_id, projectId: ticktick_projectId, url: ticktick_url } = newTask;
                    newTask.path = filepath;
                    //console.log(newTask);
                    new Notice(`new task ${newTask.content} id is ${newTask.id}`)
                    //newTask writes to cache
                    await this.plugin.cacheOperation.appendTaskToCache(newTask)
                    
                    //If the task is completed
                    if(currentTask.status != 0){
                        await this.plugin.tickTickRestAPI.CloseTask(newTask.id)
                        await this.plugin.cacheOperation.closeTaskToCacheByID(ticktick_id)
                        
                    }
                    this.plugin.saveSettings()
                    
                    //ticktick id is saved to the end of the task
                    //TODO: This is bugging me.
                    const text_with_out_link = `${linetxt} %%[ticktick_id:: ${ticktick_id}]%%`;
                    const text = this.plugin.taskParser.addTickTickLink(text_with_out_link,newTask.url)
                    const from = { line: cursor.line, ch: 0 };
                    const to = { line: cursor.line, ch: linetxt.length };
                    view.app.workspace.activeEditor?.editor?.replaceRange(text, from, to)
                    
                    //Process fileMetadata
                    try {
                        // handle file meta data
                        const fileMetadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
                        //console.log(fileMetadata);
                        
                        if (!fileMetadata) {
                            //console.log('fileMetaData is empty');
                            //return;
                        }
                        
                        // Increase TickTickCount by 1
                        const newFileMetadata = { ...fileMetadata };
                        newFileMetadata.TickTickCount = (newFileMetadata.TickTickCount ?? 0) + 1;
                        
                        //Record taskID
                        newFileMetadata.TickTickTasks = [...(newFileMetadata.TickTickTasks || []), ticktick_id];
                        
                        
                        //console.log(newFileMetadata)
                        await this.plugin.cacheOperation.updateFileMetadata(filepath,newFileMetadata)
                        
                        
                        
                    } catch (error) {
                        console.error(error);
                    }
                    
                } catch (error) {
                    console.error('Error adding task:', error);
                    console.error(`The error occurred in the file: ${filepath}`)
                    return
                }
                
            }
        }
        
        
        async fullTextNewTaskCheck(file_path:string): Promise<void>{
            // console.log("fullTextNewTaskCheck")
            let file
            let currentFileValue
            let view
            let filepath
            
            if(file_path){
                file = this.app.vault.getAbstractFileByPath(file_path)
                if (file) {
                    filepath = file_path
                    currentFileValue = await this.app.vault.read(file)
                } else {
                    console.log(`File: ${file_path} not found. Removing from Meta Data`)
                    await this.plugin.cacheOperation?.deleteFilepathFromMetadata(file_path);
                    return;
                }
            }
            else{
                view = this.app.workspace.getActiveViewOfType(MarkdownView);
                //const editor = this.app.workspace.activeEditor?.editor
                file = this.app.workspace.getActiveFile()
                filepath = file?.path
                //Use view.data instead of vault.read. vault.read is delayed
                currentFileValue = view?.data
            }
            
            if(this.plugin.settings.enableFullVaultSync){
                //console.log('full vault sync enabled')
                //console.log(filepath)
                // console.log("Called from sync.")
                await this.plugin.fileOperation.addTickTickTagToFile(filepath)
            }
            
            const content = currentFileValue
            
            let newFileMetadata
            //frontMatteer
            const fileMetadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
            //console.log(fileMetadata);
            
            if (!fileMetadata) {
                // console.log('fileMetadata is empty');
                newFileMetadata = {};
            }else{
                newFileMetadata = { ...fileMetadata };
            }
            
            
            let hasNewTask = false;
            const lines = content.split('\n')
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                console.log("fullTextNewTaskCheck", line, this.plugin.taskParser.hasTickTickId(line), this.plugin.taskParser.hasTickTickTag(line) )
                if (!this.plugin.taskParser.hasTickTickId(line) && this.plugin.taskParser.hasTickTickTag(line)) {
                    console.log('!!!!!Adding on  fullTextNewTaskCheck')
                    //console.log(`current line is ${i}`)
                    //console.log(`line text: ${line}`)
                    // console.log(filepath)
                    const currentTask =await this.plugin.taskParser.convertTextToTickTickTaskObject(line,filepath,i,content)
                    if(typeof currentTask === "undefined"){
                        continue
                    }
                    // console.log(currentTask)
                    try {
                        // console.log("adding because full task new check")
                        const newTask = await this.plugin.tickTickRestAPI.AddTask(currentTask)
                        //dear future me: this takes the corresponding variables from the object on the right hand side and stuffs
                        //                them in the left hand side variables. Maybe should have done a bit more JS learning before
                        //                taking this on.
                        const { id: ticktick_id, projectId: ticktick_projectId, url: ticktick_url } = newTask;
                        newTask.path = filepath;
                        // console.log(newTask);
                        new Notice(`new task ${newTask.content} id is ${newTask.id}`)
                        //newTask writes to json file
                        await this.plugin.cacheOperation.appendTaskToCache(newTask)
                        
                        //If the task is completed
                        if(currentTask.status != 0){
                            await this.plugin.tickTickRestAPI.CloseTask(newTask.id)
                            await this.plugin.cacheOperation.closeTaskToCacheByID(ticktick_id)
                        }
                        this.plugin.saveSettings()
                        
                        //ticktick id is saved to the end of the task
                        //TODO Clean this up. Use taskparser functions!
                        const text_with_out_link = `${line} %%[ticktick_id:: ${ticktick_id}]%%`;
                        const text = this.plugin.taskParser.addTickTickLink(text_with_out_link,newTask.url)
                        lines[i] = text;
                        
                        newFileMetadata.TickTickCount = (newFileMetadata.TickTickCount ?? 0) + 1;
                        
                        //Record taskID
                        newFileMetadata.TickTickTasks = [...(newFileMetadata.TickTickTasks || []), ticktick_id];
                        
                        hasNewTask = true
                        
                    } catch (error) {
                        console.error('Error adding task:', error);
                        continue
                    }
                    
                }
            }
            if(hasNewTask){
                //Text and fileMetadata
                try {
                    // save file
                    const newContent = lines.join('\n')
                    await this.app.vault.modify(file, newContent)
                    await this.plugin.cacheOperation.updateFileMetadata(filepath,newFileMetadata)
                    
                } catch (error) {
                    console.error(error);
                }
                
            }
            
            
        }
        
        
        async lineModifiedTaskCheck(filepath:string,lineText:string,lineNumber:number,fileContent:string): Promise<void>{
            //const lineText = await this.plugin.fileOperation.getLineTextFromFilePath(filepath,lineNumber)
            
            if(this.plugin.settings.enableFullVaultSync){
                //await this.plugin.fileOperation.addticktickTagToLine(filepath,lineText,lineNumber,fileContent)
                
                //new empty metadata
                const metadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
                if(!metadata){
                    await this.plugin.cacheOperation.newEmptyFileMetadata(filepath)
                }
                this.plugin.saveSettings()
            }
            
            //check task
            if (this.plugin.taskParser.hasTickTickId(lineText) && this.plugin.taskParser.hasTickTickTag(lineText)) {
                const lineTask = await this.plugin.taskParser.convertTextToTickTickTaskObject(lineText,filepath,lineNumber,fileContent)
                //console.log(lastLineTask)
                // console.log("ticktickid: ", lineTask.id)
                const lineTask_ticktick_id = lineTask.id
                //console.log(lineTask_ticktick_id) 
                //console.log(`lastline task id is ${lastLineTask_ticktick_id}`)
                const savedTask = await this.plugin.cacheOperation.loadTaskFromCacheID(lineTask_ticktick_id) 
                console.log("Task from Cache: ", savedTask);
                if(!savedTask){ 
                    console.error(`There is no task ${lineTask.ticktick_id} in the local cache`)
                    //let's assume that we need to add it. It'll be fun.
                    //TODO: Add out of Sync, verify we need it, and Verify correct construction of task to cache. eg: Tags, due date, etc.
                    /* Strongly suspect that this is a problem. Let's wait for Sync operation to get us back in Sync
                    const task = await this.plugin.tickTickRestAPI?.getTaskById(lineTask_ticktick_id)
                    // console.log("task: ", task)
                    const obsidianURL = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath)
                    if (task) {
                        task.content = obsidianURL;
                        task.url = this.plugin.taskParser?.createURL(task.id)
                        await this.plugin.cacheOperation?.appendTaskToCache(task);
                        let fileMetadata: FileMetadata;
                        fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath)
                        
                        if (!fileMetadata) {
                            fileMetadata = {TickTickTasks: [], TickTickCount: 0};
                        }
                        let TickTickCount = fileMetadata.TickTickCount;
                        fileMetadata.TickTickCount = TickTickCount + 1;
                        fileMetadata.TickTickTasks.push(task.id);
                        await this.plugin.cacheOperation?.updateFileMetadata(filepath, fileMetadata)
                        this.plugin.saveSettings()
                    }
                    
                    // console.log(url)
                    */
                    return
                }
                //console.log(savedTask)
                
                //Check whether the content has been modified
                const lineTaskContent = lineTask.content;
                
                
                //Whether content is modified?
                const contentModified = this.plugin.taskParser.isTitleChanged(lineTask,savedTask)
                //tag or labels whether to modify
                const tagsModified = this.plugin.taskParser.isTagsChanged(lineTask,savedTask)
                //project whether to modify
                const projectModified = this.plugin.taskParser.isProjectIdChanged(lineTask,savedTask)
                //Whether status is modified?
                const statusModified = this.plugin.taskParser.isStatusChanged(lineTask,savedTask)
                //due date whether to modify
                const dueDateModified = (await this.plugin.taskParser.isDueDateChanged(lineTask,savedTask))
                //TODO Fix This!
                console.error("IGnoring priority and parentage. Re-Instate ASAP")
                const parentIdModified = false;
                const priorityModified = false;
                // // parent id whether to modify
                // const parentIdModified = !(lineTask.parentId === savedTask.parentId)
                // //check priority
                // const priorityModified = !(lineTask.priority === savedTask.priority)
                
                try {
                    let contentChanged= false;
                    let tagsChanged = false;
                    let projectChanged = false;
                    let statusChanged = false;
                    let dueDateChanged = false;
                    let parentIdChanged = false;
                    let priorityChanged = false;
                    
                    let updatedContent = {}
                    if (contentModified) {
                        if(this.plugin.settings.debugMode){
                            console.log(`Content modified for task ${lineTask_ticktick_id}`)
                        }
                        updatedContent.content = lineTaskContent
                        contentChanged = true;
                    }
                    
                    if (tagsModified) {
                        if(this.plugin.settings.debugMode){
                            console.log(`Tags modified for task ${lineTask_ticktick_id}`)
                        }
                        updatedContent.tags = lineTask.tags
                        tagsChanged = true;
                    }
                    
                    
                    if (dueDateModified) {
                        if(this.plugin.settings.debugMode){
                            console.log(`Due date modified for task ${lineTask_ticktick_id}`)
                            console.log(lineTask.dueDate)
                        }
                        //console.log(savedTask.due.date)
                        if(lineTask.dueDate === ""){
                            updatedContent.dueString = "no date"
                        }else{
                            updatedContent.dueDate = lineTask.dueDate
                        }
                        
                        dueDateChanged = true;
                    }
                    
                    //ticktick Rest api does not have the function of move task to new project
                    if (projectModified) {
                        if(this.plugin.settings.debugMode){
                            console.log(`Project id modified for task ${lineTask_ticktick_id}`)
                            console.log("Not handled yet.");
                        }
                        //updatedContent.projectId = lineTask.projectId
                        //projectChanged = false;
                    }
                    
                    //ticktick Rest api has no way to modify parent id
                    if (parentIdModified) {
                        if(this.plugin.settings.debugMode){
                            console.log(`Parent id modified for task ${lineTask_ticktick_id}`)
                        }
                        //updatedContent.parentId = lineTask.parentId
                        //parentIdChanged = false;
                    }
                    
                    if (priorityModified) {
                        
                        updatedContent.priority = lineTask.priority
                        priorityChanged = true;
                    }
                    
                    
                    if (contentChanged || tagsChanged ||dueDateChanged ||projectChanged || parentIdChanged || priorityChanged) {
                        console.log("task content was modified");
                        //console.log(updatedContent)
                        const updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(lineTask)
                        lineTask.path = filepath
                        await this.plugin.cacheOperation?.updateTaskToCacheByID(lineTask);
                    }
                    
                    if (statusModified) {
                        if(this.plugin.settings.debugMode){
                            console.log(`Status modified for task ${lineTask_ticktick_id}`)
                        }
                        if (lineTask.status != 0) {
                            if(this.plugin.settings.debugMode){
                                console.log(`task completed`)
                            }
                            this.plugin.tickTickRestAPI.CloseTask(lineTask.id, lineTask.projectId);
                            await this.plugin.cacheOperation.closeTaskToCacheByID( lineTask.id);
                        } else {
                            if(this.plugin.settings.debugMode){
                                console.log(`task not completed`)
                            }
                            this.plugin.tickTickRestAPI.OpenTask(lineTask.id, lineTask.projectId);
                            await this.plugin.cacheOperation.reopenTaskToCacheByID( lineTask.id);
                        }
                        
                        statusChanged = true;
                    }
                    
                    
                    
                    if (contentChanged || statusChanged || dueDateChanged || tagsChanged || projectChanged || priorityChanged) {
                        // console.log(lineTask)
                        // console.log(savedTask)
                        //`Task ${lastLineTaskticktickId} was modified`
                        this.plugin.saveSettings()
                        let message = `Task ${lineTask_ticktick_id} is updated.`;
                        
                        if (contentChanged) {
                            message += "Content was changed.";
                        }
                        if (statusChanged) {
                            message += "Status was changed.";
                        }
                        if (dueDateChanged) {
                            message += "Due date was changed.";
                        }
                        if (tagsChanged) {
                            message += " Tags were changed.";
                        }
                        if (projectChanged) {
                            message += "Project was changed.";
                        }
                        if (priorityChanged) {
                            message += "Priority was changed.";
                        }
                        
                        new Notice(message);
                        console.log("Task Changed: ", lineTask.id)
                        
                    } else {
                        //console.log(`Task ${lineTask_ticktick_id} did not change`);
                    }
                    
                } catch (error) {
                    console.error('Error updating task:', error);
                }
                
                
            }
        }
        
        
        async fullTextModifiedTaskCheck(file_path: string): Promise<void> {
            
            let file;
            let currentFileValue;
            let view;
            let filepath;
            
            try {
                if (file_path) {
                    file = this.app.vault.getAbstractFileByPath(file_path);
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
                    if (this.plugin.taskParser.hasTickTickId(line) && this.plugin.taskParser.hasTickTickTag(line)) {
                        try {
                            await this.lineModifiedTaskCheck(filepath, line, i, content);
                            hasModifiedTask = true;
                        } catch (error) {
                            console.error('Error modifying task:', error);
                            continue;
                        }
                    }
                }
                
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
                await this.plugin.tickTickRestAPI.CloseTask(taskId);
                await this.plugin.fileOperation.completeTaskInTheFile(taskId)
                await this.plugin.cacheOperation.closeTaskToCacheByID(taskId);
                this.plugin.saveSettings()
                new Notice(`Task ${taskId} is closed.`)
            } catch (error) {
                console.error('Error closing task:', error);
                throw error; // Throw an error so that the caller can catch and handle it
            }
        }
        
        //open task
        async repoenTask(taskId:string) : Promise<void>{
            try {
                await this.plugin.tickTickRestAPI.OpenTask(taskId)
                await this.plugin.fileOperation.uncompleteTaskInTheFile(taskId)
                await this.plugin.cacheOperation.reopenTaskToCacheByID(taskId)
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
            console.log("to Delete: ", taskIds)
            const api = await this.plugin.tickTickRestAPI.initializeAPI()            
            for (const taskId of taskIds) {
                try {
                    let projectId = await this.plugin.cacheOperation?.getProjectIdForTask(taskId);
                    console.log("got pid: ", projectId);
                    const response = await this.plugin.tickTickRestAPI.deleteTask(taskId, projectId);
                    // console.log(`response is ${response}`);
                    
                    if (response) {
                        //console.log(`Task ${taskId} deleted successfully`);
                        new Notice(`Task ${taskId} is deleted.`)
                        deletedTaskIds.push(taskId); // Add the deleted task ID to the array
                    }
                } catch (error) {
                    console.error(`Failed to delete task ${taskId}: ${error}`);
                    // You can add better error handling methods, such as throwing exceptions or logging here, etc.
                }
            }
            
            if (!deletedTaskIds.length) {
                console.log("Task not deleted");
                return [];
            }
            
            await this.plugin.cacheOperation.deleteTaskFromCacheByIDs(deletedTaskIds); // Update JSON file
            this.plugin.saveSettings()
            //console.log(`A total of ${deletedTaskIds.length} tasks were deleted`);
            
            
            return deletedTaskIds;
        }
        
        
        
        
        
        
        
        
        
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
                    await this.plugin.cacheOperation.closeTaskToCacheByID(e.object_id)
                    new Notice(`Task ${e.object_id} is closed.`)
                    processedEvents.push(e)
                }
                
                // Save events to the local database."
                //const allEvents = [...savedEvents, ...unSynchronizedEvents]
                await this.plugin.cacheOperation.appendEventsToCache(processedEvents)
                this.plugin.saveSettings()
                
                
                
                
                
            } catch (error) {
                console.error('Error synchronizing task status:', error)
            }
        }
        
        
        // Synchronize completed task status to Obsidian file
        async syncUncompletedTaskStatusToObsidian(unSynchronizedEvents) {
            
            //console.log(unSynchronizedEvents)
            
            try {
                
                // Handle unsynchronized events and wait for all processing to complete
                const processedEvents = []
                for (const e of unSynchronizedEvents) { //If you want to modify the code so that uncompleteTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
                    //console.log(`uncheck task: ${e.object_id}`)
                    await this.plugin.fileOperation.uncompleteTaskInTheFile(e.object_id)
                    await this.plugin.cacheOperation.reopenTaskToCacheByID(e.object_id)
                    new Notice(`Task ${e.object_id} is reopened.`)
                    processedEvents.push(e)
                }
                
                
                
                // Merge new events into existing events and save to JSON
                //const allEvents = [...savedEvents, ...unSynchronizedEvents]
                await this.plugin.cacheOperation.appendEventsToCache(processedEvents)
                this.plugin.saveSettings()
            } catch (error) {
                console.error('Error synchronizing task status:', error)
            }
        }
        
        // Synchronize updated item status to Obsidian
        async syncUpdatedTaskToObsidian(unSynchronizedEvents) {
            //console.log(unSynchronizedEvents)
            try {
                
                // Handle unsynchronized events and wait for all processing to complete
                const processedEvents = []
                for (const e of unSynchronizedEvents) { //If you want to modify the code so that completeTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
                    //console.log(`Syncing ${e.object_id} changes to local`)
                    console.log(e)
                    console.log(typeof e.extra_data.last_due_date === 'undefined')
                    if(!(typeof e.extra_data.last_due_date === 'undefined')){
                        //console.log(`prepare update dueDate`)
                        await this.syncUpdatedTaskDueDateToObsidian(e)
                        
                    }
                    
                    if(!(typeof e.extra_data.last_content === 'undefined')){
                        //console.log(`prepare update content`)
                        await this.syncUpdatedTaskContentToObsidian(e)
                    }
                    
                    //await this.plugin.fileOperation.syncUpdatedTaskToTheFile(e)
                    //Also modify the data in the cache
                    //new Notice(`Task ${e.object_id} is updated.`)
                    processedEvents.push(e)
                }
                
                
                
                // Merge new events into existing events and save to JSON
                //const allEvents = [...savedEvents, ...unSynchronizedEvents]
                await this.plugin.cacheOperation.appendEventsToCache(processedEvents)
                this.plugin.saveSettings()
            } catch (error) {
                console.error('Error syncing updated item', error)
            }
            
        }
        
        async syncUpdatedTaskContentToObsidian(e){
            this.plugin.fileOperation.syncUpdatedTaskContentToTheFile(e)
            const content = e.extra_data.content
            await this.plugin.cacheOperation.modifyTaskToCacheByID(e.object_id,{content})
            new Notice(`The content of Task ${e.parent_item_id} has been modified.`)
            
        }
        
        async syncUpdatedTaskDueDateToObsidian(e){
            this.plugin.fileOperation.syncUpdatedTaskDueDateToTheFile(e)
            //To modify the cache date, use ticktick format
            const due = await this.plugin.tickTickRestAPI.getTaskDueById(e.object_id)
            await this.plugin.cacheOperation.modifyTaskToCacheByID(e.object_id,{due})
            new Notice(`The due date of Task ${e.parent_item_id} has been modified.`)
            
        }
        
        // sync added task note to obsidian
        async syncAddedTaskNoteToObsidian(unSynchronizedEvents) {
            // Get unsynchronized events
            //console.log(unSynchronizedEvents)
            try {
                
                // Handle unsynchronized events and wait for all processing to complete
                const processedEvents = []
                for (const e of unSynchronizedEvents) { //If you want to modify the code so that completeTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
                    console.log(e)
                    //const taskid = e.parent_item_id
                    //const note = e.extra_data.content
                    await this.plugin.fileOperation.syncAddedTaskNoteToTheFile(e)
                    //await this.plugin.cacheOperation.closeTaskToCacheByID(e.object_id)
                    new Notice(`Task ${e.parent_item_id} note is added.`)
                    processedEvents.push(e)
                }
                
                // Merge new events into existing events and save to JSON
                
                await this.plugin.cacheOperation.appendEventsToCache(processedEvents)
                this.plugin.saveSettings()
            } catch (error) {
                console.error('Error synchronizing task status:', error)
            }
        }
        
        async syncTickTickToObsidian(){
            //Tasks in Obsidian, not in TickTick: upload
            //Tasks in TickTick, not in Obsidian: Download
            //Tasks in both: check for updates. 
            try{
                let bModifiedFileSystem = false;
                let tasksFromTickTic = await this.plugin.tickTickSyncAPI?.getAllTasks();
                if (!tasksFromTickTic || tasksFromTickTic.length === 0) {
                    console.error("Failed to fetch resources from TickTick");
                    new Notice("Failed to fetch resources from TickTick, please try again later", 5000)
                    throw new Error("Failed to fetch resources from TickTick");
                }
                //todo verify if we ever get anything in syncTaskBean.add
                
                tasksFromTickTic = tasksFromTickTic.sort((a,b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0))
                console.log("num remote tasks: ", tasksFromTickTic.length)
                
                let tasksInCache = await this.plugin.cacheOperation.loadTasksFromCache()
                if (tasksInCache) {
                    tasksInCache = tasksInCache.sort((a,b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0))
                    console.log("local tasks: ", tasksInCache.length);
                } else {
                    tasksInCache = [];
                }
                
                
                
                console.log("---- num local tasks", tasksInCache.length)
                
                const syncToObsidian = tasksFromTickTic.filter(cloudObj => !tasksInCache.some(localObj => localObj.id === cloudObj.id));
                console.log("syncToObsidian: ", syncToObsidian.length)
                const syncToTickTick = tasksInCache.filter(localObj => !tasksFromTickTic.some(cloudObj => cloudObj.id === localObj.id));
                console.log("syncToTickTick: ", syncToTickTick.length)
                const tasksInBoth = tasksFromTickTic.filter(cloudObj => tasksInCache.some(localObj => localObj.id === cloudObj.id));
                console.log("tasksInBoth: ", tasksInBoth.length)
                
                
                
                
                //upload local only tasks to TickTick
                syncToTickTick.forEach(task => {
                    this.plugin.tickTickRestAPI?.AddTask(task);                    
                });
                
                //download remote only tasks to Obsidian
                if (syncToObsidian.length > 0) {
                    await this.plugin.fileOperation?.addTasksToFile(syncToObsidian)
                    await this.plugin.cacheOperation?.appendTasksToCache(syncToObsidian);   
                    bModifiedFileSystem = true;
                }
                //Todo check localSyncedTasks for TickTick modifications. Like: They got modified in ticktick, but not here.       
                //tasksInBoth
                
                await this.plugin.saveSettings();
                //If we just farckled the file system, stop Syncing to avoid race conditions.
                return bModifiedFileSystem;
            }catch (err){
                console.error('An error occurred while synchronizing:', err);
            }
        }
        
        
        
        async backupTickTickAllResources() {
            try {
                // console.log("backing up.")
                // if (this.plugin.tickTickSyncAPI) {
                // console.log("It's defined", this.plugin.tickTickSyncAPI)
                // }
                const resources = await this.plugin.tickTickSyncAPI.getAllResources()
                
                const now: Date = new Date();
                const timeString: string = `${now.getFullYear()}${now.getMonth()+1}${now.getDate()}${now.getHours()}${now.getMinutes()}${ now.getSeconds()}`;
                
                const name = "ticktick-backup-"+timeString+".json"
                
                this.app.vault.create(name,JSON.stringify(resources))
                //console.log(`ticktick backup successful`)
                new Notice(`TickTick backup data is saved in the path ${name}`)
            } catch (error) {
                console.error("An error occurred while creating TickTick backup:", error);
            }
            
        }
        
        
        //After renaming the file, check all tasks in the file and update all links.
        //TODO: probable bug: we're just clobering task content here. Should ought to do a comparison.
        async updateTaskContent(filepath:string){
            const metadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
            if(!metadata || !metadata.TickTickTasks){
                return
            }
            const content = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath)
            try {
                metadata.TickTickTasks.forEach(async(taskId) => {
                    //TODO: Just shoving the whole task in. Should we do updated content?
                    const task = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
                    task.content = content;
                    await this.plugin.cacheOperation?.updateTaskToCacheByID(task);
                    const updatedTask = await this.plugin.tickTickRestAPI.UpdateTask(task)
                });
            } catch(error) {
                console.error('An error occurred in updateTaskDescription:', error);
            }
            
            
            
        }
        
        
        
        
        
    }
    