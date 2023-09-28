import { App} from 'obsidian';
import UltimateTickTickSyncForObsidian from "../main";
import { Tick } from 'ticktick-api-lvt'
import ITask from "ticktick-api-lvt/src/types/Task"




interface dataviewTaskObject {
    status: string;
    checked: boolean;
    completed: boolean;
    fullyCompleted: boolean;
    text: string;
    visual: string;
    line: number;
    lineCount: number;
    path: string;
    section: string;
    tags: string[];
    outlinks: string[];
    link: string;
    children: any[];
    task: boolean;
    annotated: boolean;
    parent: number;
    blockId: string;
}


interface TickTickTaskObject {
    content: string;
    description?: string;
    project_id?: string;
    section_id?: string;
    parent_id?: string;
    order?: number | null;
    labels?: string[];
    priority?: number | null;
    due_string?: string;
    due_date?: string;
    due_datetime?: string;
    due_lang?: string;
    assignee_id?: string;
}


const keywords = {
    TickTick_TAG: "#TickTick",
    DUE_DATE: "🗓️|📅|📆|🗓",
};

const REGEX = {
    TickTick_TAG: new RegExp(`^[\\s]*[-] \\[[x ]\\] [\\s\\S]*${keywords.TickTick_TAG}[\\s\\S]*$ `, "i"),
    TickTick_ID: /\[TickTick_id::\s*\d+\]/,
    TickTick_ID_NUM:/\[TickTick_id::\s*(.*?)\]/,
    TickTick_LINK:/\[link\]\(.*?\)/,
    DUE_DATE_WITH_EMOJ: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`),
    DUE_DATE : new RegExp(`(?:${keywords.DUE_DATE})\\s?(\\d{4}-\\d{2}-\\d{2})`),
    PROJECT_NAME: /\[project::\s*(.*?)\]/,
    TASK_CONTENT: {
        REMOVE_PRIORITY: /\s!!([1-4])\s/,
        REMOVE_TAGS: /(^|\s)(#[a-zA-Z\d\u4e00-\u9fa5-]+)/g,
        REMOVE_SPACE: /^\s+|\s+$/g,
        REMOVE_DATE: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`),
        REMOVE_INLINE_METADATA: /%%\[\w+::\s*\w+\]%%/,
        REMOVE_CHECKBOX: /^(-|\*)\s+\[(x|X| )\]\s/,
        REMOVE_CHECKBOX_WITH_INDENTATION: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
        REMOVE_TickTick_LINK: /\[link\]\(.*?\)/,
    },
    ALL_TAGS: /#[\w\u4e00-\u9fa5-]+/g,
    TASK_CHECKBOX_CHECKED: /- \[(x|X)\] /,
    TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
    TAB_INDENTATION: /^(\t+)/,
    TASK_PRIORITY: /\s!!([1-4])\s/,
    BLANK_LINE: /^\s*$/,
    TickTick_EVENT_DATE: /(\d{4})-(\d{2})-(\d{2})/
};

export class TaskParser {
    app:App;
    plugin: UltimateTickTickSyncForObsidian;
    
    constructor(app:App, plugin:UltimateTickTickSyncForObsidian) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin
    }
    
    
    
    
    //convert line text to a task object
    async convertTextToTickTickTaskObject(lineText:string,filepath:string,lineNumber?:number,fileContent?:string) {
        //console.log(`linetext is:${lineText}`)
        
        let hasParent = false
        let parentId = null
        let parentTaskObject = null
        //Detect parentID
        let textWithoutIndentation = lineText
        if(this.getTabIndentation(lineText) > 0){
            //console.log(`Indentation is ${this.getTabIndentation(lineText)}`)
            textWithoutIndentation = this.removeTaskIndentation(lineText)
            //console.log(textWithoutIndentation)
            //console.log(`This is a subtask`)
            //Read filepath
            //const fileContent = await this.plugin.fileOperation.readContentFromFilePath(filepath)
            //Traverse line
            const lines = fileContent.split('\n')
            //console.log(lines)
            for (let i = (lineNumber - 1 ); i >= 0; i--) {
                //console.log(`Checking the indentation of line ${i}`)
                const line = lines[i]
                //console.log(line)
                //If it is a blank line, it means there is no parent
                if(this.isLineBlank(line)){
                    break
                }
                //If the number of tabs is greater than or equal to the current line, skip
                if (this.getTabIndentation(line) >= this.getTabIndentation(lineText)) {
                    //console.log(`Indentation is ${this.getTabIndentation(line)}`)
                    continue
                }
                if((this.getTabIndentation(line) < this.getTabIndentation(lineText))){
                    //console.log(`Indentation is ${this.getTabIndentation(line)}`)
                    if(this.hasTickTickId(line)){
                        parentId = this.getTickTickIdFromLineText(line)
                        hasParent = true
                        //console.log(`parent id is ${parentId}`)
                        parentTaskObject = this.plugin.cacheOperation.loadTaskFromCacheyID(parentId)
                        break
                    }
                    else{
                        break
                    }
                }
            }
            
            
        }
        
        const dueDate = this.getDueDateFromLineText(textWithoutIndentation)
        const labels = this.getAllTagsFromLineText(textWithoutIndentation)
        //console.log(`labels is ${labels}`)
        
        //dataview format metadata
        //const projectName = this.getProjectNameFromLineText(textWithoutIndentation) ?? this.plugin.settings.defaultProjectName
        //const projectId = await this.plugin.cacheOperation.getProjectIdByNameFromCache(projectName)
        //use tag as project name
        
        let projectId = this.plugin.cacheOperation.getDefaultProjectIdForFilepath(filepath as string)
        let projectName = this.plugin.cacheOperation.getProjectNameByIdFromCache(projectId)
        
        if(hasParent){
            projectId = parentTaskObject.projectId
            projectName =this.plugin.cacheOperation.getProjectNameByIdFromCache(projectId)
        }
        if(!hasParent){
            //Match tag and person
            for (const label of labels){
                
                //console.log(label)
                let labelName = label.replace(/#/g, "");
                //console.log(labelName)
                let hasProjectId = this.plugin.cacheOperation.getProjectIdByNameFromCache(labelName)
                if(!hasProjectId){
                    continue
                }
                projectName = labelName
                //console.log(`project is ${projectName} ${label}`)
                projectId = hasProjectId
                break
            }
        }
        
        
        const content = this.getTaskContentFromLineText(textWithoutIndentation)
        const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation)
        let description = ""
        const TickTick_id = this.getTickTickIdFromLineText(textWithoutIndentation)
        const priority = this.getTaskPriority(textWithoutIndentation)
        if(filepath){
            let url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
            description =`[${filepath}](${url})`;
        }
        
        const TickTickTask = {
            projectId: projectId,
            content: content || '',
            parentId: parentId || null,
            dueDate: dueDate || '',
            labels: labels || [],
            description: description,
            isCompleted:isCompleted,
            TickTick_id:TickTick_id || null,
            hasParent:hasParent,
            priority:priority
        };
        //console.log(`converted task `)
        //console.log(TickTickTask)
        return TickTickTask;
    }
    
    
    
    
    hasTickTickTag(text:string){
        //console.log("Check whether TickTick tag is included")
        //console.log(text)
        return(REGEX.TickTick_TAG.test(text))
    }
    
    
    
    hasTickTickId(text:string){
        const result = REGEX.TickTick_ID.test(text)
        //console.log("Check whether TickTick id is included")
        //console.log(text)
        return(result)
    }
    
    
    hasDueDate(text:string){
        return(REGEX.DUE_DATE_WITH_EMOJ.test(text))
    }
    
    
    getDueDateFromLineText(text: string) {
        const result = REGEX.DUE_DATE.exec(text);
        return result ? result[1] : null;
    }
    
    
    
    getProjectNameFromLineText(text:string){
        const result = REGEX.PROJECT_NAME.exec(text);
        return result ? result[1] : null;
    }
    
    
    getTickTickIdFromLineText(text:string){
        //console.log(text)
        const result = REGEX.TickTick_ID_NUM.exec(text);
        //console.log(result)
        return result ? result[1] : null;
    }
    
    getDueDateFromDataview(dataviewTask:object){
        if(!dataviewTask.due){
            return ""
        }
        else{
            const dataviewTaskDue = dataviewTask.due.toString().slice(0, 10)
            return(dataviewTaskDue)
        }
        
    }
    
    
    
    /*
    //convert line task to dataview task object
    async getLineTask(filepath,line){
        //const tasks = this.app.plugins.plugins.dataview.api.pages(`"${filepath}"`).file.tasks
        const tasks = await getAPI(this.app).pages(`"${filepath}"`).file.tasks
        const tasksValues ​​= tasks.values
        //console.log(`dataview filepath is ${filepath}`)
        //console.log(`dataview line is ${line}`)
        //console.log(tasksValues)
        const currentLineTask = tasksValues.find(obj => obj.line === line )
        console.log(currentLineTask)
        return(currentLineTask)
        
    }
    */
    
    
    
    getTaskContentFromLineText(lineText:string) {
        const TaskContent = lineText.replace(REGEX.TASK_CONTENT.REMOVE_INLINE_METADATA,"")
        .replace(REGEX.TASK_CONTENT.REMOVE_TickTick_LINK,"")
        .replace(REGEX.TASK_CONTENT.REMOVE_PRIORITY," ") //There must be spaces before and after priority.
        .replace(REGEX.TASK_CONTENT.REMOVE_TAGS,"")
        .replace(REGEX.TASK_CONTENT.REMOVE_DATE,"")
        .replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX,"")
        .replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX_WITH_INDENTATION,"")
        .replace(REGEX.TASK_CONTENT.REMOVE_SPACE,"")
        return(TaskContent)
    }
    
    
    //get all tags from task text
    getAllTagsFromLineText(lineText:string){
        let tags = lineText.match(REGEX.ALL_TAGS);
        
        if (tags) {
            // Remove '#' from each tag
            tags = tags.map(tag => tag.replace('#', ''));
        }
        
        return tags;
    }
    
    //get checkbox status
    isTaskCheckboxChecked(lineText:string) {
        return(REGEX.TASK_CHECKBOX_CHECKED.test(lineText))
    }
    
    
    //task content compare
    taskContentCompare(lineTask:Object,TickTickTask:Object) {
        const lineTaskContent = lineTask.content
        //console.log(dataviewTaskContent)
        
        const TickTickTaskContent = TickTickTask.content
        //console.log(TickTickTask.content)
        
        //Whether content is modified?
        const contentModified = (lineTaskContent === TickTickTaskContent)
        return(contentModified)
    }
    
    
    //tag compare
    taskTagCompare(lineTask:Object,TickTickTask:Object) {
        
        
        const lineTaskTags = lineTask.labels
        //console.log(dataviewTaskTags)
        
        const TickTickTaskTags = TickTickTask.labels
        //console.log(TickTickTaskTags)
        
        //Whether content is modified?
        const tagsModified = lineTaskTags.length === TickTickTaskTags.length && lineTaskTags.sort().every((val, index) => val === TickTickTaskTags.sort()[index]);
        return(tagsModified)
    }
    
    //task status compare
    taskStatusCompare(lineTask:Object,TickTickTask:Object) {
        //Whether status is modified?
        const statusModified = (lineTask.isCompleted === TickTickTask.isCompleted)
        //console.log(lineTask)
        //console.log(TickTickTask)
        return(statusModified)
    }
    
    
    //task due date compare
    async compareTaskDueDate(lineTask: object, TickTickTask: object): boolean {
        const lineTaskDue = lineTask.dueDate
        const TickTickTaskDue = TickTickTask.due ?? "";
        //console.log(dataviewTaskDue)
        //console.log(TickTickTaskDue)
        if (lineTaskDue === "" && TickTickTaskDue === "") {
            //console.log('No due date')
            return true;
        }
        
        if ((lineTaskDue || TickTickTaskDue) === "") {
            console.log(lineTaskDue);
            console.log(TickTickTaskDue)
            //console.log('due date has changed')
            return false;
        }
        
        const oldDueDateUTCString = this.localDateStringToUTCDateString(lineTaskDue)
        if (oldDueDateUTCString === TickTickTaskDue.date) {
            //console.log('due date consistent')
            return true;
        } else if (lineTaskDue.toString() === "Invalid Date" || TickTickTaskDue.toString() === "Invalid Date") {
            console.log('invalid date')
            return false;
        } else {
            //console.log(lineTaskDue);
            //console.log(TickTickTaskDue.date)
            return false;
        }
    }
    
    
    //task project id compare
    async taskProjectCompare(lineTask:Object,TickTickTask:Object) {
        //project whether to modify
        //console.log(dataviewTaskProjectId)
        //console.log(TickTickTask.projectId)
        return(lineTask.projectId === TickTickTask.projectId)
    }
    
    
    //Determine whether the task is indented
    isIndentedTask(text:string) {
        return(REGEX.TASK_INDENTATION.test(text));
    }
    
    
    //Determine the number of tab characters
    //console.log(getTabIndentation("\t\t- [x] This is a task with two tabs")); // 2
    //console.log(getTabIndentation(" - [x] This is a task without tabs")); // 0
    getTabIndentation(lineText:string){
        const match = REGEX.TAB_INDENTATION.exec(lineText)
        return match ? match[1].length : 0;
    }
    
    
    // Task priority from 1 (normal) to 4 (urgent).
    getTaskPriority(lineText:string): number{
        const match = REGEX.TASK_PRIORITY.exec(lineText)
        return match ? Number(match[1]) : 1;
    }
    
    
    
    //remove task indentation
    removeTaskIndentation(text) {
        const regex = /^([ \t]*)?- \[(x| )\] /;
        return text.replace(regex, "- [$2] ");
    }
    
    
    //Judge whether line is a blank line
    isLineBlank(lineText:string) {
        return(REGEX.BLANK_LINE.test(lineText))
    }
    
    
    //Insert date in linetext
    insertDueDateBeforeTickTick(text, dueDate) {
        const regex = new RegExp(`(${keywords.TickTick_TAG})`)
        return text.replace(regex, `📅 ${dueDate} $1`);
    }
    
    //extra date from obsidian event
    // Usage example
    //const str = "2023-03-27T15:59:59.000000Z";
    //const dateStr = ISOStringToLocalDateString(str);
    //console.log(dateStr); // Output 2023-03-27
    ISOStringToLocalDateString(utcTimeString:string) {
        try {
            if(utcTimeString === null){
                return null
            }
            let utcDateString = utcTimeString;
            let dateObj = new Date(utcDateString); // Convert UTC format string to Date object
            let year = dateObj.getFullYear();
            let month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            let date = dateObj.getDate().toString().padStart(2, '0');
            let localDateString = `${year}-${month}-${date}`;
            return localDateString;
            return(localDateString);
        } catch (error) {
            console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
            return null;
        }
    }
    
    
    //extra date from obsidian event
    // Usage example
    //const str = "2023-03-27T15:59:59.000000Z";
    //const dateStr = ISOStringToLocalDatetimeString(str);
    //console.log(dateStr); // Output Mon Mar 27 2023 23:59:59 GMT+0800 (China Standard Time)
    ISOStringToLocalDatetimeString(utcTimeString:string) {
        try {
            if(utcTimeString === null){
                return null
            }
            let utcDateString = utcTimeString;
            let dateObj = new Date(utcDateString); // Convert UTC format string to Date object
            let result = dateObj.toString();
            return(result);
        } catch (error) {
            console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
            return null;
        }
    }
    
    
    
    //convert date from obsidian event
    // Usage example
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDatetimeString(str);
    //console.log(dateStr); // Output 2023-03-27T00:00:00.000Z
    localDateStringToUTCDatetimeString(localDateString:string) {
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
    
    //convert date from obsidian event
    // Usage example
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDateString(str);
    //console.log(dateStr); // Output 2023-03-27
    localDateStringToUTCDateString(localDateString:string) {
        try {
            if(localDateString === null){
                return null
            }
            localDateString = localDateString + "T08:00";
            let localDateObj = new Date(localDateString);
            let ISOString = localDateObj.toISOString()
            let utcDateString = ISOString.slice(0,10)
            return(utcDateString);
        } catch (error) {
            console.error(`Error extracting date from string '${localDateString}': ${error}`);
            return null;
        }
    }
    
    isMarkdownTask(str: string): boolean {
        const taskRegex = /^\s*-\s+\[([x ])\]/;
        return taskRegex.test(str);
    }
    
    addTickTickTag(str: string): string {
        return(str +` ${keywords.TickTick_TAG}`);
    }
    
    getObsidianUrlFromFilepath(filepath:string){
        const url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
        const obsidianUrl =`[${filepath}](${url})`;
        return(obsidianUrl)
    }
    
    
    addTickTickLink(linetext: string,TickTickLink:string): string {
        const regex = new RegExp(`${keywords.TickTick_TAG}`, "g");
        return linetext.replace(regex, TickTickLink + ' ' + '$&');
    }
    
    
    //Check whether TickTick link is included
    hasTickTickLink(lineText:string){
        return(REGEX.TickTick_LINK.test(lineText))
    }
}
