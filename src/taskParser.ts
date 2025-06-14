import type { App } from 'obsidian';
import type TickTickSync from '@/main';
import type { ITask, ITaskItem } from '@/api/types/Task';
import { getSettings } from '@/settings';
import { sha256 } from 'crypto-hash';
import type { FileMap, ITaskRecord } from '@/services/fileMap';
import log from 'loglevel';

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

const priorityEmojis = ['⏬', '🔽', '🔼', '⏫', '🔺'];
const prioritySymbols = {
	Highest: '🔺', High: '⏫', Medium: '🔼', Low: '🔽', Lowest: '⏬', None: ''
} as const;

enum Priority {
	Highest = '5', High = '5', Medium = '3', None = '0', Low = '1', Lowest = '0',
}

//From https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format
// - [ ] #task Has a created date ➕ 2023-04-13
// - [ ] #task Has a scheduled date ⏳ 2023-04-14
// - [ ] #task Has a start date 🛫 2023-04-15
// - [ ] #task Has a due date 📅 2023-04-16
// - [x] #task Has a done date ✅ 2023-04-17
// - [-] #task Has a cancelled date ❌ 2023-04-18

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
const due_date_regex = `(${keywords.DUE_DATE})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;
const due_date_strip_regex = `[${keywords.DUE_DATE}]\\s\\d{4}-\\d{2}-\\d{2}(\\s\\d{1,}:\\d{2}|)`;
const completion_date_regex = `(${keywords.TASK_COMPLETE})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;
const completion_date_strip_regex = `${keywords.TASK_COMPLETE}\\s\\d{4}-\\d{2}-\\d{2}(\\s*\\d{1,}:\\d{2}|)`;

/*
* Stolen from https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/Task/TaskRegularExpressions.ts
* used without permission.
* Will ask for forgiveness in the fullness of time.
*
* */
const status_regex = '^\\s*(-|\\*)\\s+\\[(x| )\\]\\s';

const indentationRegex = /^([\s\t>]*)/;

// Matches - * and + list markers, or numbered list markers (eg 1.)
const listMarkerRegex = /([-*+]|[0-9]+\.)/;

// Matches a checkbox and saves the status character inside
const checkboxRegex = /\[(.)\]/u;

// Matches the rest of the task after the checkbox.
const afterCheckboxRegex = / *(.*)/u;
const taskIDRegex = / %%(.*)%%/u;
const taskRegex = new RegExp(
	indentationRegex.source +
	listMarkerRegex.source +
	' +' +
	checkboxRegex.source +
	afterCheckboxRegex.source,
	'u'
);
/*End of stolen regex*/

export const REGEX = {
	//hopefully tighter find.
	TickTick_TAG: new RegExp(`^[\\s]*[-] \\[[x ]\\] [\\s\\S]*${keywords.TickTick_TAG}[\\s\\S]*$`, 'i'),

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
	LINE_ITEM_ID: /%%(?!\[ticktick_id::\s)[a-f0-9]{24}%%/g
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
	async convertTaskToLine(task: ITask, numTabs: number): Promise<string> {

		const tabs = '\t'.repeat(numTabs);
		let resultLine = tabs;

		task.title = this.stripOBSUrl(task.title);

		resultLine += `- [${task.status > 0 ? 'x' : ' '}] ${task.title}`;


		//add Tags
		if (task.tags) {
			resultLine = this.addTagsToLine(resultLine, task.tags);
		}
		resultLine = this.addTickTickTag(resultLine);

		resultLine = this.addTickTickLink(resultLine, task.id, task.projectId);
		resultLine = this.addTickTickId(resultLine, task.id);

		//add priority
		resultLine = this.addPriorityToLine(resultLine, task);

		//add dates
		resultLine = this.plugin.dateMan?.addDatesToLine(resultLine, task);


		if (getSettings().syncNotes) {
			if (this.plugin.taskParser.hasDescription(task)) {
				resultLine = this.addNote(resultLine, task.desc, numTabs, 'Description');
			}

			if (this.plugin.taskParser.hasNote(task)) {
				resultLine = this.addNote(resultLine, task.content, numTabs, 'Note');
			}
		}

		if (this.plugin.taskParser.hasItems(task)) {
			resultLine = this.addItems(resultLine, task.items, numTabs);
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

	//Remove Extraneous data from line.
	getTaskContentFromLineText(lineText: string) {
		let taskContent = lineText.replace(REGEX.TASK_CONTENT.REMOVE_INLINE_METADATA, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_TickTick_LINK, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_PRIORITY, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_TAGS, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX_WITH_INDENTATION, '')
			.replace(REGEX.TASK_CONTENT.REMOVE_SPACE, '');

		taskContent = this.stripOBSUrl(taskContent);
		taskContent = this.plugin.dateMan?.stripDatesFromLine(taskContent);
		return (taskContent);
	}

	stripLineItemId(lineText: string) {
		let line = lineText.replace(REGEX.LINE_ITEM_ID, '');
		return line;
	}

	addTagsToLine(resultLine: string, tags: ITask.tags) {
		//we're looking for the ticktick tag without the #
		const regEx = new RegExp(keywords.TickTick_TAG.substring(1), 'i');
		tags.forEach((tag: string) => {
			//TickTick tag, if present, will be added at the end.
			if (!tag.match(regEx)) {
				if (tag.includes('-')) {
					tag = tag.replace(/-/g, '/');
				}
				resultLine = resultLine + ' #' + tag;
			}
		});
		return resultLine;
	}

	//convert line text to a task object
	async convertLineToTask(lineText: string, lineNumber: number, filepath: string, fileMap: FileMap, inTaskRecord: ITaskRecord | null) {
		let hasParent = false;
		let parentId = null;
		let parentTaskObject = null;
		let taskItems = [];
		const lineTextTabIndentation = this.getNumTabs(lineText);
		let textWithoutIndentation = this.removeTaskIndentation(lineText);

		const TickTick_id = this.getTickTickId(textWithoutIndentation);

		const allDatesStruct = this.plugin.dateMan?.parseDates(textWithoutIndentation);

		let taskRecord: ITaskRecord;

		if (inTaskRecord) {
			taskRecord = inTaskRecord;
		} else {
			if (TickTick_id) {
				taskRecord = fileMap.getTaskRecord(TickTick_id);
			} else {
				taskRecord = await fileMap.getTaskRecordByLine(lineNumber);
			}
		}
		let description = null;
		let content = null;
		if (taskRecord) {
			if (taskRecord.taskLines.length > 1) {
				const noteStruct = this.getNoteString(taskRecord);
				if (noteStruct.isNote) {
					content = noteStruct.textContent;
				} else {
					description = noteStruct.textContent;
				}
			}
		} else {
		}
		//Detect parentID
		if (lineTextTabIndentation > 0) {
			parentId = taskRecord.parentId;
			hasParent = true;
			// log.debug(`parent id is ${parentId}`)
			parentTaskObject = this.plugin.cacheOperation?.loadTaskFromCacheID(parentId);
		}

		//find task items
		const taskLineItems = fileMap.getTaskItems(TickTick_id);
		if (taskLineItems && taskLineItems.length > 0) {
			for (const taskLineItem in taskLineItems) {
				taskItems.push(this.getItemFromLine(taskLineItems[taskLineItem]));
			}
		}

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
		if ((getSettings().debugMode) && (!projectId)) {
			log.error('Converting line to Object, could not find project Id: ', title);
		}

		const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation);
		let taskURL = '';
		const priority = this.getTaskPriority(textWithoutIndentation);
		if (filepath) {
			let url = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath);
			if (url) {
				taskURL = url;
			}

		}

		let actualStartDate = allDatesStruct?.startDate ?
			allDatesStruct?.startDate.isoDate : //there's a start date
			allDatesStruct?.scheduled_date ?
				allDatesStruct?.scheduled_date.isoDate //there's a scheduled date
				: allDatesStruct?.dueDate ? //there are neither start date nor scheduled date.
					allDatesStruct?.dueDate.isoDate : '';  //use the due date if there is one.

    
		const task: ITask = {
			id: TickTick_id || '',
			projectId: projectId,
			//RSN We're going to have to figure putting it Items or in Description.
			title: title.trim() + ' ' + taskURL,
			//content: ??
			content: content ? content : '',
			desc: description ? description : '',
			items: taskItems || [],
			parentId: parentId || '',
			dueDate: allDatesStruct?.dueDate?.isoDate || '',
			startDate: actualStartDate || '',
			completedTime: allDatesStruct?.completedTime?.isoDate || '',
			isAllDay: allDatesStruct?.isAllDay || false,
			tags: tags || [],
			priority: Number(priority),
			modifiedTime: this.plugin.dateMan?.formatDateToISO(new Date()) || '',
			status: isCompleted ? 2 : 0, //Status: 0 is no completed. Anything else is completed.
			timeZone: timeZone,
			dateHolder: allDatesStruct //Assume that there's a dateStruct of some kind
		};

		return task;

	}

	getNoteString(taskRecord: ITaskRecord) {
		let textContent = "";
		if (taskRecord.taskLines) {
			let descriptionStrings = [...taskRecord.taskLines];
			//TODO if there's a notes preference need to account for it here.
			//     for now, we're getting rid of the first line and the last line.
			descriptionStrings.splice(0, 1);
			descriptionStrings.splice(descriptionStrings.length - 1, 1);
			descriptionStrings = descriptionStrings.map(line => line.replace(/^\t*\s{2}|^\s{2}/g, ''));
			textContent = descriptionStrings.length > 0 ? descriptionStrings.join('\n') : '';
		}
		return { isNote: taskRecord.isNote, textContent: textContent };
	}
	hasTickTickTag(text: string) {
		if (this.isMarkdownTask(text)) {
			// log.debug("hasTickTickTag", `${text}
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

	getLineItemId(text: string) {
		if (!text) {
			log.error('No Text passed to getLineItemId');
			return undefined;
		}
		let res = text.match(REGEX.LINE_ITEM_ID);
		let lineItemId;
		if (res) {
			lineItemId = res[0].slice(2, -2);
			// log.debug("\nResult: ", res);
		}
		return lineItemId;
	}

	isTickTickTask(text: string) {
		return this.hasTickTickId(text);
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

	//pretty sure this is surplus to requirements. Kill it next time.
	getProjectNameFromLineText(text: string) {
		const result = REGEX.PROJECT_NAME.exec(text);
		return result ? result[1] : null;
	}

	getTickTickId(text: string) {
		let result = REGEX.TickTick_ID_NUM.exec(text);
		if (!result) {
			//try the dataview version
			result = REGEX.TickTick_ID_DV_NUM.exec(text);
		}
		return result ? result[1] : undefined;
	}

	isTaskOpen(line: string) {
		let result = new RegExp(status_regex, 'gmi').exec(line);
		if (result) {
			return (result[2].search(/[xX]/) < 0);
		} else {
			throw new Error(`Status not found in line: ${line}`);
		}
	}


	//get all tags from task text
	getAllTagsFromLineText(lineText: string) {
		// log.debug("Line Text: ", lineText);
		// let tags = lineText.matchAll(REGEX.ALL_TAGS);

		// if (tags) {
		//     // Remove '#' from each tag
		//     tags = tags.map(tag => tag.replace('#', ''));
		// }
		const tags = [...lineText.matchAll(REGEX.ALL_TAGS)];
		let tagArray = tags.map(tag => tag[0].replace('#', ''));
		tagArray = tagArray.map(tag => tag.replace(/\//g, '-'));
		// tagArray.forEach(tag => log.debug("#### get all tags", tag))

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
		//log.debug(lineTask)
		//log.debug(TickTickTask)
		return (!statusModified);
	}

	isParentIdChanged(lineTask: ITask, TickTickTask: ITask): boolean {
		let lineParentId = lineTask.parentId ? lineTask.parentId : '';
		let cacheParentId = TickTickTask.parentId ? TickTickTask.parentId : '';
		return (lineParentId != cacheParentId);
	}

	isChildrenChanged(lineTask: ITask, TickTickTask: ITask): boolean {
		if (!lineTask.childIds && !TickTickTask.childIds) {
			return false;
		} else if (!lineTask.childIds && TickTickTask.childIds) {
			return true;
		} else if (lineTask.childIds && !TickTickTask.childIds) {
			return true;
		}

		return lineTask?.childIds.length != TickTickTask?.childIds.length;

	}


	//task project id compare
	isProjectIdChanged(lineTask: ITask, TickTickTask: ITask) {
		//project whether to modify
		// if (!(lineTask.projectId === TickTickTask.projectId)) {
		// 	log.debug("line: ", lineTask.projectId, "saved; ", TickTickTask.projectId)
		// }
		return !(lineTask.projectId === TickTickTask.projectId);
	}

	//Determine whether the task is indented
	isIndentedTask(text: string) {
		return (REGEX.TASK_INDENTATION.test(text));
	}

	//log.debug(getNumTabs(" - [x] This is a task without tabs")); // 0
	getNumTabs(lineText: string) {
		const match = REGEX.TAB_INDENTATION.exec(lineText);
		return match ? match[1].length : 0;
	}

	getTabs(lineText: string) {
		const numTabs = this.getNumTabs(lineText);
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
	//log.debug(getNumTabs("\t\t- [x] This is a task with two tabs")); // 2

	//remove task indentation
	removeTaskIndentation(text) {
		const regex = /^([ \t]*)?- \[(x| )\] /;
		return text.replace(regex, '- [$2] ');
	}

	//Judge whether line is a blank line
	isLineBlank(lineText: string) {
		return (REGEX.BLANK_LINE.test(lineText));
	}

	isMarkdownTask(str: string): boolean {
		if (str) {
			const forRealRegex = taskRegex;
			return forRealRegex.test(str);
		}
		return false;
	}

	addTickTickTag(str: string): string {
		//TODO: assumption that there is at least one space before. validate.
		if (str.charAt(str.length - 1) === ' ') {
			str = (str + `${keywords.TickTick_TAG}`);
		} else {
			str = (str + ` ${keywords.TickTick_TAG} `);
		}

		return str;
	}

	getObsidianUrlFromFilepath(filepath: string) {
		// if (getSettings().debugMode) {
		// log.debug("Getting OBS path for: ", filepath)
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
			url = `https://${getSettings().baseURL}/webapp/#p/${projectId}/tasks/${newTaskId}`;
		} else {
			url = `https://${getSettings().baseURL}/webapp/#q/all/tasks/${newTaskId}`;
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

	//Returns the Item WITHOUT task ID
	taskFromLine(line: string) {
		let matches = taskRegex.exec(line);
		if (!matches) {
			return null;
		}

		let checkBox = matches[3] || '';

		//Anything other than 'x' is a not done state. Deal with it accordingly.
		//https://publish.obsidian.md/tasks/Getting+Started/Statuses
		const status = checkBox == 'x';
		let description = matches[4] || '';
		description = description.replace(taskIDRegex, '');
		let indent = matches[1] ? matches[1].length : 0;

		return {
			line,
			status,
			description,
			indent
		};
	}

	//                   with tag management.
	getAllTags() {
		// 	const tags = Object.keys(this.app.metadataCache.getTags())
		// 	tags.forEach(tag => log.debug(tag))
		// 	// foo.forEach(tag => log.debug(tag));
	}

	async getLineHash(resultLine: string) {
		try {
			return await sha256(resultLine);
		} catch (e) {
			log.error('Hashing error.', e);
		}
	}

	hasNote(task: ITask) {
		return ((task.content) && (task.content.length > 0));
	}

	hasDescription(task: ITask) {
		return ((task.desc) && (task.desc.length > 0));
	}

	hasItems(task: ITask): boolean {
		return ((task.items) && (task.items.length > 0));
	}

	//Note to future me: I wanted to get all the known tags in Obsidian to something clever

	areNotesChanged(newNoteString: string, oldNoteString: string) {
		// Check if arrays have different lengths
		// log.debug(newNoteString, oldNoteString);
		if (newNoteString.length !== oldNoteString.length) {
			return true;  // strings are different, save some time.
		}
		const newNote = newNoteString.split('\n');
		const oldNote = oldNoteString.split('\n');
		// Check if elements are different
		for (let i = 0; i < newNote.length; i++) {
			if (newNote[i] !== oldNote[i]) {
				return true;  // Arrays are different
			}
		}

		return false;  // Arrays are exactly the same
	}

	areItemsChanged(newItems: ITaskItem[], oldItems: ITaskItem[]) {
		if (newItems?.length != oldItems?.length) {
			return true;
		}
		newItems.sort((a, b) => a.id.localeCompare(b.id));
		oldItems.sort((a, b) => a.id.localeCompare(b.id));

		for (let i = 0; i < newItems.length; i++) {
			if ((newItems[i].id !== newItems[i].id) ||
				(newItems[i].status !== newItems[i].status) ||
				(newItems[i].title !== newItems[i].title)) {
				return true;  // Arrays are different
			}
		}

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

	private addItems(resultLine: string, items: any[], numTabs: number): string {
		//TODO count indentations?
		items.forEach(item => {
			let completion = item.status > 0 ? '- [x]' : '- [ ]';
			// When Full Vault Sync is enabled, we can't tell the difference between items and subtasks
			// everything is a subtask
			// TODO: in the fullness of time, see if there's a way to differentiate.
			const tabs = '\t'.repeat(numTabs + 1);
			resultLine = `${resultLine} \n${tabs}${completion} ${item.title} `;
			resultLine = `${resultLine} %%${item.id}%%`;
		});
		// log("trace", resultLine)
		return resultLine;
	}

	private addNote(resultLine: string, content: string, numbTabs: number, type: string) {
		//TODO figure out Note presentation
		//admonitions just don't work in indented tasks. Until I sort out the presentation, keep it simple until I
		//get all the functionality sorted out,
		const prefix = '\n' + '\t'.repeat(numbTabs) + '  ';
		// resultLine = `${resultLine}${prefix}=== start ${type} ${this.getTickTickId(resultLine)}`;
		resultLine = `${resultLine}${prefix}-------------------------------------------------------------`;
		const noteLines = content.split('\n');
		noteLines.forEach(item => {
			resultLine = `${resultLine}${prefix}${item}`;
		});
		resultLine = `${resultLine}${prefix}-------------------------------------------------------------`;
		// resultLine = `${resultLine}${prefix}=== end ${type}  ${this.getTickTickId(resultLine)}`;
		return resultLine;
	}

	//Returns the Item with task ID and all. taskFromLine returns the description WITHOUT the ID.
	private getItemFromLine(itemLine: string) {

		const matches = REGEX.ITEM_LINE.exec(itemLine);
		let item: ITaskItem = {};
		if (matches) {

			const status = matches[1];
			const text = matches[2];
			const id = matches[3];

			const itemStatus = status ? 0 : 2;

			item = {
				id: id, title: text, status: itemStatus
			};
		}
		return item;

	}

	private addPriorityToLine(resultLine: string, task: ITask) {
		let priority = this.translateTickTickToObsidian(task.priority);
		if (priority != null) {
			// log.debug("task pri: ", task.priority, " emoji num: ", priority, priorityEmojis[priority])
			// log.debug("task pri: ", task.priority, " emoji num: ", priority)
			resultLine = `${resultLine} ${priority}`;
		}
		// else
		// {
		//     log.debug("task pri: ", task.priority, " undefined: ", priority)
		// }
		return resultLine;
	}


}
