import UltimateTodoistSyncForObsidian from "../main";
import { App, Editor, MarkdownView, Notice} from 'obsidian';


type FrontMatter = {
todoistTasks: string[];
todoistCount: number;
};

export class TodoistSync {
app:App;
plugin: UltimateTodoistSyncForObsidian;


constructor(app:App, plugin:UltimateTodoistSyncForObsidian) {
//super(app,settings,todoistRestAPI,todoistSyncAPI,taskParser,cacheOperation);
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
//Use view.data instead of valut.read. vault.read is delayed
currentFileValue = view?.data
}


//console.log(filepath)
 

//const frontMatter = await this.plugin.fileOperation.getFrontMatter(file);
const frontMatter = await this.plugin.cacheOperation.getFileMetadata(filepath)
if (!frontMatter || !frontMatter.todoistTasks) {
console.log('frontmatter has no task')
return;
}
 

 

//console.log(currentFileValue)
const currentFileValueWithOutFrontMatter = currentFileValue.replace(/^---[\s\S]*?---\n/, '');
const frontMatter_todoistTasks = frontMatter.todoistTasks;
const frontMatter_todoistCount = frontMatter.todoistCount;
 
const deleteTasksPromises = frontMatter_todoistTasks
.filter((taskId) => !currentFileValueWithOutFrontMatter.includes(taskId))
.map(async (taskId) => {
try {
//console.log(`initialize todoist api`)
const api = this.plugin.todoistRestAPI.initializeAPI()
const response = await api.deleteTask(taskId);
//console.log(`response is ${response}`);
 
if (response) {
//console.log(`task ${taskId} deleted successfully`);
new Notice(`task ${taskId} is deleted`)
return taskId; // Return the deleted task ID
}
} catch (error) {
console.error(`Failed to delete task ${taskId}: ${error}`);
}
});
 
const deletedTaskIds = await Promise.all(deleteTasksPromises);
const deletedTaskAmount = deletedTaskIds.length
if (!deletedTaskIds.length) {
//console.log("No task deleted");
return;
}
this.plugin.cacheOperation.deleteTaskFromCacheByIDs(deletedTaskIds)
//console.log(`Deleted ${deletedTaskAmount} tasks`)
this.plugin.saveSettings()
// Update newFrontMatter_todoistTasks array
 
// Disable automatic merging
 
const newFrontMatter_todoistTasks = frontMatter_todoistTasks.filter(
(taskId) => !deletedTaskIds.includes(taskId)
);
 
 
/*
await this.plugin.fileOperation.updateFrontMatter(file, (frontMatter) => {
frontMatter.todoistTasks = newFrontMatter_todoistTasks;
frontMatter.todoistCount = frontMatter_todoistCount - deletedTaskAmount;
});
*/
const newFileMetadata = {todoistTasks:newFrontMatter_todoistTasks,todoistCount:(frontMatter_todoistCount - deletedTaskAmount)}
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
if ((!this.plugin.taskParser.hasTodoistId(linetxt) && this.plugin.taskParser.hasTodoistTag(linetxt))) { //Whether #todoist is included
console.log('this is a new task')
console.log(linetxt)
const currentTask =await this.plugin.taskParser.convertTextToTodoistTaskObject(linetxt,filepath,line,fileContent)
//console.log(currentTask)
 
 
 
 
 
try {
const newTask = await this.plugin.todoistRestAPI.AddTask(currentTask)
const { id: todoist_id, projectId: todoist_projectId, url: todoist_url } = newTask;
newTask.path = filepath;
//console.log(newTask);
new Notice(`new task ${newTask.content} id is ${newTask.id}`)
//newTask writes to cache
this.plugin.cacheOperation.appendTaskToCache(newTask)
 
//If the task is completed
if(currentTask.isCompleted === true){
await this.plugin.todoistRestAPI.CloseTask(newTask.id)
this.plugin.cacheOperation.closeTaskToCacheByID(todoist_id)
 
}
this.plugin.saveSettings()

//todoist id is saved to the end of the task
const text_with_out_link = `${linetxt} %%[todoist_id:: ${todoist_id}]%%`;
const link = `[link](${newTask.url})`
const text = this.plugin.taskParser.addTodoistLink(text_with_out_link,link)
const from = { line: cursor.line, ch: 0 };
const to = { line: cursor.line, ch: linetxt.length };
view.app.workspace.activeEditor?.editor?.replaceRange(text, from, to)
 
//Process frontMatter
try {
// handle front matter
const frontMatter = await this.plugin.cacheOperation.getFileMetadata(filepath)
//console.log(frontMatter);
 
if (!frontMatter) {
//console.log('frontmatter is empty');
//return;
}
 
// Increase todoistCount by 1
const newFrontMatter = { ...frontMatter };
newFrontMatter.todoistCount = (newFrontMatter.todoistCount ?? 0) + 1;
 
//Record taskID
newFrontMatter.todoistTasks = [...(newFrontMatter.todoistTasks || []), todoist_id];
 
// update front matter
/*
this.plugin.fileOperation.updateFrontMatter(view.file, (frontMatter) => {
frontMatter.todoistTasks = newFrontMatter.todoistTasks;
frontMatter.todoistCount = newFrontMatter.todoistCount;
});
*/
//console.log(newFrontMatter)
await this.plugin.cacheOperation.updateFileMetadata(filepath,newFrontMatter)

 

} catch (error) {
console.error(error);
}
 
} catch (error) {
console.error('Error adding task:', error);
console.log(`The error occurred in the file: ${filepath}`)
return
}
 
}
}
 
 
async fullTextNewTaskCheck(file_path:string): Promise<void>{

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
//Use view.data instead of valut.read. vault.read is delayed
currentFileValue = view?.data
}

if(this.plugin.settings.enableFullVaultSync){
//console.log('full vault sync enabled')
//console.log(filepath)
await this.plugin.fileOperation.addTodoistTagToFile(filepath)
}

const content = currentFileValue
 
let newFrontMatter
//frontMatteer
const frontMatter = await this.plugin.cacheOperation.getFileMetadata(filepath)
//console.log(frontMatter);
 
if (!frontMatter) {
console.log('frontmatter is empty');
newFrontMatter = {};
}else{
newFrontMatter = { ...frontMatter };
}

 
let hasNewTask = false;
const lines = content.split('\n')
 
for (let i = 0; i < lines.length; i++) {
const line = lines[i]
if (!this.plugin.taskParser.hasTodoistId(line) && this.plugin.taskParser.hasTodoistTag(line)) {
//console.log('this is a new task')
//console.log(`current line is ${i}`)
//console.log(`line text: ${line}`)
console.log(filepath)
const currentTask =await this.plugin.taskParser.convertTextToTodoistTaskObject(line,filepath,i,content)
if(typeof currentTask === "undefined"){
continue
}
console.log(currentTask)
try {
const newTask = await this.plugin.todoistRestAPI.AddTask(currentTask)
const { id: todoist_id, projectId: todoist_projectId, url: todoist_url } = newTask;
newTask.path = filepath;
console.log(newTask);
new Notice(`new task ${newTask.content} id is ${newTask.id}`)
//newTask writes to json file
this.plugin.cacheOperation.appendTaskToCache(newTask)

//If the task is completed
if(currentTask.isCompleted === true){
await this.plugin.todoistRestAPI.CloseTask(newTask.id)
this.plugin.cacheOperation.closeTaskToCacheByID(todoist_id)
}
this.plugin.saveSettings()
 
//todoist id is saved to the end of the task
const text_with_out_link = `${line} %%[todoist_id:: ${todoist_id}]%%`;
const link = `[link](${newTask.url})`
const text = this.plugin.taskParser.addTodoistLink(text_with_out_link,link)
lines[i] = text;
 
newFrontMatter.todoistCount = (newFrontMatter.todoistCount ?? 0) + 1;
 
//Record taskID
newFrontMatter.todoistTasks = [...(newFrontMatter.todoistTasks || []), todoist_id];
 
hasNewTask = true
 
} catch (error) {
console.error('Error adding task:', error);
continue
}
 
}
}
if(hasNewTask){
//Text and frontMatter
try {
// save file
const newContent = lines.join('\n')
await this.app.vault.modify(file, newContent)
 
 
// update front matter
/*
this.plugin.fileOperation.updateFrontMatter(file, (frontMatter) => {
frontMatter.todoistTasks = newFrontMatter.todoistTasks;
frontMatter.todoistCount = newFrontMatter.todoistCount;
});
*/

await this.plugin.cacheOperation.updateFileMetadata(filepath,newFrontMatter)
 
} catch (error) {
console.error(error);
}
 
}
 
 
}


async lineModifiedTaskCheck(filepath:string,lineText:string,lineNumber:number,fileContent:string): Promise<void>{
//const lineText = await this.plugin.fileOperation.getLineTextFromFilePath(filepath,lineNumber)

if(this.plugin.settings.enableFullVaultSync){
//await this.plugin.fileOperation.addTodoistTagToLine(filepath,lineText,lineNumber,fileContent)

//new empty metadata
const metadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
if(!metadata){
await this.plugin.cacheOperation.newEmptyFileMetadata(filepath)
}
this.plugin.saveSettings()
}

//check task
if (this.plugin.taskParser.hasTodoistId(lineText) && this.plugin.taskParser.hasTodoistTag(lineText)) {

const lineTask = await this.plugin.taskParser.convertTextToTodoistTaskObject(lineText,filepath,lineNumber,fileContent)
//console.log(lastLineTask)
const lineTask_todoist_id = (lineTask.todoist_id).toString()
//console.log(lineTask_todoist_id)
//console.log(`lastline task id is ${lastLineTask_todoist_id}`)
const savedTask = await this.plugin.cacheOperation.loadTaskFromCacheyID(lineTask_todoist_id) //The id in dataview is a number, and the id in todoist is a string, which needs to be converted
if(!savedTask){
console.log(`There is no task ${lineTask.todoist_id}` in the local cache)
const url = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath)
console.log(url)
return
}
//console.log(savedTask)

//Check whether the content has been modified
const lineTaskContent = lineTask.content;


//Whether content is modified?
const contentModified = !this.plugin.taskParser.taskContentCompare(lineTask,savedTask)
//tag or labels whether to modify
const tagsModified = !this.plugin.taskParser.taskTagCompare(lineTask,savedTask)
//project whether to modify
const projectModified = !(await this.plugin.taskParser.taskProjectCompare(lineTask,savedTask))
//Whether status is modified?
const statusModified = !this.plugin.taskParser.taskStatusCompare(lineTask,savedTask)
//due date whether to modify
const dueDateModified = !(await this.plugin.taskParser.compareTaskDueDate(lineTask,savedTask))
// parent id whether to modify
const parentIdModified = !(lineTask.parentId === savedTask.parentId)
//check priority
const priorityModified = !(lineTask.priority === savedTask.priority)

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
console.log(`Content modified for task ${lineTask_todoist_id}`)
updatedContent.content = lineTaskContent
contentChanged = true;
}

if (tagsModified) {
console.log(`Tags modified for task ${lineTask_todoist_id}`)
updatedContent.labels = lineTask.labels
tagsChanged = true;
}
 

if (dueDateModified) {
console.log(`Due date modified for task ${lineTask_todoist_id}`)
console.log(lineTask.dueDate)
//console.log(savedTask.due.date)
if(lineTask.dueDate === ""){
updatedContent.dueString = "no date"
}else{
updatedContent.dueDate = lineTask.dueDate
}

dueDateChanged = true;
}

//todoist Rest api does not have the function of move task to new project
if (projectModified) {
//console.log(`Project id modified for task ${lineTask_todoist_id}`)
//updatedContent.projectId = lineTask.projectId
//projectChanged = false;
}

//todoist Rest api has no excuse to modify parent id
if (parentIdModified) {
//console.log(`Parnet id modified for task ${lineTask_todoist_id}`)
//updatedContent.parentId = lineTask.parentId
//parentIdChanged = false;
}

if (priorityModified) {

updatedContent.priority = lineTask.priority
priorityChanged = true;
}


if (contentChanged || tagsChanged ||dueDateChanged ||projectChanged || parentIdChanged || priorityChanged) {
//console.log("task content was modified");
//console.log(updatedContent)
const updatedTask = await this.plugin.todoistRestAPI.UpdateTask(lineTask.todoist_id.toString(),updatedContent)
updatedTask.path = filepath
this.plugin.cacheOperation.updateTaskToCacheByID(updatedTask);
}

if (statusModified) {
console.log(`Status modified for task ${lineTask_todoist_id}`)
if (lineTask.isCompleted === true) {
console.log(`task completed`)
this.plugin.todoistRestAPI.CloseTask(lineTask.todoist_id.toString());
this.plugin.cacheOperation.closeTaskToCacheByID( lineTask.todoist_id.toString());
} else {
console.log(`task umcompleted`)
this.plugin.todoistRestAPI.OpenTask(lineTask.todoist_id.toString());
this.plugin.cacheOperation.reopenTaskToCacheByID( lineTask.todoist_id.toString());
}
 
statusChanged = true;
}


 
if (contentChanged || statusChanged || dueDateChanged || tagsChanged || projectChanged || priorityChanged) {
console.log(lineTask)
console.log(savedTask)
//`Task ${lastLineTaskTodoistId} was modified`
this.plugin.saveSettings()
let message = `Task ${lineTask_todoist_id} is updated.`;
 
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

} else {
//console.log(`Task ${lineTask_todoist_id} did not change`);
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
if (this.plugin.taskParser.hasTodoistId(line) && this.plugin.taskParser.hasTodoistTag(line)) {
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
// Perform necessary actions on the modified content and front matter
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
await this.plugin.todoistRestAPI.CloseTask(taskId);
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
await this.plugin.todoistRestAPI.OpenTask(taskId)
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

for (const taskId of taskIds) {
const api = await this.plugin.todoistRestAPI.initializeAPI()
try {
const response = await api.deleteTask(taskId);
console.log(`response is ${response}`);

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
this.plugin.cacheOperation.modifyTaskToCacheByID(e.object_id,{content})
new Notice(`The content of Task ${e.parent_item_id} has been modified.`)

}

async syncUpdatedTaskDueDateToObsidian(e){
this.plugin.fileOperation.syncUpdatedTaskDueDateToTheFile(e)
//To modify the cache date, use todoist format
const due = await this.plugin.todoistRestAPI.getTaskDueById(e.object_id)
this.plugin.cacheOperation.modifyTaskToCacheByID(e.object_id,{due})
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


async syncTodoistToObsidian(){
try{
const all_activity_events = await this.plugin.todoistSyncAPI.getNonObsidianAllActivityEvents()
 
// remove synchonized events
const savedEvents = await this.plugin.cacheOperation.loadEventsFromCache()
const result1 = all_activity_events.filter(
(objA) => !savedEvents.some((objB) => objB.id === objA.id)
)
 
 
const savedTasks = await this.plugin.cacheOperation.loadTasksFromCache()
// Find the task activity whose task id exists in Obsidian
const result2 = result1.filter(
(objA) => savedTasks.some((objB) => objB.id === objA.object_id)
)
// Find the note activity whose task id exists in Obsidian
const result3 = result1.filter(
(objA) => savedTasks.some((objB) => objB.id === objA.parent_item_id)
)
 
 
 
 
const unsynchronized_item_completed_events = this.plugin.todoistSyncAPI.filterActivityEvents(result2, { event_type: 'completed', object_type: 'item' })
const unsynchronized_item_uncompleted_events = this.plugin.todoistSyncAPI.filterActivityEvents(result2, { event_type: 'uncompleted', object_type: 'item' })

//Items updated (only changes to content, description, due_date and responsible_uid)
const unsynchronized_item_updated_events = this.plugin.todoistSyncAPI.filterActivityEvents(result2, { event_type: 'updated', object_type: 'item' })

const unsynchronized_notes_added_events = this.plugin.todoistSyncAPI.filterActivityEvents(result3, { event_type: 'added', object_type: 'note' })
const unsynchronized_project_events = this.plugin.todoistSyncAPI.filterActivityEvents(result1, { object_type: 'project' })
console.log(unsynchronized_item_completed_events)
console.log(unsynchronized_item_uncompleted_events)
console.log(unsynchronized_item_updated_events)
console.log(unsynchronized_project_events)
console.log(unsynchronized_notes_added_events)
 
await this.syncCompletedTaskStatusToObsidian(unsynchronized_item_completed_events)
await this.syncUncompletedTaskStatusToObsidian(unsynchronized_item_uncompleted_events)
await this.syncUpdatedTaskToObsidian(unsynchronized_item_updated_events)
await this.syncAddedTaskNoteToObsidian(unsynchronized_notes_added_events)
if(unsynchronized_project_events.length){
console.log('New project event')
await this.plugin.cacheOperation.saveProjectsToCache()
await this.plugin.cacheOperation.appendEventsToCache(unsynchronized_project_events)
}
 

}catch (err){
console.error('An error occurred while synchronizing:', err);
}

}



async backupTodoistAllResources() {
try {
const resources = await this.plugin.todoistSyncAPI.getAllResources()
 
const now: Date = new Date();
const timeString: string = `${now.getFullYear()}${now.getMonth()+1}${now.getDate()}${now.getHours()}${now.getMinutes()}${ now.getSeconds()}`;
 
const name = "todoist-backup-"+timeString+".json"

this.app.vault.create(name,JSON.stringify(resources))
//console.log(`todoist backup successful`)
new Notice(`Todoist backup data is saved in the path ${name}`)
} catch (error) {
console.error("An error occurred while creating Todoist backup:", error);
}

}


//After renaming the file, check all tasks in the file and update all links.
async updateTaskDescription(filepath:string){
const metadata = await this.plugin.cacheOperation.getFileMetadata(filepath)
if(!metadata || !metadata.todoistTasks){
return
}
const description = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath)
let updatedContent = {}
updatedContent.description = description
try {
metadata.todoistTasks.forEach(async(taskId) => {
const updatedTask = await this.plugin.todoistRestAPI.UpdateTask(taskId,updatedContent)
updatedTask.path = filepath
this.plugin.cacheOperation.updateTaskToCacheByID(updatedTask);

});
} catch(error) {
console.error('An error occurred in updateTaskDescription:', error);
}



}



 

}
