import { App } from 'obsidian';
import TickTickSync from '../main';
import { ITask } from './api/types/Task';


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


const priorityEmojis = ['⏬', '🔽', '🔼', '⏫', '🔺'];
const prioritySymbols = {
	Highest: '🔺', High: '⏫', Medium: '🔼', Low: '🔽', Lowest: '⏬', None: ''
};

enum Priority {
	Highest = '5', High = '5', Medium = '3', None = '0', Low = '1', Lowest = '0',
}

const keywords = {
	TickTick_TAG: '#ticktick',
	DUE_DATE: '⏳|🗓️|📅|📆|🗓',
	TIME: '⌚',
	TASK_DUE_DATE: '📅',
	TASK_COMPLETE: '✅',
	ALL_TASK_EMOJI: '➕|⏳|🛫|📅|✅|❌',
	// priorityIcons: "⏬|🔽|🔼|⏫|🔺",
	// priority: `\s([${priorityEmojis.toString()}])\s`
	priority: `\\s([\u{23EC}\u{1F53D}\u{1F53C}\u{23EB}\u{1F53A}])\\s`
};


//For now, we're going to do task view emojies only
const priorityMapping = [{ ticktick: 0, obsidian: null }, { ticktick: 0, obsidian: '⏬' }, {
	ticktick: 1,
	obsidian: '🔽'
}, { ticktick: 3, obsidian: '🔼' }, { ticktick: 5, obsidian: '⏫' }, { ticktick: 5, obsidian: '🔺' }];


//borrowed from https://github.com/moremeyou/Obsidian-Tag-Buddy
const tag_regex = /(?<=^|\s)(#(?=[^\s#.'’,;!?:]*[^\d\s#.'’,;!?:])[^\s#.'’,;!?:]+)(?=[.,;!?:'’\s]|$)|(?<!`)```(?!`)/g; // fix for number-only and typographic apostrophy's
// const due_date_regex = `(${keywords.DUE_DATE})\\s(\\d{4}-\\d{2}-\\d{2})(\\s\\d{1,}:\\d{2})?`
const due_date_regex =       `(${keywords.DUE_DATE})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;
const due_date_strip_regex =        `[${keywords.DUE_DATE}]\\s\\d{4}-\\d{2}-\\d{2}(\\s\\d{1,}:\\d{2}|)`;
const completion_date_regex = `(${keywords.TASK_COMPLETE})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;
const completion_date_strip_regex = `${keywords.TASK_COMPLETE}\\s\\d{4}-\\d{2}-\\d{2}(\\s*\\d{1,}:\\d{2}|)`;

/*
* Stolen from https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/Task/TaskRegularExpressions.ts
* used without permission.
* Will ask for forgiveness in the fullness of time.
*
* */
const status_regex  = "^\\s*(-|\\*)\\s+\\[(x| )\\]\\s"

const indentationRegex = /^([\s\t>]*)/;

// Matches - * and + list markers, or numbered list markers (eg 1.)
const listMarkerRegex = /([-*+]|[0-9]+\.)/;

// Matches a checkbox and saves the status character inside
const checkboxRegex = /\[(.)\]/u;

// Matches the rest of the task after the checkbox.
const afterCheckboxRegex = / *(.*)/u;

const taskRegex = new RegExp(
	indentationRegex.source +
	listMarkerRegex.source +
	' +' +
	checkboxRegex.source +
	afterCheckboxRegex.source,
	'u',
);
/*End of stolen regex*/

export const REGEX = {
	//hopefully tighter find.
	TickTick_TAG: new RegExp(`^[\\s]*[-] \\[[x ]\\] [\\s\\S]*${keywords.TickTick_TAG}[\\s\\S]*$`, "i"),

	TickTick_ID: /\[ticktick_id::\s*[\d\S]+\]/,
	TickTick_ID_NUM: /\[ticktick_id::\s*(.*?)\]/,
	TickTick_ID_DV_NUM: /ticktick_id(.*?)%/,
	TickTick_LINK: /\[link\]\(.*?\)/,
	DUE_DATE_WITH_EMOJ: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`), // DUE_DATE : new RegExp(`(?:${keywords.DUE_DATE})\\s?(\\d{4}-\\d{2}-\\d{2})`),
	DUE_DATE: new RegExp(due_date_regex, 'gmu'),
	COMPLETION_DATE: new RegExp(completion_date_regex, 'gmu'),

	PROJECT_NAME: /\[project::\s*(.*?)\]/,
	TASK_CONTENT: {
		REMOVE_PRIORITY: /[🔺⏫🔼🔽⏬]/ug, //accommodate UTF-16 languages.
		REMOVE_TAGS: tag_regex,
		REMOVE_SPACE: /^\s+|\s+$/g,
		REMOVE_DATE: new RegExp(due_date_strip_regex, 'gmu'),
		REMOVE_COMPLETION_DATE: new RegExp(completion_date_strip_regex, 'gmu'),
		REMOVE_INLINE_METADATA: /%%\[\w+::\s*\w+\]%%/,
		REMOVE_CHECKBOX: /^(-|\*)\s+\[(x|X| )\]\s/,
		REMOVE_CHECKBOX_WITH_INDENTATION: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
		REMOVE_TickTick_LINK: /\[link\]\(.*?\)/
	}, //todo: this and remove_tags are redundant. Probably some of the other stuff to. Rationalize this lot.
	ALL_TAGS: tag_regex,
	TASK_CHECKBOX_CHECKED: /- \[(x|X)\] /,
	TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
	TAB_INDENTATION: /^(\t+)/, // TASK_PRIORITY: /\s!!([1-4])\s/,
	TASK_PRIORITY: new RegExp(keywords.priority),
	priorityRegex: /^.*([🔺⏫🔼🔽⏬]).*$/u,
	BLANK_LINE: /^\s*$/,
	TickTick_EVENT_DATE: /(\d{4})-(\d{2})-(\d{2})/,
	ITEM_LINE: /\[(.*?)\]\s*(.*?)\s*%%(.*?)%%/,
	REMOVE_ITEM_ID: /\s%%[^\[](.*?)[^\]]%%/g
};

export class TaskParser {
    app: App;
	plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
	}

	//convert a task object to a task line.
	async convertTaskToLine(task: ITask): Promise<string> {
		let resultLine = '';

		task.title = this.stripOBSUrl(task.title);

		resultLine = `- [${task.status > 0 ? 'x' : ' '}] ${task.title}`;



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
			resultLine = this.addItems(resultLine, task.items);
		}
		return resultLine;

	}

	stripOBSUrl(title: string): string {
		//TODO: this is ugly but I can't find a clean regex to make it happen.
		let result = title;
		if (result) {
			let eoURL = title.lastIndexOf('.md)');
			let boURL = 0;
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
		return result.trim();
	}

	getTaskContentFromLineText(lineText: string) {
		let TaskContent = lineText.replace(REGEX.TASK_CONTENT.REMOVE_INLINE_METADATA, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_TickTick_LINK, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_PRIORITY, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_TAGS, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_DATE, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_COMPLETION_DATE, "")
			.replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX_WITH_INDENTATION, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_SPACE, '');

		TaskContent = this.stripOBSUrl(TaskContent);
		return (TaskContent);
	}

	stripLineItemId(lineText: string) {
		let line = lineText.replace(REGEX.REMOVE_ITEM_ID, '')
		return line;
	}

	addTagsToLine(resultLine: string, tags: ITask.tags) {
		//we're looking for the ticktick tag without the #
		const regEx = new RegExp(keywords.TickTick_TAG.substring(1), 'i');
		tags.forEach((tag: string) => {
			//TickTick tag, if present, will be added at the end.
			if (!tag.match(regEx)) {
				if (tag.includes("-")) {
					tag = tag.replace(/-/g, '/');
				}
				resultLine = resultLine + ' #' + tag;
			}
		});
		return resultLine;
	}

	//convert line text to a task object
	async convertLineToTask(lineText: string, filepath: string, lineNumber?: number, fileContent?: string) {
		let hasParent = false;
		let parentId = null;
		let parentTaskObject = null;
		let taskItems = [];
		const lines = fileContent.split('\n');
		const lineTextTabIndentation = this.getTabIndentation(lineText);
		let textWithoutIndentation = this.removeTaskIndentation(lineText);

		const TickTick_id = this.getTickTickIdFromLineText(textWithoutIndentation);

		//Detect parentID
		if (lineTextTabIndentation > 0) {
			for (let i = (lineNumber - 1); i >= 0; i--) {
				//console.log(`Checking the indentation of line ${i}`)
				const line = lines[i];
				//console.log(line)
				//If it is a blank line, it means there is no parent
				if (this.isLineBlank(line)) {
					break;
				}
				//If the number of tabs is greater than or equal to the current line, skip
				if (this.getTabIndentation(line) >= lineTextTabIndentation) {
					//console.log(`Indentation is ${this.getTabIndentation(line)}`)
					continue;
				}
				if ((this.getTabIndentation(line) < lineTextTabIndentation)) {
					//console.log(`Indentation is ${this.getTabIndentation(line)}`)
					if (this.hasTickTickId(line)) {
						parentId = this.getTickTickIdFromLineText(line);
						hasParent = true;
						// console.log(`parent id is ${parentId}`)
						parentTaskObject = await this.plugin.cacheOperation?.loadTaskFromCacheID(parentId);
						break;
					} else {
						break;
					}
				}
			}
		}

		//find task items
		// When Full Vault Sync is enabled, we can tell the difference between items and subtasks
		// everything is a subtask
		// TODO: in the fullness of time, see if there's a way to differentiate.
		if (!this.plugin.settings.enableFullVaultSync) {
			for (let i = (lineNumber + 1); i <= lines.length; i++) {
				const line = lines[i];
				//console.log(line)
				//If it is a blank line, it means there is no parent
				if (this.isLineBlank(line)) {
					break;
				}
				//If the number of tabs is greater than or equal to the current line, it's an item
				if (this.getTabIndentation(line) > lineTextTabIndentation) {
					//console.log(`Indentation is ${this.getTabIndentation(line)}`)
					if (this.hasTickTickId(line)) {
						//it's another task bail
						break;
					}
					const item = this.getItemFromLine(line);
					taskItems.push(item);
				} else {
					//we're either done with items, or onto the next task or blank line.
					//we're done.
					break;
				}

			}
		}

		let dueDateStruct = this.getDueDateFromLineText(textWithoutIndentation);
		let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;


		const tags = this.getAllTagsFromLineText(textWithoutIndentation);

		let projectId = await this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(filepath as string);
		// let projectIdByTask = await this.plugin.cacheOperation?.getProjectIdForTask(TickTick_id);

		let projectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId);
		if (hasParent) {
			if (parentTaskObject) {
				projectId = parentTaskObject.projectId;
				// projectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId);
			}
		} else {
			//Check if we need to add this to a specific project by tag.
			if (tags) {
				for (const tag of tags) {
					let labelName = tag.replace(/#/g, '');

					let hasProjectId = await this.plugin.cacheOperation?.getProjectIdByNameFromCache(labelName);
					if (!hasProjectId) {
						continue;
					}
					projectName = labelName;
					projectId = hasProjectId;
					break;
				}
			}
		}

		const title = this.getTaskContentFromLineText(textWithoutIndentation);
		if ((this.plugin.settings.debugMode) && (!projectId)) {
			console.error('Converting line to Object, could not find project Id: ', title);
		}

		const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation);
		let description = '';
		const priority = this.getTaskPriority(textWithoutIndentation);
		if (filepath) {
			let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
			if (taskURL) {
				description = taskURL;
			}

		}
		const task: ITask = {
			id: TickTick_id || '',
			projectId: projectId,
			title: title.trim() + ' ' + description,
			//content: ??
			// content: description,
			items: taskItems || [],
			parentId: parentId || '', //TickTick, will use the start date for due date, and eff up the date displayed.
			//emulate what they do on the web interface and send null for due date.
			dueDate: dueDateStruct.returnDate || '',
			startDate: dueDateStruct.returnDate || '',
			isAllDay: dueDateStruct.isAllDay,
			tags: tags || [],
			priority: Number(priority),
			modifiedTime: this.formatDateToISO(new Date()),
			status: isCompleted ? 2 : 0, //Status: 0 is no completed. Anything else is completed.
			timeZone: timeZone
		};
		return task;
	}

	hasTickTickTag(text: string) {

		if (this.isMarkdownTask(text)) {
			// console.log("hasTickTickTag", `${text}
			// ${REGEX.TickTick_TAG}
			// ${REGEX.TickTick_TAG.test(text)}`);
			return REGEX.TickTick_TAG.test(text);
		} else {
			return false;
		}
	}

	hasTickTickId(text: string) {
		let result = REGEX.TickTick_ID.test(text);
		if (!result) {
			//try the dataview version
			result = REGEX.TickTick_ID_DV_NUM.test(text);
		}
		return (result);
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
		return (REGEX.DUE_DATE_WITH_EMOJ.test(text));
	}

	getDueDateFromLineText(text: string) {
		let isAllDay = true;
		const regEx = REGEX.DUE_DATE;
		let results = [...text.matchAll(regEx)];
		// console.log('@@@ Date parts from Regex: ', results);
		if (results.length == 0) {
			const nullDate = '';
			const nullVal = '';
			return { isAllDay, nullDate, nullVal };
		}

		let result;
		if (results.length > 1) {
			//arbitrarily take the last one
			result = results[results.length - 1];
		} else {
			result = results[0];
		}
		// for (const resultKey in result) {
		// 	console.log("@@@ ---", resultKey, result[resultKey]);
		// }
		let returnDate = null;
		if (result) {
			// console.log("String Date parts: ", result);
			if (!result[3]) {
				returnDate = `${result[2]}T00:00:00.000`;
				isAllDay = true;
			} else {
				if (result[3].includes('24:')) {
					result[3] = result[3].replace('24:', '00:');
				}
				returnDate = `${result[2]}T${result[3]}`;
				isAllDay = false;
			}
			returnDate = this.formatDateToISO(new Date(returnDate));
		}
		const emoji = result[1];
		// console.log("@@@ Returning ", {isAllDay,returnDate, emoji});
		return { isAllDay, returnDate, emoji };
	}

	getProjectNameFromLineText(text: string) {
		const result = REGEX.PROJECT_NAME.exec(text);
		return result ? result[1] : null;
	}

	getTickTickIdFromLineText(text: string) {
        let result = REGEX.TickTick_ID_NUM.exec(text);
		if (!result) {
			//try the dataview version
			result = REGEX.TickTick_ID_DV_NUM.exec(text);
		}
		return result ? result[1] : null;
	}

	isTaskOpen(line: string) {
		let result = new RegExp(status_regex, 'gmi').exec(line);
		if (result) {
			return (result[2].search(/[xX]/) < 0);
		} else {
			throw new Error(`Status not found in line: ${line}`)
		}
	}


	utcToLocal(utcDateString: string, bIsAllDay: boolean) {
		const date = new Date(utcDateString);
		//Regardless of host date/time format, we want to parse for "en-US" format
		const locale = "en-US";
		const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
		const localDate = date.toLocaleString(locale, {timeZone: hostTimeZone});
		//console.log("@@@@ local date string: ", localDate);
		const [datePart, timePart] = localDate.split(', ');
		let [month, day, year] = datePart.split('/');
		month = String(month).padStart(2, '0');
		day = String(day).padStart(2, '0');
		let [hours, minutes] = timePart.split(':');
		if (localDate.includes('PM')) {
			hours = (Number(hours) + 12).toString();
		} else if ((localDate.includes('AM') && hours === '12')) {
			hours = '24';
		}
		hours = String(hours).padStart(2, '0');
		minutes = String(minutes).padStart(2, '0');
		if (!bIsAllDay) {
			return `${year}-${month}-${day} ${hours}:${minutes}`;
		} else {
			return `${year}-${month}-${day}`;
		}

	}

	//get all tags from task text
	getAllTagsFromLineText(lineText: string) {
		// console.log("Line Text: ", lineText);
		// let tags = lineText.matchAll(REGEX.ALL_TAGS);

		// if (tags) {
		//     // Remove '#' from each tag
		//     tags = tags.map(tag => tag.replace('#', ''));
		// }
		const tags = [...lineText.matchAll(REGEX.ALL_TAGS)];
		let tagArray = tags.map(tag => tag[0].replace('#', ''));
		tagArray = tagArray.map(tag => tag.replace(/\//g, '-'));
		// tagArray.forEach(tag => console.log("#### get all tags", tag))

		return tagArray;
	}

	//get checkbox status
	isTaskCheckboxChecked(lineText: string) {
		return (REGEX.TASK_CHECKBOX_CHECKED.test(lineText));
	}

	//task content compare
	isTitleChanged(lineTask: ITask, TickTickTask: ITask) {
		//TODO: This is ugly, but I'm tired of chasing it. There's still a place where
		//      we're adding the OBSUrl to the tile when we don't need to. Everything else
		//      works, so just kludge it for now.

		const lineTaskTitle = this.stripOBSUrl(lineTask.title);
		const TickTickTaskTitle = this.stripOBSUrl(TickTickTask.title);
		//Whether content is modified?
		const contentModified = (lineTaskTitle.trim() === TickTickTaskTitle.trim());
		return (!contentModified);
	}

	//tag compare
	isTagsChanged(lineTask: ITask, TickTickTask: ITask) {
		const lineTaskTags = lineTask.tags ? lineTask.tags : [];
		const TickTickTaskTags = TickTickTask.tags ? TickTickTask.tags : [];
		if (!lineTaskTags && !TickTickTaskTags) {
			return false; //no tags.
		} else if ((lineTaskTags && !TickTickTaskTags) || (!lineTaskTags && TickTickTaskTags)) {
			return true; //tasks added or deleted.
		}
		//Whether content is modified?
		let areTagsSame = lineTaskTags.length === TickTickTaskTags.length
									&& lineTaskTags.sort().every((val, index) =>
										val === TickTickTaskTags.sort()[index]);
		return !(areTagsSame);
	}

	//task status compare
	isStatusChanged(lineTask: Object, TickTickTask: Object) {
		//Whether status is modified?
		const statusModified = (lineTask.status === TickTickTask.status);
		//console.log(lineTask)
		//console.log(TickTickTask)
		return (!statusModified);
	}

	isParentIdChanged(lineTask: ITask, TickTickTask: ITask): boolean {
		let lineParentId = lineTask.parentId ? lineTask.parentId : '';
		let cacheParentId = TickTickTask.parentId ? TickTickTask.parentId : '';

		return (lineParentId != cacheParentId);
	}

	//task due date compare
	isDueDateChanged(lineTask: ITask, TickTickTask: ITask): boolean {
		const lineTaskDue = lineTask.dueDate;
		const TickTickTaskDue = TickTickTask.dueDate ?? '';
		if (lineTaskDue === '' && TickTickTaskDue === '') {
			//console.log('No due date')
			return false;
		}

		if ((lineTaskDue || TickTickTaskDue) === '') {
			//console.log('due date has changed')
			return true;
		}

		if (lineTaskDue === TickTickTaskDue) {
			//console.log('due date consistent')
			return false;
		} else if (lineTaskDue.toString() === 'Invalid Date' && TickTickTaskDue.toString() === 'Invalid Date') {
			// console.log('invalid date')
			return false;
		} else {
			const date1 = this.cleanDate(lineTaskDue);
			const date2 = this.cleanDate(TickTickTaskDue);
			const date1TZ = date1.getTimezoneOffset();
			const date2TZ = date2.getTimezoneOffset();
			const diff = (date1.getTime() - date2.getTime()) / 3600000;

			const utcDate1 = date1;
			const utcDate2 = date2;

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
					} else if (minutes > 0) {
						console.log(`The timestamps are ${minutes} minutes apart.`);
					} else {
						console.log(`The timestamps are different, but not calculatable..`);
					}
				}
				return true;
			}
		}
	}

	//task project id compare
	isProjectIdChanged(lineTask: ITask, TickTickTask: ITask) {
		//project whether to modify
		// if (!(lineTask.projectId === TickTickTask.projectId)) {
		// 	console.log("line: ", lineTask.projectId, "saved; ", TickTickTask.projectId)
		// }
		return !(lineTask.projectId === TickTickTask.projectId);
	}

	//Determine whether the task is indented
	isIndentedTask(text: string) {
		return (REGEX.TASK_INDENTATION.test(text));
	}

	//console.log(getTabIndentation(" - [x] This is a task without tabs")); // 0
	getTabIndentation(lineText: string) {
		const match = REGEX.TAB_INDENTATION.exec(lineText);
		return match ? match[1].length : 0;
	}

	getTabs(lineText: string) {
		const numTabs = this.getTabIndentation(lineText);
		let tabs = '';
		for (let i = 0; i < numTabs; i++) {
			tabs = tabs + '\t';
		}
		return tabs;
	}

	// Task priority from 0 (none) to 4 (urgent).
	getTaskPriority(lineText: string) {
		let priority = '0';
		const priorityMatch = lineText.match(REGEX.priorityRegex);
		if (priorityMatch !== null) {
			priority = this.parsePriority(priorityMatch[1]);
		}

		return priority;
	}


	//Determine the number of tab characters
	//console.log(getTabIndentation("\t\t- [x] This is a task with two tabs")); // 2

	//remove task indentation
	removeTaskIndentation(text) {
		const regex = /^([ \t]*)?- \[(x| )\] /;
		return text.replace(regex, '- [$2] ');
	}

	//Judge whether line is a blank line
	isLineBlank(lineText: string) {
		return (REGEX.BLANK_LINE.test(lineText));
	}

	//Format date to TickTick Accepted date.
	formatDateToISO(dateTime: Date) {
		// Check if the input is a valid date
		if (isNaN(dateTime.getTime())) {
			return 'Invalid Date';
		}
		const tzoffset = dateTime.getTimezoneOffset();
		const convertedDate = new Date(dateTime.getTime());
		const result = convertedDate.toISOString().replace(/Z$/, '+0000');
		return result;
	}

	isMarkdownTask(str: string): boolean {
		const forRealRegex = taskRegex;
		return forRealRegex.test(str);
	}

	addTickTickTag(str: string): string {
		//TODO: assumption that there is at least one space before. validate.
		if (str.charAt(str.length - 1) === ' ')
		{
			str = (str + `${keywords.TickTick_TAG}`);
		} else {
			str = (str + ` ${keywords.TickTick_TAG} `);
		}

		return  str;
	}

	getObsidianUrlFromFilepath(filepath: string) {
		// if (this.plugin.settings.debugMode) {
		// 	console.log("Getting OBS path for: ", filepath)
		// }
		const url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`);
		const obsidianUrl = `[${filepath}](${url})`;
		return (obsidianUrl);
	}

	addTickTickLink(linetext: string, taskId: string, projecId: string): string {

		let url = this.createURL(taskId, projecId);
		const regex = new RegExp(`${keywords.TickTick_TAG}`, 'gi');
		const link = ` [link](${url})`;
		return linetext.replace(regex, link + ' ' + '$&');
	}

	//Check whether TickTick link is included
	hasTickTickLink(lineText: string) {
		return (REGEX.TickTick_LINK.test(lineText));
	}

	//ticktick specific url
	createURL(newTaskId: string, projectId: string): string {
		let url = '';
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

	taskFromLine(line: string)  {
		let matches = taskRegex.exec(line);
		if (!matches) {
			return null;
		}
		let status = matches[3] || "";
		let description = matches[4] || "";
		let indent = matches[1] ? matches[1].length : 0;
		let completed = status === "x";

		return {
			line,
			status,
			description,
			indent,
			completed
		};
	}
	cleanDate(dateString: string) {

		if (dateString.includes('+-')) {
			dateString = dateString.replace('+-', '-');

			let regex = /(.*)([+-])(\d*)/;
			const matchTime = dateString.match(regex);
			if (matchTime[3].length < 4) {
				dateString = matchTime[1] + '-0' + matchTime[3];
			}
		}
		const cleanedDate = new Date(dateString);
		return cleanedDate;
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

	private addItems(resultLine: string, items: any[]): string {
		//TODO count indentations?
		items.forEach(item => {
			let completion = item.status > 0 ? '- [x]' : '- [ ]';
			// When Full Vault Sync is enabled, we can tell the difference between items and subtasks
			// everything is a subtask
			// TODO: in the fullness of time, see if there's a way to differentiate.
			if (!this.plugin.settings.enableFullVaultSync) {
				resultLine = `${resultLine} \n${completion} ${item.title} %%${item.id}%%`;
			} else {
				resultLine = `${resultLine} \n${completion} ${item.title}`;
			}
		});
		return resultLine;
	}

	//TODO: This is redundant with taskFromLine. And the status is sus.
	// But I don't want to make too many changes right now
	private getItemFromLine(itemLine: string) {

		const matches = REGEX.ITEM_LINE.exec(itemLine);
		let item = {};
		if (matches) {

			const status = matches[1];
			const text = matches[2];
			const id = matches[3];

			const itemStatus = ' ' ? 0 : 2;

			item = {
				id: id, title: text, status: itemStatus
			};
		}
		return item;

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
	addCompletionDate(line: string, completedTime: string|undefined): string {
		if (completedTime) {
			const completionTime = this.utcToLocal(completedTime, true)
			line = line + ` ${keywords.TASK_COMPLETE} ` + completionTime;
			return line
		} else {
			return line;
		}
	}

	private addDueDateToLine(resultLine: string, task: ITask) {
		const dueDate = this.utcToLocal(task.dueDate, task.isAllDay);
		resultLine = resultLine + ` ${keywords.TASK_DUE_DATE} ` + dueDate;
		return resultLine;
	}


	//Note to future me: I wanted to get all the known tags in Obsidian to something clever
	//                   with tag management.
	getAllTags() {
		// 	const tags = Object.keys(this.app.metadataCache.getTags())
		// 	tags.forEach(tag => console.log(tag))
		// 	// foo.forEach(tag => console.log(tag));
	}

}
