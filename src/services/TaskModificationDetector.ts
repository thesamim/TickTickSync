/**
 * TaskModificationDetector - Detects task changes in markdown files
 * Extracts modification detection logic from SyncModule (lines ~158-756)
 *
 * Responsibilities:
 * - Detect new tasks added to files
 * - Detect modifications to existing tasks
 * - Detect task items (sub-tasks) changes
 * - Calculate change hashes for efficiency
 */

import {
	App,
	Editor,
	type EditorPosition,
	type MarkdownFileInfo,
	MarkdownView,
	Notice,
	TFile,
	TFolder
} from 'obsidian';
import type TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import type { LocalTask } from '@/db/schema';
import { NewFileMap, type ITaskItemRecord, type ITaskRecord } from '@/services/NewFileMap';
import { FolderSyncService } from '@/services/FolderSyncService';
import { getSettings } from '@/settings';
import log from '@/utils/logger';
import ObjectID from 'bson-objectid';
import { normalizeRepeatFlag } from '@/utils/RecurrenceConverter';

export interface TaskModifications {
	titleModified: boolean;
	tagsModified: boolean;
	statusModified: boolean;
	datesModified: boolean;
	parentIdModified: boolean;
	priorityModified: boolean;
	taskItemsModified: boolean;
	notesModified: boolean;
	projectMoved: boolean;
	repeatFlagModified: boolean;
}

export class TaskModificationDetector {
	private app: App;
	private plugin: TickTickSync;
	private folderSyncService?: FolderSyncService;

	constructor(app: App, plugin: TickTickSync, folderSyncService?: FolderSyncService) {
		this.app = app;
		this.plugin = plugin;
		this.folderSyncService = folderSyncService;
	}

	/**
	 * Check for new task content in the current editor line
	 */
	async checkLineForNewTask(editor: Editor, view: MarkdownView | MarkdownFileInfo): Promise<boolean> {
		const fileContent: string | undefined = (view as MarkdownView)?.data;
		const cursor = editor.getCursor();
		const line = cursor.line;
		const linetxt = editor.getLine(line);
		const beforeLength: number | undefined = fileContent?.length;

		const fileMap = new NewFileMap(this.app, this.plugin, (view as MarkdownView).file!);
		await fileMap.init(fileContent);
		await this.addNewTask(linetxt, line, editor, cursor, fileMap);

		const afterLength: number | undefined = fileContent?.length;
		return (beforeLength != afterLength);
	}

	/**
	 * Add a new task from a markdown line
	 */
	async addNewTask(
		lineTxt: string,
		line: number,
		editor: Editor | null,
		cursor: EditorPosition | null,
		fileMap: NewFileMap
	): Promise<void> {
		if (!lineTxt || lineTxt.length == 0) {
			return;
		}

		// Check if it's a new task (has #ticktick tag but no ID yet)
		if (!this.plugin.taskParser.hasTickTickId(lineTxt) && this.plugin.taskParser.hasTickTickTag(lineTxt)) {
			try {
				// Convert markdown to task object
				const currentTask = await this.plugin.taskParser.convertLineToTask(
					lineTxt,
					line,
					fileMap.getFilePath(),
					fileMap,
					null
				);

				// Create task in TickTick
				const newTask = await this.plugin.tickTickRestAPI?.createTask(currentTask) as ITask;

				// Handle parent-child relationship
				if (currentTask.parentId) {
					const parentTask2 = await this.plugin.taskRepository.loadTaskById(currentTask.parentId);
					if (parentTask2) {
						this.plugin.taskParser.addChildToParent(parentTask2, currentTask.parentId);
						const updatedParent = await this.plugin.tickTickRestAPI?.updateTask(parentTask2) as ITask;
						await this.plugin.taskRepository.upsertTask(updatedParent, undefined, Date.now());
					}
				}

				new Notice(`New task created: ${newTask.title} (ID: ${newTask.id})`);

				// If task was created as completed, close it in TickTick
				if (currentTask.status != 0) {
					await this.plugin.tickTickRestAPI?.CloseTask(newTask.id, newTask.projectId);
					await this.plugin.taskRepository.closeTask(newTask.id);
				}

				// Preserve date holder (Obsidian-specific data)
				newTask.dateHolder = currentTask.dateHolder;

				// Update the markdown line with TickTick ID
				await this.updateTaskLineInFile(newTask, lineTxt, editor, cursor, line, fileMap);

				// Calculate hash for change detection
				const taskRecord = fileMap.getTaskRecord(newTask.id);
				const taskString = taskRecord.task;
				const stringToHash = taskString + this.plugin.taskParser.getNoteString(taskRecord, newTask.id);
				newTask.lineHash = (await this.plugin.taskParser?.getLineHash(stringToHash))!;

				// Save to database
				await this.plugin.taskRepository.upsertTask(newTask, fileMap.getFilePath());
				await this.plugin.saveSettings();

			} catch (error) {
				log.error('Error adding task:', error);
				log.error(`The error occurred in file: ${fileMap.getFilePath()}`);
			}
		}
	}

	/**
	 * Check an entire file for new tasks
	 */
	async checkFileForNewTasks(file_path: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(file_path);

		if (!file || file instanceof TFolder) {
			return false;
		}

		// Ensure file is registered in metadata before scanning
		await this.plugin.fileMetadataService?.getFileMetadata(file_path);

		if (!(file instanceof TFile)) { return false; }
		const fileMap = new NewFileMap(this.app, this.plugin, file);
		await fileMap.init();

		// Add TickTick tags if full vault sync is enabled
		if (getSettings().enableFullVaultSync) {
			await this.plugin.fileOperation?.addTickTickTagToFile(fileMap);
		}

		// Check each line for new tasks
		const lines = fileMap.getFileLines().split('\n');
		for (let line = 0; line < lines.length; line++) {
			const linetxt = lines[line];
			await this.addNewTask(linetxt, line, null, null, fileMap);
		}

		return true;
	}

	/**
	 * Check a line for task modifications
	 */
	async checkLineForModifications(
		filepath: string | undefined,
		lineText: string,
		lineNumber: number | undefined,
		fileMap: NewFileMap
	): Promise<boolean> {
		// Only process full tasks here.  taskParser.isTaskItem handles item
		// identification; note-level content is skipped entirely.
		if (!this.plugin.taskParser?.hasTickTickId(lineText) ||
			!this.plugin.taskParser?.hasTickTickTag(lineText)) {
			// Not a full task — check if it's a genuine task item.
			if (lineNumber !== undefined) {
				const fileLines = fileMap.getFileLines().split('\n');
				for (let i = lineNumber - 1; i >= 0; i--) {
					const ancestorLine = fileLines[i];
					if (this.plugin.taskParser.isMarkdownTask(ancestorLine) && this.plugin.taskParser.hasTickTickId(ancestorLine)) {
						const ancestorTabs = this.plugin.taskParser.getNumTabs(ancestorLine);
						if (this.plugin.taskParser.isTaskItem(lineText, ancestorTabs)) {
							return await this.checkTaskItemModification(lineText, fileMap, lineNumber);
						}
						break;
					}
				}
			}
			return false;
		}

		const taskId = this.plugin.taskParser.getTickTickId(lineText) ?? '';
		const taskRecord = fileMap.getTaskRecord(taskId);

		if (!taskRecord || !taskRecord.task) {
			log.error('Task not found in file map', taskId, filepath);
			return false;
		}

		// Get saved task from database
		const savedTask = await this.plugin.taskRepository.loadTaskById(taskId);
		if (!savedTask) {
			// Task not in local DB — check TickTick API before deleting.
			// Handles the race where a file syncs to this device via external
			// sync before the pull phase fetched the task from TickTick.
			const remoteTask = await this.plugin.tickTickRestAPI?.getTaskById(taskId, undefined);
			if (remoteTask) {
				log.warn(`Task ${taskId} not in local DB but exists on TickTick. Importing.`);
				await this.plugin.taskRepository.upsertTask(remoteTask, filepath, Date.now());
				return false;
			}

			log.error(`Task ${taskId} not found on TickTick. Deleting from file ${filepath}`);
			new Notice(`Task not found. It will be removed from the file.`);
			const file = this.app.vault.getAbstractFileByPath(filepath!);
			if (!(file instanceof TFile)) { return false; }
			const lineTask = (await this.plugin.taskParser?.convertLineToTask(lineText, lineNumber!, filepath!, fileMap, taskRecord));
			await this.plugin.fileOperation?.deleteTaskFromSpecificFile(file, lineTask, true);
			return false;
		}

		// Calculate hash for change detection
		let taskNotes = '';
		if (taskRecord.taskLines && taskRecord.taskLines.length > 1) {
			taskNotes = this.plugin.taskParser.getNoteString(taskRecord, taskId);
		}
		const newHash = await this.plugin.taskParser?.getLineHash(lineText + taskNotes);

		// Check if hash matches (no changes)
		if (savedTask.lineHash && newHash === savedTask.lineHash) {
			// Check for moves
			const moveCheck = await this.checkForTaskMove(taskId, filepath!);
			const parentChanged = (taskRecord.parentId || '') !== (savedTask.parentId || '');

			if (!moveCheck.moved && !parentChanged) {
				// Task hasn't changed, ensure sync timestamps are current
				const localTask = await this.plugin.taskRepository.loadLocalTaskById(taskId);
				if (localTask && (!localTask.lastVaultSync || localTask.lastVaultSync < localTask.updatedAt || !localTask.file)) {
					await this.plugin.taskRepository.upsertTask(localTask.task, filepath, Date.now());
				}
				return false;
			}
		}

		// Convert line to task object
		const lineTask = (await this.plugin.taskParser?.convertLineToTask(lineText, lineNumber!, filepath!, fileMap, taskRecord));

		// Ensure task has required fields
		if (!savedTask.dateHolder) {
			this.plugin.dateMan?.addDateHolderToTask(savedTask, undefined);
			await this.plugin.taskRepository.upsertTask(savedTask, undefined, Date.now());
		}
		if (!savedTask.lineHash) {
			savedTask.lineHash = newHash!;
		}

		// Detect what changed
		const modifications = this.detectModifications(lineTask, savedTask, taskRecord);

		return await this.applyModifications(lineTask, savedTask, modifications, filepath!, taskId, newHash ?? '');
	}

	/**
	 * Check entire file for modifications
	 */
	async checkFileForModifications(filepath: string | null): Promise<void> {
		if (!filepath) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!(file instanceof TFile)) {
			return;
		}

		const fileMap = new NewFileMap(this.app, this.plugin, file);
		await fileMap.init();

		const lines: string[] = fileMap.getFileLines().split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (this.plugin.taskParser?.isMarkdownTask(line)) {
				try {
					await this.checkLineForModifications(filepath, line, i, fileMap);
				} catch (error) {
					log.error('Error checking task modification:', error);
				}
			}
		}
	}

	/**
	 * Check if a task's project changed to a different project group
	 * If so, trigger file movement to the new project group's folder
	 * @param task - The updated task from TickTick
	 * @param localTask - The local task record from database
	 */
	async checkForProjectGroupChange(task: ITask, localTask: LocalTask): Promise<void> {
		// Only check if folder organization is enabled
		if (!getSettings().keepProjectFolders) {
			return;
		}

		// Don't move unassociated files
		if (!this.folderSyncService) {
			return;
		}

		const shouldManage = await this.folderSyncService.shouldManageFile(localTask.file ?? undefined);
		if (!shouldManage) {
			log.debug(`File ${localTask.file} is user-managed, skipping project group change check`);
			return;
		}

		try {
			// Check if projects are in different groups
			const groupsAreDifferent = await this.folderSyncService.projectsInDifferentGroups(
				localTask.task.projectId,
				task.projectId
			);

			if (groupsAreDifferent) {
				log.info(`Task ${task.id} moved to different project group`);
				await this.handleProjectGroupMove(task, localTask);
			}
		} catch (error) {
			log.error(`Error checking for project group change for task ${task.id}:`, error);
		}
	}

	/**
	 * Detect all modifications between line task and saved task
	 */
	private detectModifications(lineTask: ITask, savedTask: ITask, taskRecord: ITaskRecord): TaskModifications {
		return {
			titleModified: this.plugin.taskParser?.isTitleChanged(lineTask, savedTask) || false,
			tagsModified: this.plugin.taskParser?.isTagsChanged(lineTask, savedTask) || false,
			statusModified: this.plugin.taskParser?.isStatusChanged(lineTask as unknown as Record<string, unknown>, savedTask as unknown as Record<string, unknown>) || false,
			datesModified: this.plugin.dateMan?.areDatesChanged(lineTask, savedTask) || false,
			parentIdModified: this.plugin.taskParser?.isParentIdChanged(lineTask, savedTask) || false,
			priorityModified: lineTask.priority !== savedTask.priority,
			taskItemsModified: this.plugin.taskParser.areItemsChanged(lineTask.items, savedTask.items),
			notesModified: this.detectNotesModification(lineTask, savedTask),
			projectMoved: false, // Will be set separately
			repeatFlagModified: normalizeRepeatFlag(lineTask.repeatFlag) !== normalizeRepeatFlag(savedTask.repeatFlag)
		};
	}

	/**
	 * Detect if notes/description changed
	 */
	private detectNotesModification(lineTask: ITask, savedTask: ITask): boolean {
		if (!getSettings().syncNotes) {
			return false;
		}

		if (lineTask.content) {
			return this.plugin.taskParser.areNotesChanged(lineTask.content, savedTask.content);
		} else if (lineTask.desc) {
			return this.plugin.taskParser.areNotesChanged(lineTask.desc, savedTask.desc);
		}

		return false;
	}

	/**
	 * Apply detected modifications
	 */
	private async applyModifications(
		lineTask: ITask,
		savedTask: ITask,
		modifications: TaskModifications,
		filepath: string,
		taskId: string,
		newHash: string
	): Promise<boolean> {
		let modified = false;

		// Preserve timezone
		lineTask.timeZone = savedTask.timeZone;

		// Check for project move
		const moveCheck = await this.checkForTaskMove(taskId, filepath);
		if (moveCheck.moved) {
			await this.handleProjectMove(lineTask, savedTask, moveCheck.oldFilePath, filepath);
			modifications.projectMoved = true;
			modified = true;

			// Immediately persist the new file mapping to DB so subsequent API
			// failures don't leave the local record stale, preventing a sync loop.
			lineTask.lineHash = newHash;
			await this.plugin.taskRepository.upsertTask(lineTask, filepath, Date.now());
		}

		// Handle project change from tag modification
		if (modifications.tagsModified && !modifications.projectMoved) {
			if (lineTask.projectId && savedTask.projectId && lineTask.projectId !== savedTask.projectId) {
				await this.plugin.tickTickRestAPI?.moveTaskProject(lineTask, savedTask.projectId, lineTask.projectId);
				modified = true;
			}
		}

		// Handle parent change
		if (modifications.parentIdModified) {
			await this.handleParentChange(lineTask, savedTask, taskId);
			modified = true;
		}

		// Handle status change (complete/incomplete)
		if (modifications.statusModified) {
			await this.handleStatusChange(lineTask);
			modified = true;
		}

		// Update task if any content changed
		if (this.hasContentChanges(modifications)) {
			savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
			const saveDateHolder = lineTask.dateHolder;
			// Preserve reminder fields from saved task when line task lacks them
			if ((!lineTask.reminders || lineTask.reminders.length === 0) && savedTask.reminders?.length) {
				lineTask.reminders = savedTask.reminders;
			}
			if (!lineTask.reminder && savedTask.reminder) {
				lineTask.reminder = savedTask.reminder;
			}
			if (!lineTask.remindTime && savedTask.remindTime) {
				lineTask.remindTime = savedTask.remindTime;
			}
			if (!lineTask.repeatFlag && savedTask.repeatFlag) {
				lineTask.repeatFlag = savedTask.repeatFlag;
			}
			const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(lineTask) as ITask;
			updatedTask.dateHolder = saveDateHolder;
			updatedTask.lineHash = newHash;

			const targetPath: string | undefined = modifications.projectMoved ? filepath : undefined;
			await this.plugin.taskRepository.upsertTask(updatedTask, targetPath, Date.now());
			modified = true;

			this.notifyUserOfChanges(taskId, modifications);
		}

		// Update hash even if no API call was made
		if (!modified && newHash !== savedTask.lineHash) {
			lineTask.lineHash = newHash;
			await this.plugin.taskRepository.upsertTask(lineTask, undefined, Date.now());
		}

		return modified;
	}

	/**
	 * Check if there are any content changes (excluding status)
	 */
	private hasContentChanges(modifications: TaskModifications): boolean {
		return modifications.titleModified ||
			modifications.tagsModified ||
			modifications.datesModified ||
			modifications.parentIdModified ||
			modifications.priorityModified ||
			modifications.taskItemsModified ||
			modifications.notesModified ||
			modifications.projectMoved ||
			modifications.repeatFlagModified;
	}

	/**
	 * Check if task moved to a different file/project
	 */
	private async checkForTaskMove(taskId: string, currentPath: string): Promise<{
		moved: boolean;
		oldFilePath: string
	}> {
		const oldFilePath = await this.plugin.fileMetadataService.getFilepathForTask(taskId);
		const moved = !!(oldFilePath && oldFilePath !== currentPath);
		return { moved, oldFilePath: oldFilePath || '' };
	}

	/**
	 * Handle task moving between projects/files
	 * Also checks if project groups differ and moves file if necessary
	 */
	private async handleProjectMove(newTask: ITask, oldTask: ITask, oldPath: string, newPath: string): Promise<void> {
		await this.plugin.tickTickRestAPI?.moveTaskProject(newTask, oldTask.projectId, newTask.projectId);

		const message = `Task ${newTask.id} moved from ${oldPath} to ${newPath}`;
		new Notice(message, 5000);
		log.debug(message);
	}

	/**
	 * Handle moving a task's file when its project group changes
	 * @param task - The updated task with new projectId
	 * @param localTask - The local task record with current file path
	 */
	private async handleProjectGroupMove(task: ITask, localTask: LocalTask): Promise<void> {
		if (!this.folderSyncService) {
			return;
		}

		try {
			const oldPath = localTask.file;
			if (!oldPath) { return; }

			// Get the new folder path based on task's new project
			const newFolderPath = await this.folderSyncService.getFolderPathForTask(task);

			// Extract filename from old path
			const filename = oldPath.split('/').pop() || 'Unknown.md';

			// Move the file
			const newPath = await this.folderSyncService.moveFileToProjectFolder(
				oldPath,
				newFolderPath,
				filename
			);

			if (newPath) {
				const message = `Task ${task.id} file moved from ${oldPath} to ${newPath} due to project group change`;
				new Notice(message, 5000);
				log.info(message);
			}
		} catch (error) {
			log.error(`Error handling project group move for task ${task.id}:`, error);
			new Notice(`Error moving task file: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Handle task parent change (subtask hierarchy)
	 */
	private async handleParentChange(lineTask: ITask, savedTask: ITask, taskId: string): Promise<void> {
		await this.plugin.tickTickRestAPI?.moveTaskParent(taskId, savedTask.parentId, lineTask.parentId, lineTask.projectId);

		const oldParent = await this.plugin.taskRepository.loadTaskById(savedTask.parentId);
		const newParent = await this.plugin.taskRepository.loadTaskById(lineTask.parentId);

		const message = `Task ${taskId} parent changed from "${oldParent?.title || 'none'}" to "${newParent?.title || 'none'}"`;
		new Notice(message, 5000);
		log.debug(message);
	}

	/**
	 * Handle task status change (complete/incomplete)
	 */
	private async handleStatusChange(lineTask: ITask): Promise<void> {
		if (lineTask.status != 0) {
			await this.plugin.tickTickRestAPI?.CloseTask(lineTask.id, lineTask.projectId);
			await this.plugin.taskRepository.closeTask(lineTask.id);
		} else {
			await this.plugin.tickTickRestAPI?.OpenTask(lineTask.id, lineTask.projectId);
			await this.plugin.taskRepository.reopenTask(lineTask.id);
		}
		new Notice(`Task ${lineTask.id} status updated`);
	}

	/**
	 * Notify user of what changed
	 */
	private notifyUserOfChanges(taskId: string, modifications: TaskModifications): void {
		const changes: string[] = [];
		if (modifications.titleModified) changes.push('content');
		if (modifications.statusModified) changes.push('status');
		if (modifications.datesModified) changes.push('dates');
		if (modifications.tagsModified) changes.push('tags');
		if (modifications.projectMoved) changes.push('project');
		if (modifications.priorityModified) changes.push('priority');
		if (modifications.parentIdModified) changes.push('parent');
		if (modifications.taskItemsModified) changes.push('items');
		if (modifications.notesModified) changes.push('notes');

		const message = `Task ${taskId} updated: ${changes.join(', ')}`;
		new Notice(message);
		if (getSettings().debugMode) {
			log.debug(message);
		}
	}

	/**
	 * Check for task item (sub-task) modifications
	 */
	private async checkTaskItemModification(lineText: string, fileMap: NewFileMap, lineNumber: number | undefined): Promise<boolean> {
		if (!this.plugin.taskParser?.isMarkdownTask(lineText)) {
			return false;
		}

		const lineItemId = this.plugin.taskParser.getLineItemId(lineText);
		let currentObject: ITaskItemRecord | undefined;

		if (lineItemId) {
			currentObject = fileMap.getTaskItemRecord(lineItemId);
		} else if (lineNumber !== undefined) {
			currentObject = fileMap.getTaskItemRecordByLine(lineNumber);
		}

		if (!currentObject) {
			log.warn('Item not found in file map:', lineText);
			return false;
		}

		if (!currentObject.parentId || currentObject.parentId === '' || currentObject.parentId.length < 1) {
			return false;
		}

		const parentID = currentObject.parentId;
		const itemId = currentObject.ID;
		let modified = false;

		const newItem = this.plugin.taskParser?.taskFromLine(lineText);
		const parentTask = await this.plugin.taskRepository.loadTaskById(parentID);

		if (parentTask && parentTask.items) {
			if (itemId) {
				// Existing item - check for modifications
				const oldItem = parentTask.items.find((item) => item.id == itemId);
				if (oldItem) {
					if (oldItem.title.trim() != newItem!.description.trim() ||
						oldItem.status != (newItem!.status ? 2 : 0)) {
						oldItem.title = newItem!.description.trim();
						oldItem.status = newItem!.status ? 2 : 0;
						modified = true;
					}
				} else {
					// Item ID not found - force add it
					log.warn('Item', newItem, 'not found in parent items. Forcibly adding...');
					parentTask.items.push({
						id: itemId,
						title: newItem!.description,
						status: newItem!.status ? 2 : 0
					});
					modified = true;
				}
			} else {
				// New item - generate ID and add
				const Oid = ObjectID();
				const OidHexString = Oid.toHexString();
				parentTask.items.push({
					id: OidHexString,
					title: newItem!.description,
					status: newItem!.status ? 2 : 0
				});

				// CRITICAL: Get the file from fileMap, not from active workspace
				const filepath = fileMap.getFilePath();
				const file = this.app.vault.getAbstractFileByPath(filepath);
			if (!(file instanceof TFile)) { return false; }

				if (file && lineNumber !== undefined) {
					try {
						const fileContent = await this.app.vault.read(file);
						const lines = fileContent.split('\n');
						const updatedItemContent = `${lineText} %%${OidHexString}%%`;
						lines[lineNumber] = updatedItemContent;
						await this.app.vault.modify(file, lines.join('\n'));
					} catch (error) {
						log.error(`Error updating item in file ${filepath}:`, error);
					}
				}
				modified = true;
			}
		} else {
			return false;
		}

		// Update parent task if modified
		if (modified) {
			try {
				const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(parentTask);
				if (updatedTask) {
					await this.plugin.taskRepository.upsertTask(updatedTask, undefined, Date.now());
				}
			} catch (error) {
				log.error('Error updating parent task:', error);
			}
		}

		return modified;
	}

	/**
	 * Update task line in file with TickTick ID
	 */
	private async updateTaskLineInFile(
		newTask: ITask,
		lineTxt: string,
		editor: Editor | null,
		cursor: EditorPosition | null,
		line: number | null,
		fileMap: NewFileMap
	): Promise<void> {
		const newTaskCopy = { ...newTask };
		newTaskCopy.items = [];

		const numTabs = this.plugin.taskParser.getNumTabs(lineTxt);
		const decoratedText = await this.plugin.taskParser?.convertTaskToLine(newTaskCopy, numTabs);


		try {
			const taskLine = line ?? cursor?.line ?? 0;
			const taskRec = await fileMap.getTaskRecordByLine(taskLine);
			const noteLineCount = taskRec.taskLines ? taskRec.taskLines.length : 0;

			if (editor && cursor) {
				const from = { line: cursor.line, ch: 0 };
				const endLine = cursor.line + noteLineCount;
				const to = noteLineCount > 0
					? { line: endLine, ch: editor.getLine(endLine).length }
					: { line: cursor.line, ch: lineTxt.length };
				editor.replaceRange(decoratedText, from, to);
			} else if (line !== null) {
				fileMap.replaceLines(line, 1 + noteLineCount, decoratedText);
				const file = this.app.vault.getAbstractFileByPath(fileMap.getFilePath());
				if (file instanceof TFile) {
					await this.app.vault.modify(file, fileMap.getFileLines());
				}
			}
		} catch (error) {
			log.error('Error updating task line in file:', error);
		}
	}
}
