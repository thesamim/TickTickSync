/**
 * TaskOperationsService - Handles task state operations
 * Extracts task operation logic from SyncModule (lines ~758-890)
 *
 * Responsibilities:
 * - Open/close tasks
 * - Move tasks between projects
 * - Move tasks between parents
 * - Update task content after file operations
 * - Backup operations
 */

import { App, Notice, TFile } from 'obsidian';
import type TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import { FileTaskQueries } from '@/repositories/FileTaskQueries';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

export class TaskOperationsService {
	private app: App;
	private plugin: TickTickSync;
	private fileTaskQueries: FileTaskQueries;

	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
		this.fileTaskQueries = new FileTaskQueries();
	}

	/**
	 * Close (complete) a task
	 */
	async closeTask(taskId: string): Promise<void> {
		try {
			const projectId = await this.plugin.taskRepository.closeTask(taskId);
			if (!projectId) { throw new Error('Project ID not found'); }
			await this.plugin.tickTickRestAPI?.CloseTask(taskId, projectId);
			await this.plugin.saveSettings();
			new Notice(`Task ${taskId} is closed.`);
		} catch (error) {
			log.error('Error closing task:', error);
			throw error;
		}
	}

	/**
	 * Reopen (mark incomplete) a task
	 */
	async reopenTask(taskId: string): Promise<void> {
		try {
			const projectId = await this.plugin.taskRepository.reopenTask(taskId);
			if (!projectId) { throw new Error('Project ID not found'); }
			await this.plugin.tickTickRestAPI?.OpenTask(taskId, projectId);
			await this.plugin.fileOperation.uncompleteTaskInTheFile(taskId);
			await this.plugin.saveSettings();
			new Notice(`Task ${taskId} is reopened.`);
		} catch (error) {
			log.error('Error opening task:', error);
			throw error;
		}
	}

	/**
	 * Update task content for all tasks in a file (e.g., after rename)
	 */
	async updateTaskContentForFile(filepath: string): Promise<void> {
		const tasks = await this.fileTaskQueries.getTasksInFile(filepath);
		if (tasks.length === 0) {
			return;
		}

		const taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
		if (!taskURL) {
			return;
		}

		try {
			for (const localTask of tasks) {
				const task = localTask.task;

				// Add URL to task title
				task.title = task.title + ' ' + taskURL;

				// Ensure the ticktick tag is in the task's TickTick tags
				if (!task.tags?.includes('ticktick')) {
					task.tags = [...(task.tags || []), 'ticktick'];
				}

				// Update in TickTick
				const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(task);

				// Cache the title without the URL (for content comparison)
				if (updatedTask) {
					const stripped = this.plugin.taskParser?.stripOBSUrl(updatedTask.title);
					if (stripped !== undefined) {
						updatedTask.title = stripped;
					}
					await this.plugin.taskRepository.upsertTask(updatedTask, undefined, Date.now());
				}
			}

			log.debug(`Updated ${tasks.length} task(s) in file ${filepath}`);
		} catch (error) {
			log.error('An error occurred in updateTaskContentForFile:', error);
			throw error;
		}
	}

	/**
	 * Force update all tasks in a file
	 * Pushes all current task data to TickTick regardless of modification state
	 */
	async forceUpdateTasksInFile(filepath: string): Promise<void> {
		try {
			const abstractFile = this.app.vault.getAbstractFileByPath(filepath);
			if (!abstractFile) {
				log.error(`File ${filepath} not found`);
				return;
			}
			if (!(abstractFile instanceof TFile)) {
				log.error(`${filepath} is not a valid file`);
				return;
			}
			const content = await this.app.vault.read(abstractFile);
			const lines = content.split('\n');

			for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
				const lineText = lines[lineNumber];

				// Only process lines that have a TickTick ID and tag
				if (this.plugin.taskParser?.hasTickTickId(lineText) &&
				    this.plugin.taskParser?.hasTickTickTag(lineText)) {

					const taskId = this.plugin.taskParser.getTickTickId(lineText) ?? '';
					const savedTask = await this.plugin.taskRepository.loadTaskById(taskId);

					if (taskId && savedTask) {
						// Update modification time to force sync
						savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());

						// Parse current line task
						const lineTask = await this.plugin.taskParser?.convertLineToTask(
							lineText,
							lineNumber,
							filepath,
							null, // fileMap
							null  // taskRecord
						);

						// Merge saved data with line data
						const merged = { ...savedTask, ...lineTask };
						Object.assign(lineTask, merged);

						// Update in TickTick
						const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(lineTask) as ITask;

						// Update in database
						await this.plugin.taskRepository.upsertTask(updatedTask, undefined, Date.now());
					}
				}
			}

			log.debug(`Force updated all tasks in file ${filepath}`);
		} catch (error) {
			log.error('Error in forceUpdateTasksInFile:', error);
			throw error;
		}
	}

	/**
	 * Sync completed task status to Obsidian files
	 */
	async syncCompletedTasksToObsidian(taskIds: string[]): Promise<void> {
		try {
			for (const taskId of taskIds) {
				await this.plugin.fileOperation.completeTaskInTheFile(taskId);
				await this.plugin.taskRepository.closeTask(taskId);
				new Notice(`Task ${taskId} is closed.`);
			}

			await this.plugin.saveSettings();
		} catch (error) {
			log.error('Error synchronizing completed task status:', error);
			throw error;
		}
	}

	/**
	 * Sync uncompleted task status to Obsidian files
	 */
	async syncUncompletedTasksToObsidian(taskIds: string[]): Promise<void> {
		try {
			for (const taskId of taskIds) {
				await this.plugin.fileOperation.uncompleteTaskInTheFile(taskId);
				await this.plugin.taskRepository.reopenTask(taskId);
				new Notice(`Task ${taskId} is reopened.`);
			}

			await this.plugin.saveSettings();
		} catch (error) {
			log.error('Error synchronizing uncompleted task status:', error);
			throw error;
		}
	}

	/**
	 * Backup all TickTick resources
	 */
	async backupTickTickData(): Promise<void> {
		try {
			let bkupFolder = getSettings().bkupFolder;
			if (bkupFolder[bkupFolder.length - 1] != '/') {
				bkupFolder += '/';
			}

			const now: Date = new Date();
			const timeString: string = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
			const filename = bkupFolder + 'ticktick-backup-' + timeString + '.csv';

			log.debug('Creating Backup:', filename);

			const bkupData = await this.plugin.tickTickRestAPI?.exportData();

			if (bkupData) {
				await this.app.vault.create(filename, bkupData);
				new Notice(`TickTick backup saved: ${filename}`);
			}
		} catch (error) {
			log.error('An error occurred while creating TickTick backup:', error);
			new Notice('An error occurred while creating TickTick backup: ' + (error instanceof Error ? error.message : String(error)), 5000);
			throw error;
		}
	}

	/**
	 * Move a task to a different project
	 */
	async moveTaskToProject(task: ITask, newProjectId: string, foundInAnotherFile: string|null = null): Promise<void> {
		try {
			const oldProjectId = task.projectId;
			await this.plugin.tickTickRestAPI?.moveTaskProject(task, oldProjectId, newProjectId);

			// Update in database
			task.projectId = newProjectId;
			await this.plugin.taskRepository.upsertTask(task, foundInAnotherFile ?? undefined);
			await this.plugin.tickTickRestAPI?.updateTask(task);

			log.debug(`Moved task ${task.id} from project ${oldProjectId} to ${newProjectId}`);
		} catch (error) {
			log.error(`Error moving task ${task.id} to project ${newProjectId}:`, error);
			throw error;
		}
	}

	/**
	 * Move a task to a different parent (change subtask hierarchy)
	 */
	async moveTaskToParent(taskId: string, newParentId: string | undefined, projectId: string): Promise<void> {
		try {
			const task = await this.plugin.taskRepository.loadTaskById(taskId);
			if (!task) {
				throw new Error(`Task ${taskId} not found`);
			}

			const oldParentId = task.parentId;
			await this.plugin.tickTickRestAPI?.moveTaskParent(taskId, oldParentId ?? '', newParentId ?? '', projectId);

			// Update in database
			task.parentId = newParentId ?? '';
			await this.plugin.taskRepository.upsertTask(task, undefined, Date.now());

			log.debug(`Moved task ${taskId} from parent ${oldParentId} to ${newParentId}`);
		} catch (error) {
			log.error(`Error moving task ${taskId} to parent ${newParentId}:`, error);
			throw error;
		}
	}

	/**
	 * Bulk close multiple tasks
	 */
	async closeTasks(taskIds: string[]): Promise<void> {
		for (const taskId of taskIds) {
			await this.closeTask(taskId);
		}
	}

	/**
	 * Bulk reopen multiple tasks
	 */
	async reopenTasks(taskIds: string[]): Promise<void> {
		for (const taskId of taskIds) {
			await this.reopenTask(taskId);
		}
	}

	/**
	 * Update a task's priority
	 */
	async updateTaskPriority(taskId: string, priority: number): Promise<void> {
		try {
			const task = await this.plugin.taskRepository.loadTaskById(taskId);
			if (!task) {
				throw new Error(`Task ${taskId} not found`);
			}

			task.priority = priority;
			const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(task);

			if (updatedTask) {
				await this.plugin.taskRepository.upsertTask(updatedTask, undefined, Date.now());
			}

			log.debug(`Updated priority for task ${taskId} to ${priority}`);
		} catch (error) {
			log.error(`Error updating priority for task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Add tags to a task
	 */
	async addTagsToTask(taskId: string, tags: string[]): Promise<void> {
		try {
			const task = await this.plugin.taskRepository.loadTaskById(taskId);
			if (!task) {
				throw new Error(`Task ${taskId} not found`);
			}

			// Merge with existing tags
			const existingTags = new Set(task.tags || []);
			tags.forEach(tag => existingTags.add(tag));
			task.tags = Array.from(existingTags);

			const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(task);

			if (updatedTask) {
				await this.plugin.taskRepository.upsertTask(updatedTask, undefined, Date.now());
			}

			log.debug(`Added tags to task ${taskId}:`, tags);
		} catch (error) {
			log.error(`Error adding tags to task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Remove tags from a task
	 */
	async removeTagsFromTask(taskId: string, tags: string[]): Promise<void> {
		try {
			const task = await this.plugin.taskRepository.loadTaskById(taskId);
			if (!task) {
				throw new Error(`Task ${taskId} not found`);
			}

			// Remove specified tags
			const tagsToRemove = new Set(tags.map(t => t.toLowerCase()));
			task.tags = (task.tags || []).filter(tag => !tagsToRemove.has(tag.toLowerCase()));

			const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(task);

			if (updatedTask) {
				await this.plugin.taskRepository.upsertTask(updatedTask, undefined, Date.now());
			}

			log.debug(`Removed tags from task ${taskId}:`, tags);
		} catch (error) {
			log.error(`Error removing tags from task ${taskId}:`, error);
			throw error;
		}
	}
}
