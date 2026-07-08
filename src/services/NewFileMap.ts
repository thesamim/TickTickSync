import { App, type ListItemCache, TFile } from 'obsidian';
import type { ITask } from '@/api/types/Task';
import type TickTickSync from '@/main';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

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

interface IChildren {
	depth: number;
	tabs: string;
	children: string[];
}

interface IChildMap {
	[parent: string]: IChildren;
}

interface TaskEntry {
	id: string;
	lineIdx: number;
	contentEndLine: number;
	subtreeEndLine: number;
	tabs: number;
	parentId: string | null;
	childIds: string[];
}

export function getTitle(text: string): string {
	if (text) {
		const regex = /](.*?)\[/;
		let match = text.match(regex);
		if (!match) {
			const itemRegex = /](.*?)%%/;
			match = text.match(itemRegex);
			if (match) {
				match[1] = '--' + String(match);
			}
		}
		return match ? match[1] : 'N/A';
	} else {
		return 'invalid text';
	}
}

export class NewFileMap {
	file: TFile;
	private app: App;
	private plugin: TickTickSync;
	// only used for debugging
	// private headings: { heading: string; startLine: number; endLine: number; }[] | undefined;
	private fileLines: string[] = [];
	private entries: TaskEntry[] = [];

	constructor(app: App, plugin: TickTickSync, file: TFile) {
		this.app = app;
		this.plugin = plugin;
		this.file = file;
	}

	async init(inFileContent: string | null = null) {
		let fileContent;
		if (inFileContent) {
			fileContent = inFileContent;
		} else {
			fileContent = await this.plugin.fileOperation.readFileContent(this.file);
		}
		if (fileContent) {
			this.fileLines = fileContent.split('\n');
		}
		this.rebuildEntries();
	}

	addTask(task: ITask, taskLine: string, addLineNumber: number = -1): number {
		let insertLine: number ;
		if (addLineNumber >= 0) {
			insertLine = addLineNumber;
		} else {
			if (task.parentId) {
				const parentEntry = this.entries.find(e => e.id === task.parentId);
				if (parentEntry) {
					insertLine = parentEntry.subtreeEndLine + 1;
				} else {
					insertLine = this.fileLines.length;
				}
			} else {
				insertLine = this.fileLines.length;
			}
		}
		const taskLines = taskLine.split('\n');
		this.fileLines.splice(insertLine, 0, ...taskLines);
		this.rebuildEntries();
		return insertLine;
	}

	updateTask(task: ITask, taskLine: string, bParentUpdate = false) {
		this.rebuildEntries();
		const entry = this.entries.find(e => e.id === task.id);
		if (!entry) {
			log.warn(`updateTask: task ${task.id} not found in ${this.file.path}`);
			return;
		}

		const oldLineIdx = entry.lineIdx;
		const oldContentEndLine = entry.contentEndLine;
		const oldSubtreeEndLine = entry.subtreeEndLine;
		const oldTabs = entry.tabs;

		const linesToReplaceCount = oldContentEndLine - oldLineIdx + 1;
		const arTaskLines = taskLine.split('\n');
		this.fileLines.splice(oldLineIdx, linesToReplaceCount, ...arTaskLines);

		if (bParentUpdate) {
			const newTabs = this.plugin.taskParser.getNumTabs(this.fileLines[oldLineIdx]);

			let newPositionIdx: number;
			if (task.parentId) {
				const parentLineIdx = this.getTaskIndex(task.parentId);
				if (parentLineIdx >= 0) {
					newPositionIdx = this.getTaskEndLineByIdx(parentLineIdx) + 1;
				} else {
					newPositionIdx = this.fileLines.length;
				}
			} else {
				newPositionIdx = this.fileLines.length;
			}

			const childrenStart = oldLineIdx + arTaskLines.length;
			const childrenEnd = childrenStart + (oldSubtreeEndLine - oldContentEndLine) - 1;

			if (oldLineIdx !== newPositionIdx) {
				const linesInSubtree = (childrenEnd - oldLineIdx) + 1;
				const moveLines = this.fileLines.splice(oldLineIdx, linesInSubtree);

				const adjustedPos = oldLineIdx < newPositionIdx
					? newPositionIdx - linesInSubtree
					: newPositionIdx;
				this.fileLines.splice(adjustedPos, 0, ...moveLines);

				const movedTaskIdx = this.getTaskIndex(task.id);
				if (movedTaskIdx >= 0) {
					const movedEndIdx = this.getTaskEndLineByIdx(movedTaskIdx);
					if (movedTaskIdx < movedEndIdx) {
						this.applyTabDiff(movedTaskIdx + 1, movedEndIdx, newTabs - oldTabs);
					}
				}
			} else if (newTabs !== oldTabs && childrenStart <= childrenEnd) {
				this.applyTabDiff(childrenStart, childrenEnd, newTabs - oldTabs);
			}
		}
		this.rebuildEntries();
	}

	deleteTask(id: string, bKillTheChildren: boolean = false): number {
		if (!bKillTheChildren) {
			this.deleteTaskAndLines(id);
		} else {
			let moveMap: IChildMap = {};
			const parentIdx = this.getTaskIndex(id);
			const parentTabs = this.plugin.taskParser.getTabs(this.fileLines[parentIdx]);
			const childIds = this.findChildren(parentIdx, parentTabs);
			moveMap = this.buildMoveMap(id, childIds, moveMap);
			const sortedEntries = Object.entries(moveMap).sort(
				([, a], [, b]) => a.depth - b.depth
			);

		sortedEntries.forEach(([sid]) => {
			this.deleteTaskAndLines(sid);
		});
		}
		this.rebuildEntries();
		return this.entries.length;
	}

	deleteTasks(ids: string[]): string[] {
		const tasksWithIndices = ids.map(id => ({ id, index: this.getTaskIndex(id) }))
			.filter(t => t.index !== -1)
			.sort((a, b) => b.index - a.index);

		log.debug(`FileMap: Found ${tasksWithIndices.length} out of ${ids.length} tasks for deletion in file ${this.file.path}`);
		for (const t of tasksWithIndices) {
			this.deleteTaskAndLinesAtIndex(t.index, t.id);
		}
		this.rebuildEntries();
		return tasksWithIndices.map(t => t.id);
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
		if (!parentId) return [];
		const parentIdx = this.getTaskIndex(parentId);
		const parentTabs = this.plugin.taskParser.getNumTabs(this.fileLines[parentIdx]);
		const taskItems: string[] = [];
		for (let i = parentIdx + 1; i < this.fileLines.length; i++) {
			const fileLine = this.fileLines[i];
			if (this.plugin.taskParser.isMarkdownTask(fileLine)) {
				if (this.plugin.taskParser.getTickTickId(fileLine)) {
					break;
				} else if (this.plugin.taskParser.getLineItemId(fileLine) &&
					this.plugin.taskParser.isTaskItem(fileLine, parentTabs)) {
					taskItems.push(fileLine);
				}
			}
		}
		return taskItems;
	}

	getFilePath() {
		return this.file.path;
	}

	getTaskIndex(ID: string): number {
		return this.fileLines.findIndex(str => this.plugin.taskParser.isMarkdownTask(str) && str.includes(ID));
	}

	getTaskString(taskId: string): string {
		return this.fileLines[this.getTaskIndex(taskId)];
	}

	getTaskItemRecord(lineItemId: string) {
		const taskItemRecord: ITaskItemRecord = {};
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
		return taskRecord;
	}

	markAllTasks() {
		let modified = false;
		const lines = this.fileLines;
		let parentTabs = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!this.plugin.taskParser?.isMarkdownTask(line)) {
				continue;
			}
			if (this.plugin.taskParser?.getTaskContentFromLineText(line) == '') {
				continue;
			}
			if (this.plugin.taskParser?.hasTickTickId(line)) {
				parentTabs = this.plugin.taskParser.getNumTabs(line);
				continue;
			}
			if (this.plugin.taskParser.isNoteLevel(line, parentTabs)) {
				continue;
			}
			const isTwoSpaceChecklist = /^\s{2}- \[([xX ])]/.test(line);
			const hasItemId = !!this.plugin.taskParser?.getLineItemId(line);
			const hasTickId = this.plugin.taskParser?.hasTickTickId(line);
			const hasTag = this.plugin.taskParser?.hasTickTickTag(line);
			if (!hasTickId && !hasTag && !hasItemId && !isTwoSpaceChecklist) {
				lines[i] = this.plugin.taskParser?.addTickTickTag(line);
				modified = true;
			}
		}
		this.rebuildEntries();
		return modified;
	}

	modifyTask(text: string, line: number) {
		this.fileLines[line] = text;
		this.rebuildEntries();
	}

	replaceLines(line: number, count: number, newText: string) {
		const newLines = newText.split('\n');
		this.fileLines.splice(line, count, ...newLines);
		this.rebuildEntries();
	}

	hasTasks(fullVaultSync: boolean) {
		return this.fileLines.some(line => this.plugin.taskParser.isMarkdownTask(line) && (fullVaultSync || this.plugin.taskParser.hasTickTickId(line)));
	}

	getParentId(id: string) {
		const taskIdx = this.getTaskIndex(id);
		return this.getParentIDByIdx(taskIdx);
	}

	getTasks(): string[] {
		return this.entries.map(e => e.id);
	}

	private rebuildEntries() {
		this.entries = [];
		const lineEntries: TaskEntry[] = [];

		const fileCache = this.app.metadataCache.getFileCache(this.file);
		const itemByLine = new Map<number, ListItemCache>();
		if (fileCache?.listItems) {
			for (const item of fileCache.listItems) {
				itemByLine.set(item.position.start.line, item);
			}
		}

		for (let i = 0; i < this.fileLines.length; i++) {
			const line = this.fileLines[i];
			if (this.plugin.taskParser.isMarkdownTask(line)) {
				const id = this.plugin.taskParser.getTickTickId(line);
				if (id) {
					const tabs = this.plugin.taskParser.getNumTabs(line);
					lineEntries.push({
						id,
						lineIdx: i,
						tabs,
						parentId: null,
						childIds: [],
						contentEndLine: i,
						subtreeEndLine: i,
					});
				}
			}
		}

		for (let i = 0; i < lineEntries.length; i++) {
			const entry = lineEntries[i];
			const item = itemByLine.get(entry.lineIdx);

			if (item) {
				const nextLineIdx = i + 1 < lineEntries.length ? lineEntries[i + 1].lineIdx : this.fileLines.length;
				entry.contentEndLine = Math.min(item.position.end.line, nextLineIdx - 1);

				if (item.parent >= 0) {
					const parentEntry = lineEntries.find(e => e.lineIdx === item.parent);
					if (parentEntry) {
						entry.parentId = parentEntry.id;
					}
				}
			} else {
				entry.contentEndLine = this.computeContentEndLine(entry.lineIdx);
			}

			if (!entry.parentId) {
				entry.parentId = this.computeParentId(entry.lineIdx, entry.tabs);
			}

			// ensure items/notes past the metadata cache end are included
			entry.contentEndLine = Math.max(entry.contentEndLine, this.computeContentEndLine(entry.lineIdx));
		}

		for (let i = 0; i < lineEntries.length; i++) {
			const entry = lineEntries[i];
			let end = this.fileLines.length - 1;
			for (let j = i + 1; j < lineEntries.length; j++) {
				if (lineEntries[j].tabs <= entry.tabs) {
					end = lineEntries[j].lineIdx - 1;
					break;
				}
			}
			entry.subtreeEndLine = end;
		}

		for (const entry of lineEntries) {
			if (entry.parentId) {
				const parent = lineEntries.find(e => e.id === entry.parentId);
				if (parent) {
					parent.childIds.push(entry.id);
				}
			}
		}

		this.entries = lineEntries;
	}

	private computeContentEndLine(taskIdx: number): number {
		const taskTabs = this.plugin.taskParser.getTabs(this.fileLines[taskIdx]);
		const numTaskTabs = taskTabs.length;
		const notePrefix = taskTabs + '  ';
		for (let i = taskIdx + 1; i < this.fileLines.length; i++) {
			const line = this.fileLines[i];
			const numLineTabs = this.plugin.taskParser.getNumTabs(line);
			if ((this.plugin.taskParser.isMarkdownTask(line)
					&& this.plugin.taskParser.hasTickTickId(line))
				|| (numLineTabs < numTaskTabs)) {
				return i - 1;
			}
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

	private computeParentId(taskIdx: number, taskTabs: number): string | null {
		for (let i = taskIdx - 1; i >= 0; i--) {
			const line = this.fileLines[i];
			if (this.plugin.taskParser.isMarkdownTask(line) && this.plugin.taskParser.hasTickTickId(line)) {
				const lineNumTabs = this.plugin.taskParser.getNumTabs(line);
				if (lineNumTabs < taskTabs) {
					const pid = this.plugin.taskParser.getTickTickId(line);
					return pid ? pid : null;
				}
			}
		}
		return null;
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
			if ((this.plugin.taskParser.isMarkdownTask(line)
					&& this.plugin.taskParser.hasTickTickId(line))
				|| (numLineTabs < numTaskTabs)) {
				return i - 1;
			}
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

		const cfgDelim = getSettings().noteDelimiter as unknown;
		const hasConfiguredDelimiter = (typeof cfgDelim === 'string') && (cfgDelim.length > 0);

		let i = taskIdx + 1;

		if (hasConfiguredDelimiter) {
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
				let endIdx = -1;
				for (let j = startIdx + 1; j < this.fileLines.length; j++) {
					const line = this.fileLines[j];
					if (!line.startsWith(notePrefix)) break;
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
							taskLines.push(notePrefix + cfgDelim);
						} else {
							taskLines.push(this.fileLines[k]);
						}
					}
					taskRecord.taskLines = taskLines;
					return taskRecord;
				}
			}
			const collected: string[] = [];
			for (; i < this.fileLines.length; i++) {
				const line = this.fileLines[i];
				const sameIndent = this.plugin.taskParser.getNumTabs(line) === numTabs;
				if (sameIndent && line.startsWith(notePrefix)) {
					collected.push(line);
				} else {
					break;
				}
			}
			if (collected.length > 0) {
				taskLines.push(notePrefix + cfgDelim);
				taskLines.push(...collected);
				taskLines.push(notePrefix + cfgDelim);
			}
		} else {
			for (; i < this.fileLines.length; i++) {
				const line = this.fileLines[i];
				const sameIndent = this.plugin.taskParser.getNumTabs(line) === numTabs;
				if (sameIndent && line.startsWith(notePrefix)) {
					taskLines.push(line);
				} else {
					break;
				}
			}

			if (taskLines.length >= 2) {
				const first = taskLines[0]?.slice(notePrefix.length).trim();
				const last = taskLines[taskLines.length - 1]?.slice(notePrefix.length).trim();
				if (first && last && first === last) {
					// Delimiter lines match - silently continue
				}
			}
		}

		taskRecord.taskLines = taskLines;
		return taskRecord;
	}

	private getParentIDByIdx(taskIdx: number) {
		let childNumTabs: number = this.plugin.taskParser.getNumTabs(this.fileLines[taskIdx]);
		let tickTickId = '';
		for (let i = taskIdx - 1; i >= 0; i--) {
			const line = this.fileLines[i];
			if (this.plugin.taskParser.isMarkdownTask(line) && this.plugin.taskParser.hasTickTickId(line)) {
				const lineNumbTabs = this.plugin.taskParser.getNumTabs(this.fileLines[i]);
				const tempTickTickId = this.plugin.taskParser.getTickTickId(line);
				if (lineNumbTabs < childNumTabs) {
					tickTickId = tempTickTickId ? tempTickTickId : '';
					break;
				}
			}
		}
		return tickTickId;
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

	private deleteTaskAndLinesAtIndex(taskIdx: number, id: string) {
		const endLine = this.getTaskEndLineByIdx(taskIdx);
		const linesToDelete = endLine - taskIdx + 1;
		log.debug(`FileMap: Deleting ${linesToDelete} lines at index ${taskIdx} for task ${id} in ${this.file.path}`);
		this.fileLines.splice(taskIdx, linesToDelete);
	}

	private findChildren(childIdx: number, parentTabs: string) {
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

	private fixUpChildren(moveMap: IChildMap) {
		const sortedEntries = Object.entries(moveMap).sort(
			([, a], [, b]) => a.depth - b.depth
		);

		let currentTabs = '';
		sortedEntries.forEach(([currentParent, data]) => {
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
		const newPositionTaskID = this.plugin.taskParser.getTickTickId(this.fileLines[newIdx]);
		const linesToMove = this.fileLines.splice(oldIdx, linesToDelete);

		if (newPositionTaskID) {
			newIdx = this.getTaskEndLineByIdx(this.getTaskIndex(newPositionTaskID)) + 1;
		}
		this.fileLines.splice(newIdx, 0, ...linesToMove);
	}

	private applyTabDiff(startLine: number, endLine: number, diff: number) {
		if (diff === 0) return;
		for (let i = startLine; i <= endLine; i++) {
			const line = this.fileLines[i];
			if (diff > 0) {
				this.fileLines[i] = '\t'.repeat(diff) + line;
			} else {
				const remove = Math.abs(diff);
				const tabCount = this.plugin.taskParser.getNumTabs(line);
				if (tabCount >= remove) {
					this.fileLines[i] = line.slice(remove);
				}
			}
		}
	}
}
