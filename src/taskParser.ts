import { App } from 'obsidian';
import TickTickSync from "../main";
import { Tick } from 'ticktick-api-lvt'
import { ITask } from "ticktick-api-lvt/dist/types/Task"
import { ITag } from 'ticktick-api-lvt/dist/types/Tag';
import {Task, TaskRegularExpressions} from "obsidian-task/src/Task"
import { TaskLocation } from 'obsidian-task/src/TaskLocation';






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


// interface TickTickTaskObject {
//     content: string;
//     description?: string;
//     project_id?: string;
//     section_id?: string;
//     parent_id?: string;
//     order?: number | null;
//     tags?: string[];
//     priority?: number | null;
//     due_string?: string;
//     due_date?: string;
//     due_lang?: string;
//     assignee_id?: string;
// }



const priorityEmojis = ['⏬', '🔽', '🔼', '⏫', '🔺',]
const prioritySymbols = {
    Highest: '🔺',
    High: '⏫',
    Medium: '🔼',
    Low: '🔽',
    Lowest: '⏬',
    None: '',
}
enum Priority {
    Highest = '5',
    High = '5',
    Medium = '3',
    None = '0',
    Low = '1',
    Lowest = '0',
}

const keywords = {
    TickTick_TAG: "#ticktick",
    DUE_DATE: "🗓️|📅|📆|🗓",
    // priorityIcons: "⏬|🔽|🔼|⏫|🔺",
    // priority: `\s([${priorityEmojis.toString()}])\s`
    priority: `\\s([\u{23EC}\u{1F53D}\u{1F53C}\u{23EB}\u{1F53A}])\\s`
};



//For now, we're going to do task view emojies only
const priorityMapping = [
    { ticktick: 0, obsidian: null },
    { ticktick: 0, obsidian: '⏬' },
    { ticktick: 1, obsidian: '🔽' },
    { ticktick: 3, obsidian: '🔼' },
    { ticktick: 5, obsidian: '⏫' },
    { ticktick: 5, obsidian: '🔺' }
];


const REGEX = {
	//hopefully tighter find.
    TickTick_TAG: new RegExp(`(?<=[ ;])${keywords.TickTick_TAG}+`, 'i'),
    TickTick_ID: /\[ticktick_id::\s*[\d\S]+\]/,
    TickTick_ID_NUM: /\[ticktick_id::\s*(.*?)\]/,
    TickTick_LINK: /\[link\]\(.*?\)/,
    DUE_DATE_WITH_EMOJ: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`),
    // DUE_DATE : new RegExp(`(?:${keywords.DUE_DATE})\\s?(\\d{4}-\\d{2}-\\d{2})`),
    DUE_DATE: new RegExp(`(?<=(${keywords.DUE_DATE})\\s)(\\d{4}-\\d{2}-\\d{2})(\\s\\d{1,}:\\d{2})?`, 'g'),
    PROJECT_NAME: /\[project::\s*(.*?)\]/,
    TASK_CONTENT: {
        REMOVE_PRIORITY: /[🔺⏫🔼🔽⏬]/ug,
		//accommodate UTF-16 languages.
        REMOVE_TAGS: /(?<=\s)#[\w\d\u4e00-\u9fff\u0600-\u06ff\uac00-\ud7af]+/g,
        REMOVE_SPACE: /^\s+|\s+$/g,
        REMOVE_DATE: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}\\s(\\d{1,}:\\d{2})?`),
        REMOVE_INLINE_METADATA: /%%\[\w+::\s*\w+\]%%/,
        REMOVE_CHECKBOX: /^(-|\*)\s+\[(x|X| )\]\s/,
        REMOVE_CHECKBOX_WITH_INDENTATION: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
        REMOVE_TickTick_LINK: /\[link\]\(.*?\)/,
    },
	//todo: this and remove_tags are redundant. Probably some of the other stuff to. Rationalize this lot.
    ALL_TAGS: /(?<=\s)#[\w\d\u4e00-\u9fff\u0600-\u06ff\uac00-\ud7af]+/g,
    TASK_CHECKBOX_CHECKED: /- \[(x|X)\] /,
    TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
    TAB_INDENTATION: /^(\t+)/,
    // TASK_PRIORITY: /\s!!([1-4])\s/,
    TASK_PRIORITY: new RegExp(keywords.priority),
    priorityRegex: /^.*([🔺⏫🔼🔽⏬]).*$/u,
    BLANK_LINE: /^\s*$/,
    TickTick_EVENT_DATE: /(\d{4})-(\d{2})-(\d{2})/,
	ITEM_LINE: /\[(.*?)\]\s*(.*?)\s*%%(.*?)%%/
};

export class TaskParser {
    app: App;
    plugin: TickTickSync;

    constructor(app: App, plugin: TickTickSync) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin
    }

    //convert a task object to a task line.
    async convertTaskObjectToTaskLine(task: ITask): Promise<string> {
        let resultLine = "";

        task.title = this.stripOBSUrl(task.title);

        resultLine = `- [${task.status > 0 ? 'X' : ' '}] ${task.title}`;

        //add Tags
        if (task.tags) {
            resultLine = this.addTagsToLine(resultLine, task.tags);
        }
        resultLine = this.addTickTickTag(resultLine);

        resultLine = this.addTickTickLink(resultLine, task.id, task.projectId);
        resultLine = this.addTickTickId(resultLine, task.id);

		//add priority
		resultLine = this.addPriorityToLine(resultLine, task);

		//add due date
		if (task.dueDate) {
			resultLine = this.addDueDateToLine(resultLine, task);
		}

		if (task.items && task.items.length > 0) {
            resultLine = this.addItems(resultLine, task.items)
        }

        return resultLine;

    }
    stripOBSUrl(title: string): string {
		//TODO: this is ugly but I can't find a clean regex to make it happen.
		let result = title;
		if (result) {
			let eoURL = title.lastIndexOf(".md)");
			let boURL = 0
			if (eoURL > 0) {
				for (let i = eoURL; i > 0; i--) {
					if (title[i] === '[') {
						boURL = i;
						break;
					}
				}
				if (boURL > 0) {
					result = title.substring(0, boURL);
					result = result + title.substring(eoURL + 4); //magic number is len of .md + 1
				}
			}
		}
		return result;
	}

    private addItems(resultLine: string, items: any[]): string {
        //TODO count indentations?
        items.forEach(item => {
            let completion = item.status > 0? "- [X]" : "- [ ]"; 
            resultLine = `${resultLine} \n${completion} ${item.title} %%${item.id}%%`;
        });
        return resultLine;
    }

	private getItemFromLine(itemLine: string) {

		const matches = REGEX.ITEM_LINE.exec(itemLine);
		let item = {};
		if (matches) {

			const status = matches[1];
			const text = matches[2];
			const id = matches[3];

			const itemStatus = " "? 0: 2

			item = {
				id: id,
				title: text,
				status: itemStatus
			}
		}
		return item

	}



    private addPriorityToLine(resultLine: string, task: ITask) {
        let priority = this.translateTickTickToObsidian(task.priority);
        if (priority != null) {
            // console.log("task pri: ", task.priority, " emoji num: ", priority, priorityEmojis[priority])
            // console.log("task pri: ", task.priority, " emoji num: ", priority)
            resultLine = `${resultLine} ${priority}`;
        }
        // else 
        // {
        //     console.log("task pri: ", task.priority, " undefined: ", priority)
        // }
        return resultLine;
    }

    private addDueDateToLine(resultLine: string, task: ITask) {
		let dueDate = this.utcToLocalNoTime(task.dueDate)
        resultLine = resultLine + ' 📅 ' + dueDate;
        return resultLine;
    }

    addTagsToLine(resultLine: string, tags: ITask.tags) {
        //we're looking for the ticktick tag without the #
        const regEx = new RegExp(keywords.TickTick_TAG.substring(1), "i");
        tags.forEach((tag: string) => {
            //TickTick tag, if present, will be added at the end.
            if (!tag.match(regEx)) {
                resultLine = resultLine + " #" + tag;
            }
        });
        return resultLine;
    }


    //convert line text to a task object
    async convertTextToTickTickTaskObject(lineText: string, filepath: string, lineNumber?: number, fileContent?: string) {
        let hasParent = false
        let parentId = null
        let parentTaskObject = null
		let taskItems = []
		const lines = fileContent.split('\n')
		const lineTextTabIndentation = this.getTabIndentation(lineText);
		let textWithoutIndentation = this.removeTaskIndentation(lineText)

		const TickTick_id = this.getTickTickIdFromLineText(textWithoutIndentation)

		//Detect parentID
		if (lineTextTabIndentation > 0) {
            for (let i = (lineNumber - 1); i >= 0; i--) {
                //console.log(`Checking the indentation of line ${i}`)
                const line = lines[i]
                //console.log(line)
                //If it is a blank line, it means there is no parent
                if (this.isLineBlank(line)) {
                    break
                }
                //If the number of tabs is greater than or equal to the current line, skip
                if (this.getTabIndentation(line) >= lineTextTabIndentation) {
                    //console.log(`Indentation is ${this.getTabIndentation(line)}`)
                    continue
                }
                if ((this.getTabIndentation(line) < lineTextTabIndentation)) {
                    //console.log(`Indentation is ${this.getTabIndentation(line)}`)
                    if (this.hasTickTickId(line)) {
                        parentId = this.getTickTickIdFromLineText(line)
                        hasParent = true
                        // console.log(`parent id is ${parentId}`)
                        parentTaskObject = await this.plugin.cacheOperation?.loadTaskFromCacheID(parentId)
                        break
                    }
                    else {
                        break
                    }
                }
            }
        }

		//find task items
		for (let i = (lineNumber + 1); i <= lines.length; i++) {
			const line = lines[i]
			//console.log(line)
			//If it is a blank line, it means there is no parent
			if (this.isLineBlank(line)) {
				break
			}
			//If the number of tabs is greater than or equal to the current line, it's an item
			if (this.getTabIndentation(line) > lineTextTabIndentation) {
				//console.log(`Indentation is ${this.getTabIndentation(line)}`)
				if (this.hasTickTickId(line)) {
					//it's another task bail
					break;
				}
				const item = this.getItemFromLine(line)
				taskItems.push(item);
			} else {
				//we're either done with items, or onto the next task or blank line.
				//we're done.
				break;
			}

		}

        var dueDate = this.getDueDateFromLineText(textWithoutIndentation)
        var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;


        const tags = this.getAllTagsFromLineText(textWithoutIndentation)

        let projectId = await this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(filepath as string)
		// let projectIdByTask = await this.plugin.cacheOperation?.getProjectIdForTask(TickTick_id);

        let projectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId)
        if (hasParent ) {
			if (parentTaskObject) {
				projectId = parentTaskObject.projectId
				projectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId)
			}
        } else {
            if (tags) {
                for (const tag of tags) {
                    let labelName = tag.replace(/#/g, "");
                    let hasProjectId = await this.plugin.cacheOperation?.getProjectIdByNameFromCache(labelName)
                    if (!hasProjectId) {
                        continue
                    }
                    projectName = labelName
                    projectId = hasProjectId
                    break
                }
            }
        }

        const title = this.getTaskContentFromLineText(textWithoutIndentation)
		if ((this.plugin.settings.debugMode) && (!projectId)) {
			console.error("Converting line to Object, could not find project Id: ", title );
		}

        const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation)
        let description = ""
        const priority = this.getTaskPriority(textWithoutIndentation)
        if (filepath) {
            let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath)
            if (taskURL) {
                description = taskURL;
            }
            
        }
        const task: ITask = {
            id: TickTick_id || "",
            projectId: projectId,
            title: title.trim() + " " + description,
            //todo: Not cloberring the content field, what should we do?
            //content: ??
            // content: description,
			items: taskItems || [],
            parentId: parentId || "",
            dueDate: dueDate || '',
            //TickTick, for some reason, will derive a start date from due date, and eff up the date displayed. 
            //Force the startdate to be the same....
            startDate: dueDate || '',
            tags: tags || [],
            priority: Number(priority),
            modifiedTime: this.formatDateToISO(new Date()),
            status: isCompleted ? 2 : 0, //Status: 0 is no completed. Anything else is completed.
            timeZone: timeZone
        }

        return task;
    }




    hasTickTickTag(text: string) {
        if (this.isMarkdownTask(text)) {
            return REGEX.TickTick_TAG.test(text);
        } else {
            return false;
        }
    }



    hasTickTickId(text: string) {
        const result = REGEX.TickTick_ID.test(text)
        // console.log("Check whether TickTick id is included")
        // console.log(text, result)
        return (result)
    }

    addTickTickId(line: string, ticktick_id: string) {
        line = `${line} %%[ticktick_id:: ${ticktick_id}]%%`;
        return line;
    }

    addChildToParent(parentTask: ITask, childId: string) {
        if (!parentTask.childIds) {
            parentTask.childIds = [];
        }
        parentTask.childIds.push(childId);
        return parentTask;
    }

    hasDueDate(text: string) {
        return (REGEX.DUE_DATE_WITH_EMOJ.test(text))
    }


    getDueDateFromLineText(text: string) {
        const regEx = REGEX.DUE_DATE;
        const result = text.match(regEx)
        let returnDate = null;
        if (result) {
            const dateParts = result.toString().split(" ");
            if (!dateParts[1]) {
                dateParts[1] = "08:00"
            }
            returnDate = `${dateParts[0]} ${dateParts[1]}`
            returnDate = this.formatDateToISO(new Date(returnDate));
        }
        return returnDate;
    }



    getProjectNameFromLineText(text: string) {
        const result = REGEX.PROJECT_NAME.exec(text);
        return result ? result[1] : null;
    }


    getTickTickIdFromLineText(text: string) {
        const result = REGEX.TickTick_ID_NUM.exec(text);
        return result ? result[1] : null;
    }

    getTaskContentFromLineText(lineText: string) {
        let TaskContent = lineText.replace(REGEX.TASK_CONTENT.REMOVE_INLINE_METADATA, "")
            .replace(REGEX.TASK_CONTENT.REMOVE_TickTick_LINK, "")
            .replace(REGEX.TASK_CONTENT.REMOVE_PRIORITY, " ") //There must be spaces before and after priority.
            .replace(REGEX.TASK_CONTENT.REMOVE_TAGS, "")
            .replace(REGEX.TASK_CONTENT.REMOVE_DATE, "")
            .replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX, "")
            .replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX_WITH_INDENTATION, "")
            .replace(REGEX.TASK_CONTENT.REMOVE_SPACE, "")
		// console.log("AfteR: ", TaskContent)
		TaskContent = this.stripOBSUrl(TaskContent);
        return (TaskContent)
    }


    //get all tags from task text
    getAllTagsFromLineText(lineText: string) {
        // let tags = lineText.matchAll(REGEX.ALL_TAGS);

        // if (tags) {
        //     // Remove '#' from each tag
        //     tags = tags.map(tag => tag.replace('#', ''));
        // }
        const tags = [...lineText.matchAll(REGEX.ALL_TAGS)];
        const tagArray = tags.map(tag => tag[0].replace('#', ''));
        // tagArray.forEach(tag => console.log(typeof tag, tag)) 

        return tagArray;
    }

    //get checkbox status
    isTaskCheckboxChecked(lineText: string) {
        return (REGEX.TASK_CHECKBOX_CHECKED.test(lineText))
    }


    //task content compare
    isTitleChanged(lineTask: ITask, TickTickTask: ITask) {
        //TODO: This is ugly, but I'm tired of chasing it. There's still a place where 
        //      we're adding the OBSUrl to the tile when we don't need to. Everything else
        //      works, so just kludge it for now.

        const lineTaskTitle = this.stripOBSUrl(lineTask.title)
        const TickTickTaskTitle = this.stripOBSUrl(TickTickTask.title)
        //Whether content is modified?
        const contentModified = (lineTaskTitle.trim() === TickTickTaskTitle.trim())
        return (!contentModified)
    }


    //tag compare
    isTagsChanged(lineTask: ITask, TickTickTask: ITask) {
        const lineTaskTags = lineTask.tags ? lineTask.tags : []
        const TickTickTaskTags = TickTickTask.tags ? TickTickTask.tags : []
        if (!lineTaskTags && !TickTickTaskTags) {
            return false; //no tags.
        } else if ((lineTaskTags && !TickTickTaskTags) || (!lineTaskTags && TickTickTaskTags)) {
            return true; //tasks added or deleted. 
        }
        //Whether content is modified?
        let areTagsSame = lineTaskTags.length === TickTickTaskTags.length && lineTaskTags.sort().every((val, index) => val === TickTickTaskTags.sort()[index]);
        return !(areTagsSame)
    }

    //task status compare
    isStatusChanged(lineTask: Object, TickTickTask: Object) {
        //Whether status is modified?
        const statusModified = (lineTask.status === TickTickTask.status)
        //console.log(lineTask)
        //console.log(TickTickTask)
        return (!statusModified)
    }

    isParentIdChanged(lineTask: ITask, TickTickTask: ITask): boolean {
        let lineParentId = lineTask.parentId? lineTask.parentId: "";
        let cacheParentId = TickTickTask.parentId? TickTickTask.parentId: "";

		return (lineParentId != cacheParentId)
    }
    //task due date compare
    isDueDateChanged(lineTask: ITask, TickTickTask: ITask): boolean {
        const lineTaskDue = lineTask.dueDate
        const TickTickTaskDue = TickTickTask.dueDate ?? "";
        if (lineTaskDue === "" && TickTickTaskDue === "") {
            //console.log('No due date')
            return false;
        }

        if ((lineTaskDue || TickTickTaskDue) === "") {
            //console.log('due date has changed')
            return true;
        }

        if (lineTaskDue === TickTickTaskDue) {
            //console.log('due date consistent')
            return false;
        } else if (lineTaskDue.toString() === "Invalid Date" && TickTickTaskDue.toString() === "Invalid Date") {
            // console.log('invalid date')
            return false;
        } else {
			const date1 = new Date(lineTaskDue);
			const date2 = new Date(TickTickTaskDue);

			const utcDate1 = new Date(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate(),date1.getUTCHours(), date1.getUTCMinutes(), date1.getUTCSeconds());
			const utcDate2 = new Date(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate(),date2.getUTCHours(), date2.getUTCMinutes(), date2.getUTCSeconds());

			if (utcDate1.getTime() === utcDate2.getTime()) {
				return false;
			} else {
				if (this.plugin.settings.debugMode) {
					// Calculate the difference in minutes
					const timeDifferenceInMilliseconds = Math.abs(utcDate2.getTime() - utcDate1.getTime());
					const days = Math.floor(timeDifferenceInMilliseconds / (1000 * 60 * 60 * 24));
					const hours = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
					const minutes = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60)) / (1000 * 60));

					if (days > 0) {
						console.log(`The timestamps are ${days} days, ${hours} hours, and ${minutes} minutes apart.`);
					} else if (hours > 0) {
						console.log(`The timestamps are ${hours} hours and ${minutes} minutes apart.`);
					} else {
						console.log(`The timestamps are ${minutes} minutes apart.`);
					}
				}
				return true;
			}
        }
    }


    //task project id compare
    isProjectIdChanged(lineTask: ITask, TickTickTask: ITask) {
        //project whether to modify
        return !(lineTask.projectId === TickTickTask.projectId)
    }


    //Determine whether the task is indented
    isIndentedTask(text: string) {
        return (REGEX.TASK_INDENTATION.test(text));
    }


    //Determine the number of tab characters
    //console.log(getTabIndentation("\t\t- [x] This is a task with two tabs")); // 2
    //console.log(getTabIndentation(" - [x] This is a task without tabs")); // 0
    getTabIndentation(lineText: string) {
        const match = REGEX.TAB_INDENTATION.exec(lineText)
        return match ? match[1].length : 0;
    }

	getTabs(lineText: string) {
		const numTabs = this.getTabIndentation(lineText)
		let tabs = ""
		for (let i = 0; i < numTabs; i++) {
			tabs = tabs + '\t';
		}
		return tabs
	}


    // Task priority from 0 (none) to 4 (urgent).
    getTaskPriority(lineText: string) {
        let priority = "0";
        const priorityMatch = lineText.match(REGEX.priorityRegex);
        if (priorityMatch !== null) {
            priority = this.parsePriority(priorityMatch[1]);
        }

        return priority;
    }

    protected parsePriority(p: string): Priority {
        // const { prioritySymbols } = prioritySymbols;
        switch (p) {
            case prioritySymbols.Lowest:
                return Priority.Lowest;
            case prioritySymbols.Low:
                return Priority.Low;
            case prioritySymbols.Medium:
                return Priority.Medium;
            case prioritySymbols.High:
                return Priority.High;
            case prioritySymbols.Highest:
                return Priority.Highest;
            default:
                return Priority.None;
        }
    }

    //remove task indentation
    removeTaskIndentation(text) {
        const regex = /^([ \t]*)?- \[(x| )\] /;
        return text.replace(regex, "- [$2] ");
    }


    //Judge whether line is a blank line
    isLineBlank(lineText: string) {
        return (REGEX.BLANK_LINE.test(lineText))
    }


    //Insert date in linetext
    insertDueDateBeforeTickTick(text, dueDate) {
        // console.log("Inserting: ", dueDate)
        const regex = new RegExp(`(${keywords.TickTick_TAG})`)
        return text.replace(regex, `📅 ${dueDate} $1`);
    }


    utcToLocal(utcDateString: string) {
        const date = new Date(utcDateString);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
	utcToLocalNoTime(utcDateString: string) {
		const date = new Date(utcDateString);
		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
    //Format date to TickTick Accepted date. 
    formatDateToISO(dateTime: Date) {
        // Create a new Date object from the input string
        const inputDate = new Date(dateTime);

        // Check if the input is a valid date
        if (isNaN(inputDate.getTime())) {
            return "Invalid Date";
        }

        // Get the date and time components
        const year = inputDate.getFullYear();
        const month = String(inputDate.getMonth() + 1).padStart(2, "0");
        const day = String(inputDate.getDate()).padStart(2, "0");
        const hours = String(inputDate.getHours()).padStart(2, "0");
        const minutes = String(inputDate.getMinutes()).padStart(2, "0");
        const tzOffSetH = inputDate.getTimezoneOffset() / 60
        const tzOffSetM = inputDate.getTimezoneOffset() % 60
        const tzOffSetHours = String(tzOffSetH).padStart(2, "0")
        const tzOffSetMins = String(tzOffSetM).padStart(2, "0")
        const tzOffSetSign = inputDate.getTimezoneOffset() < 0 ? "+" : "-" //this is relative to UTC, so it ony seems backwards.

        // Format the date and time in the "YYYY-MM-DDTHH:MM" format
        const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:00.000${tzOffSetSign}${tzOffSetHours}${tzOffSetMins}`;
        // const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}${tzOffSetSign}${tzOffSetHours}${tzOffSetMins}`;

        return formattedDate;
    }

    //TODO fix this.
    oldMarkdownTask(str: string): boolean {
        const taskRegex = /^\s*-\s+\[([x ])\]/;
        return taskRegex.test(str);
    }

    isMarkdownTask(str: string): boolean { 
        const forRealRegex = TaskRegularExpressions.taskRegex;
        return forRealRegex.test(str);
    }

    addTickTickTag(str: string): string {
		//TODO: assumption that there is at least one space before. validate.
        return (str + `${keywords.TickTick_TAG}`);
    }

    getObsidianUrlFromFilepath(filepath: string) {
		// if (this.plugin.settings.debugMode) {
		// 	console.log("Getting OBS path for: ", filepath)
		// }
        const url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
        const obsidianUrl = `[${filepath}](${url})`;
        return (obsidianUrl)
    }


    addTickTickLink(linetext: string, taskId: string, projecId: string): string {
        let url = this.createURL(taskId, projecId)
        const regex = new RegExp(`${keywords.TickTick_TAG}`, "gi");
        const link = ` [link](${url})`
        return linetext.replace(regex, link + ' ' + '$&');
    }


    //Check whether TickTick link is included
    hasTickTickLink(lineText: string) {
        return (REGEX.TickTick_LINK.test(lineText))
    }

    //ticktick specific url
    createURL(newTaskId: string, projectId: string): string {
        let url = "";
        if (projectId) {
            url = `https://${this.plugin.settings.baseURL}/webapp/#p/${projectId}/tasks/${newTaskId}`;
        } else {
            url = `https://${this.plugin.settings.baseURL}/webapp/#q/all/tasks/${newTaskId}`;
        }
        return url;
    }

    translateTickTickToObsidian(ticktickPriority: number) {
        const mapping = priorityMapping.find((item) => item.ticktick === ticktickPriority);
        return mapping ? mapping.obsidian : null;
    }

    translateObsidianToTickTick(obsidianPriority: number) {
        const mapping = priorityMapping.find((item) => item.obsidian === obsidianPriority);
        return mapping ? mapping.ticktick : null;
    }

    async taskFromLine(line: string, path: string): Promise<Task> {
        let taskLocation: TaskLocation = TaskLocation.fromUnknownPosition(path);
        let task = Task.fromLine({
            line,
            taskLocation: TaskLocation.fromUnknownPosition(path),
            fallbackDate: null,
        });
        return task;
    }
}
