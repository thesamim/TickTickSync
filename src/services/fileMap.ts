import { App, TFile } from 'obsidian';
import type { ITask } from '@/api/types/Task';
import type TickTickSync from '@/main';
import { getSettings } from '@/settings';
import log from 'loglevel';

//logging


export interface ITaskRecord {
	ID?: string;
	task: string;
	taskLines: string[];
	parentId?: string;
}

export interface ITaskItemRecord {
	ID?: string;
	parentId?: string;
}

interface IChildMap {
	[parent: string]: IChildren;
}

interface IChildren {
	depth: number;
	tabs: string;
	children: string[];
}

/**
 * Utility function to extract text between brackets [ ]
 */
export function getTitle(text: string): string {
	if (text) {
		const regex = /\](.*?)\[/;
		let match = text.match(regex);
		if (!match) {
			const itemRegex = /\](.*?)%%/;
			match = text.match(itemRegex);
			if (match) {
				match[1] = '--' + match;
			}
		}
		return match ? match[1] : 'N/A';
	} else {
		return 'invalid text';
	}
}

export class FileMap {
	file: TFile;
	private app: App;
	private plugin: TickTickSync;
	//In the fullness of time, want to keep track of headings.
	private headings: { heading: string; startLine: number; endLine: number; }[] | undefined;
	private fileLines: string[] = [];

	constructor(app: App, plugin: TickTickSync, file: TFile) {
		this.app = app;
		this.plugin = plugin;
		this.file = file;
	}


	addTask(task: ITask, taskLine: string, addLineNumber: number = -1): number {
		// log.debug("Adding task line: " + getTitle(taskLine), "addLineNumber: " + addLineNumber);
		let insertLine = this.fileLines.length;
		if (addLineNumber >= 0) {
			insertLine = addLineNumber;
		} else {
			if (task.parentId) {
				insertLine = this.getTaskEndLineByTaskID(task.parentId) + 1;
			} else {
				insertLine = this.fileLines.length;
			}
		}
		let taskLines = taskLine.split('\n');

		this.fileLines.splice(insertLine, 0, ...taskLines);
		return insertLine;
	}

	updateTask(task: ITask, taskLine: string, bParentUpdate = false) {
		let taskIdx = this.getTaskIndex(task.id);
		let taskLastLine = 0;
		let linesToDelete = 0;
		if (taskIdx >= 0) {
			taskLastLine = this.getTaskEndLineByTaskID(task.id);
			linesToDelete = taskLastLine - taskIdx + 1;
		} else {
			//possibly an edge case.... Just update to the top.
			taskIdx = 0;
		}
		let moveMap: IChildMap = {};
		if (task.childIds && task.childIds.length > 0) {
			//before we shift things around, get the children recursively
			moveMap = this.buildMoveMap(task.id, task.childIds, moveMap);
		}
		const arTaskLines = taskLine.split('\n');
		this.fileLines.splice(taskIdx, linesToDelete, ...arTaskLines);

		if (bParentUpdate) {
			let newPositionIdx = 0;
			if (task.parentId) {
				//let addtask find the parent....
				newPositionIdx = this.getTaskIndex(task.parentId);
			} else {
				newPositionIdx = taskIdx; //leave it where it is.
			}

			if (taskIdx != newPositionIdx) {
				this.moveTask(taskIdx, newPositionIdx);
			}

			if (task.childIds && task.childIds.length > 0) {
				//fix up the children because if their parentage did not change we're not going to get an updated for them
				//get the new tabs for the parent after the move.
				moveMap[task.id].tabs = this.plugin.taskParser.getTabs(taskLine);
				this.fixUpChildren(moveMap);
			}
		}
	}

	deleteTask(id: string, bKillTheChildren: boolean = false): number {
		//at some point I was convinced there would be a use case killing a task and ALL it's children.
		//I haven't found that use case again, but am leaving the code in here.
		if (!bKillTheChildren) {
			this.deleteTaskAndLines(id);
		} else {
			//TODO: There are no actual usages of this. Do we even need it anymore
			let moveMap: IChildMap = {};
			const parentTabs = this.plugin.taskParser.getTabs(this.fileLines[id]);
			const childIds = this.findChildren(this.getTaskIndex(id), parentTabs);
			moveMap = this.buildMoveMap(id, childIds, moveMap);
			const sortedEntries = Object.entries(moveMap).sort(
				([, a], [, b]) => a.depth - b.depth
			);

			// For easy debugging
			// log.debug('Sorted entries by depth:');
			// sortedEntries.forEach(([id, data]) => {
			// 	log.debug(`${id}: depth=${data.depth}, tabs=${data.tabs.length}, children=${data.children.join(',')}`);
			// });


			let currentTabs = '';
			sortedEntries.forEach(([id, data]) => {
				// log.debug(`${id}: depth=${data.depth} \n\t tabs=${data.tabs.length} \n\t children=${data.children.join(', ')}`);
				this.deleteTaskAndLines(id);
			});

		}
	}

	getFileLines(): string {
		return this.fileLines.join('\n');
	}

	getTaskRecord(id: string): ITaskRecord {
		return this.getTaskLines(id);
	}

	getNumParentTabs(parentId: string) {
		return this.plugin.taskParser.getNumTabs(this.fileLines[this.getTaskIndex(parentId)]);
	}

	getTaskItems(parentId: string | undefined) {
		const parentIdx = this.getTaskIndex(parentId);
		const taskItems: string[] = [];
		for (let i = parentIdx + 1; i < this.fileLines.length; i++) {
			const fileLine = this.fileLines[i];
			if (this.plugin.taskParser.isMarkdownTask(fileLine)) {
				if (this.plugin.taskParser.getTickTickId(fileLine)) {
					//we're on the next task down. Bail.
					break;
				} else if (this.plugin.taskParser.getLineItemId(fileLine)) {
					taskItems.push(fileLine);
				}
			}
		}
		// log.debug(`Found ${taskItems}`);
		return taskItems;
	}

	getFilePath() {
		return this.file.path;
	}

	//this relies on the caller passing a proper ID. It could be a task ID or a Item ID, we don't discriminate.
	getTaskIndex(ID: string): number {
		return this.fileLines.findIndex(str => this.plugin.taskParser.isMarkdownTask(str) && str.includes(ID));
	}

	getTaskString(taskId: string): String {
		return this.fileLines[this.getTaskIndex(taskId)];
	}

	async init(inFileContent: string | null = null) {
		let fileContent;
		if (!!inFileContent) {
			fileContent = inFileContent;
		} else {
			fileContent = await this.app.vault.read(this.file);
		}
		if (fileContent) {
			this.fileLines = fileContent.split('\n');
		}
	}

	getTaskItemRecord(lineItemId: string) {
		const taskItemRecord: ITaskItemRecord = {};
		//one item per line!
		const itemLine = this.fileLines[this.getTaskIndex(lineItemId)];
		taskItemRecord.parentId = this.getParentId(lineItemId);
		taskItemRecord.ID = this.plugin.taskParser.getLineItemId(itemLine);
		return taskItemRecord;
	}

	getTaskItemRecordByLine(lineNumber: number) {
		const taskItemRecord: ITaskItemRecord = {};
		const itemLine = this.fileLines[lineNumber];
		const parentId = this.getParentIDByIdx(lineNumber);
		taskItemRecord.ID = this.plugin.taskParser.getLineItemId(itemLine);
		taskItemRecord.parentId = parentId;

		return taskItemRecord;
	}

	async getTaskRecordByLine(lineNumber: number) {
		let taskRecord: ITaskRecord = {} as ITaskRecord;
		const parentId = this.getParentIDByIdx(lineNumber);
		taskRecord = this.getTaskLinesByIdx(lineNumber, taskRecord);
		taskRecord.parentId = parentId;
		//TODO: Why did I think this was necessary?
		//we're adding a task. The task notes, if any are going to be added
		//back in when we do the inevitable update. Get rid of the original
		//note lines here.
		if (taskRecord.taskLines && taskRecord.taskLines.length > 0) {
			this.fileLines.splice(lineNumber + 1, taskRecord.taskLines.length - 1);
			//rewrite the file to gett rid of them
			const newContent = this.fileLines.join('\n');
			await this.app.vault.modify(this.file, newContent);
		}

		return taskRecord;
	}

	/**
	 * Mark all tasks as TickTick Tasks
	 * called only when enableFullVaultSync is true.
	 */
	markAllTasks() {
		let modified = false;
		const lines = this.fileLines;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!this.plugin.taskParser?.isMarkdownTask(line)) {
				continue;
			}
			// if content is empty
			if (this.plugin.taskParser?.getTaskContentFromLineText(line) == '') {
				continue;
			}
			// Skip note checklist lines: two-space-indented markdown checklists at task depth
			const isTwoSpaceChecklist = /^\s{2}- \[(x|X| )\]/.test(line);
			const hasItemId = !!this.plugin.taskParser?.getLineItemId(line);
			const hasTickId = !!this.plugin.taskParser?.hasTickTickId(line);
			const hasTag = !!this.plugin.taskParser?.hasTickTickTag(line);
			if (!hasTickId && !hasTag && !hasItemId && !isTwoSpaceChecklist) {
				let newLine = this.plugin.taskParser?.addTickTickTag(line);
				lines[i] = newLine;
				modified = true;
			}
		}
		return modified;
	}

	modifyTask(text: string, line: number) {
		this.fileLines[line] = text;
	}

	private fixChildTabs(childID: string, parentIdx: number) {
		let newParentTabs = this.plugin.taskParser.getTabs(this.fileLines[parentIdx]);
		newParentTabs += '\t';
		return this.fixTabs(childID, newParentTabs);
	}

	private deleteTaskAndLines(id: string) {
		const taskIdx = this.getTaskIndex(id);
		const linesToDelete = this.getTaskEndLineByTaskID(id) - taskIdx + 1;
		this.fileLines.splice(taskIdx, linesToDelete);
	}

	private getTaskEndLineByTaskID(taskId: string) {
		const parentIdx = this.getTaskIndex(taskId);
		return this.getTaskEndLineByIdx(parentIdx);
	}

	private getTaskEndLineByIdx(taskIdx: number) {
		const taskTabs = this.plugin.taskParser.getTabs(this.fileLines[taskIdx]);
		const numTaskTabs = taskTabs.length;
		const notePrefix = taskTabs + '  ';
		for (let i = taskIdx + 1; i < this.fileLines.length; i++) {
			const line = this.fileLines[i];
			const numLineTabs = this.plugin.taskParser.getNumTabs(line);
			//We found the next Task. or something less indented.
			if ((this.plugin.taskParser.isMarkdownTask(line)
					&& this.plugin.taskParser.hasTickTickId(line))
				|| ( numLineTabs < numTaskTabs )) {
				//return the previous line.
				return i - 1;
			}
			//are we still in the same task?
			if ((this.plugin.taskParser.isMarkdownTask(line) && this.plugin.taskParser.getLineItemId(line))
				|| line.startsWith(notePrefix)) {
				continue;
			}
			if ((numLineTabs < numTaskTabs) || (!line.startsWith(notePrefix))) {
				return i - 1;
			}

		}
		return this.fileLines.length - 1;
	}

	//returns Task lines (Task + notes/description with delimiters.)
	private getTaskLines(id: string) {
		let taskRecord: ITaskRecord = {} as ITaskRecord;
		const taskIdx = this.getTaskIndex(id);
		taskRecord = this.getTaskLinesByIdx(taskIdx, taskRecord);
		return taskRecord;
	}

private getTaskLinesByIdx(taskIdx: number, taskRecord: ITaskRecord) {
		const taskLines: string[] = [];
		const taskLine = this.fileLines[taskIdx];
		const taskTabs = this.plugin.taskParser.getTabs(taskLine);
		const numTabs = taskTabs.length;
		const notePrefix = taskTabs + '  ';
		taskRecord.parentId = this.getParentIDByIdx(taskIdx);
		taskRecord.task = taskLine;

		// Determine configured delimiter
		const cfgDelim = getSettings().noteDelimiter as unknown;
		const hasConfiguredDelimiter = (typeof cfgDelim === 'string') && (cfgDelim.length > 0);

		// Helper to detect if a line is a delimiter line under a given text value
		const isDelimiterLine = (line: string, delimText: string) => {
			return line.startsWith(notePrefix) && !this.plugin.taskParser.isMarkdownTask(line) && line.trim() === (notePrefix + delimText).trim();
		};

		// Scan lines following the task to collect note block
		let i = taskIdx + 1;

		if (hasConfiguredDelimiter) {
			// Try to find an existing delimiter in the file (legacy or current). If found, normalize to cfgDelim
			let startIdx = -1;
			let existingDelim = '';
			if (i < this.fileLines.length) {
				const first = this.fileLines[i];
				if (first.startsWith(notePrefix) && !this.plugin.taskParser.isMarkdownTask(first)) {
					const candidate = first.slice(notePrefix.length).trim();
					if (candidate.length > 0) {
						startIdx = i;
						existingDelim = candidate;
					}
				}
			}
			if (startIdx !== -1) {
				// Find matching end delimiter with the same existingDelim text
				let endIdx = -1;
				for (let j = startIdx + 1; j < this.fileLines.length; j++) {
					const line = this.fileLines[j];
					if (!line.startsWith(notePrefix)) break; // indentation changed -> invalid block
					if (!this.plugin.taskParser.isMarkdownTask(line)) {
						const candidate = line.slice(notePrefix.length).trim();
						if (candidate === existingDelim) {
							endIdx = j;
							break;
						}
					}
				}
				if (endIdx !== -1) {
					for (let k = startIdx; k <= endIdx; k++) {
						if (k === startIdx || k === endIdx) {
							// normalize to current configured delimiter
							taskLines.push(notePrefix + (cfgDelim as string));
						} else {
							taskLines.push(this.fileLines[k]);
						}
					}
					// Done collecting
					// empty task lines better than none
					taskRecord.taskLines = taskLines;
					return taskRecord;
				}
			}
			// No existing delimiter in file -> synthesize start/end delimiter around no-delimiter notes
			const collected: string[] = [];
			for (; i < this.fileLines.length; i++) {
				const line = this.fileLines[i];
				const sameIndent = this.plugin.taskParser.getNumTabs(line) === numTabs;
				const isMdTask = this.plugin.taskParser.isMarkdownTask(line);
				const isNoteChecklist = isMdTask && !this.plugin.taskParser.getLineItemId(line) && !this.plugin.taskParser.hasTickTickId(line);
				if (sameIndent && line.startsWith(notePrefix) && (!isMdTask || isNoteChecklist)) {
					collected.push(line);
				} else {
					break;
				}
			}
			if (collected.length > 0) {
				// add synthesized delimiter lines
				taskLines.push(notePrefix + (cfgDelim as string));
				taskLines.push(...collected);
				taskLines.push(notePrefix + (cfgDelim as string));
			}
		} else {
			// No configured delimiter -> consecutive two-space-indented lines (at same tab depth) are part of the note
			for (; i < this.fileLines.length; i++) {
				const line = this.fileLines[i];
				const sameIndent = this.plugin.taskParser.getNumTabs(line) === numTabs;
				const isMdTask = this.plugin.taskParser.isMarkdownTask(line);
				const isNoteChecklist = isMdTask && !this.plugin.taskParser.getLineItemId(line) && !this.plugin.taskParser.hasTickTickId(line);
				if (sameIndent && line.startsWith(notePrefix) && (!isMdTask || isNoteChecklist)) {
					taskLines.push(line);
				} else {
					break;
				}
			}

			// If the first and last collected lines are identical non-empty strings at notePrefix,
			// treat them as legacy delimiter lines and keep them for now; TaskParser.getNoteString will strip them.
			if (taskLines.length >= 2) {
				const first = taskLines[0]?.slice(notePrefix.length).trim();
				const last = taskLines[taskLines.length - 1]?.slice(notePrefix.length).trim();
				if (first && last && first === last) {
					// leave as-is; downstream will remove when generating note text
				}
			}
		}

		// empty task lines better than no task lines.
		taskRecord.taskLines = taskLines;
		return taskRecord;
	}

	private getParentId(id: string) {
		const taskIdx = this.getTaskIndex(id);
		return this.getParentIDByIdx(taskIdx);
	}

	private getParentIDByIdx(taskIdx: number) {
		let childNumTabs: number = this.plugin.taskParser.getNumTabs(this.fileLines[taskIdx]);
		let tickTickId = '';
		for (let i = taskIdx - 1; i >= 0; i--) {
			const line = this.fileLines[i];
			//the first Task above this one with tabs less than this one. is the parent.
			if (this.plugin.taskParser.isMarkdownTask(line)) {
				const lineNumbTabs = this.plugin.taskParser.getNumTabs(this.fileLines[i]);
				const tempTickTickId = this.plugin.taskParser.getTickTickId(line);
				if (lineNumbTabs < childNumTabs) {
					//found the parent. If tempTickTickId is null, it's a task that has not been added yet.
					// We'll deal with it later.'
					tickTickId = tempTickTickId ? tempTickTickId : '';
					break;
				}
			}
		}
		return tickTickId;
	}

	/**
	 * @param task
	 */
	private fixUpChildren(moveMap: IChildMap) {
		const sortedEntries = Object.entries(moveMap).sort(
			([, a], [, b]) => a.depth - b.depth
		);

		let currentTabs = '';
		sortedEntries.forEach(([currentParent, data]) => {
			//skip the parent.
			if (data.depth == 0) {
				currentTabs = data.tabs;
			}
			const parentIdx = this.getTaskIndex(currentParent);
			currentTabs = currentTabs + '\t';
			data.children.forEach((childId) => {
				const childIdx = this.getTaskIndex(childId);
				const fixedLines = this.fixChildTabs(childId, parentIdx);
				this.fileLines.splice(childIdx, fixedLines.length, ...fixedLines);
				this.moveTask(childIdx, parentIdx);
			});
		});

	}

	private fixTabs(taskID: string, childTabs: string) {
		const start = this.getTaskIndex(taskID);
		const end = this.getTaskEndLineByTaskID(taskID) + 1;
		const taskLines = this.fileLines.slice(start, end);
		//The task, Notes and descriptions get the same number tabs. Items get the number of tabs + 1
		for (let i = 0; i < taskLines.length; i++) {
			let tabsToFix = childTabs;
			if (this.plugin.taskParser.isMarkdownTask(taskLines[i]) && i > 0) {
				tabsToFix = childTabs + '\t';
			}
			if (taskLines[i].startsWith('\t')) {
				taskLines[i] = taskLines[i].replace(/\t+/g, tabsToFix);
			} else {
				taskLines[i] = tabsToFix + taskLines[i];
			}
		}
		return taskLines;
	}

	private moveTask(oldIdx: number, newIdx: number) {
		const linesToDelete = this.getTaskEndLineByIdx(oldIdx) - oldIdx + 1;
		//After we delete the line, the parent may have moved. Rather than do a truck load of math, find it after the delete.
		const newPositionTaskID = this.plugin.taskParser.getTickTickId(this.fileLines[newIdx]);
		const linesToMove = this.fileLines.splice(oldIdx, linesToDelete);

		if (newPositionTaskID) {
			newIdx = this.getTaskEndLineByIdx(this.getTaskIndex(newPositionTaskID)) + 1;
		} else {
			//TODO: I think we only need this for debugging.
			//we're not moving below another task line. just move to where we were told.
		}
		this.fileLines.splice(newIdx, 0, ...linesToMove);
	}

	private findChildren(childIdx: number, parentTabs: string) {
		//we have a child if 1) the line starts with parentTabs + '\t' AND it's got a ticktick ID (we don't want items, they'll take care of themselves.
		const children: string[] = [];
		const tabsToLookFor = parentTabs.length + 1;
		for (let i = childIdx + 1; i < this.fileLines.length; i++) {
			const line = this.fileLines[i];
			const childID = this.plugin.taskParser.getTickTickId(line);
			const lineNumbTabs = this.plugin.taskParser.getNumTabs(line);
			if ((lineNumbTabs === tabsToLookFor) && this.plugin.taskParser.isMarkdownTask(line) && childID) {
				children.push(childID);
			}
		}
		return children;
	}

	private buildMoveMap(taskId: string, childIds: string[], moveMap: IChildMap, depth: number = 0) {
		const taskIdx = this.getTaskIndex(taskId);
		const tabs = this.plugin.taskParser.getTabs(this.fileLines[taskIdx]);
		const children = childIds;

		moveMap[taskId] = {
			tabs,
			children,
			depth
		};

		if (children && children.length > 0) {
			children.forEach((childId) => {
				const childIdx = this.getTaskIndex(childId);
				const parentTabs = this.plugin.taskParser.getTabs(this.fileLines[childIdx]);
				const childIds = this.findChildren(childIdx, parentTabs);
				this.buildMoveMap(childId, childIds, moveMap, depth + 1);
			});
		}


		return moveMap;
	}
}

