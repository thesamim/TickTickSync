/**
 * TaskDeletionHandler - Handles task deletion detection and execution
 * Extracts deletion logic from SyncModule (lines ~39-156, 791-834)
 *
 * Responsibilities:
 * - Detect tasks deleted from markdown files
 * - Detect task items (sub-tasks) deleted from tasks
 * - Confirm deletions with user
 * - Execute deletions in TickTick and database
 */

import { App, MarkdownView, Notice, TFile, TFolder } from 'obsidian';
import type TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import { FileTaskQueries } from '@/repositories/FileTaskQueries';
import { TaskDeletionModal } from '@/modals/TaskDeletionModal';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

export class TaskDeletionHandler {
	private app: App;
	private plugin: TickTickSync;
	private fileTaskQueries: FileTaskQueries;

	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
		this.fileTaskQueries = new FileTaskQueries();
	}

	/**
	 * Check a file for deleted tasks and handle them
	 */
	async checkFileForDeletedTasks(file_path: string | null): Promise<void> {
		// Get file and content
		let file;
		let currentFileValue: string;
		let filepath: string;

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path);
			if (!file || file instanceof TFolder) {
				return;
			}
			filepath = file_path;
			if (file instanceof TFile) {
				currentFileValue = await this.plugin.fileOperation.readFileContent(file);
			} else {
				return;
			}
		} else {
			// Use active file
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			file = this.app.workspace.getActiveFile();
			if (!file) {
				return;
			}
			filepath = file.path;
			currentFileValue = view?.data || '';
		}

		// Check if file has tasks
		const hasTasks = await this.fileTaskQueries.fileHasTasks(filepath);
		if (!hasTasks) {
			return;
		}

		if (!currentFileValue) {
			log.warn('File content not readable:', filepath, "assuming all tasks deleted.");
		}

		// Remove frontmatter from content
		const contentWithoutFrontmatter = currentFileValue.replace(/^---[\s\S]*?---\n/, '');

		// Find tasks that are missing from the file
		const deletedTaskIds = await this.findMissingTaskIds(contentWithoutFrontmatter, filepath);

		// Delete the missing tasks
		if (deletedTaskIds.length > 0) {
			await this.deleteTasksByIds(deletedTaskIds);
		}

		// Check for deleted task items (sub-tasks)
		await this.checkForDeletedTaskItems(filepath, contentWithoutFrontmatter);
	}

	/**
	 * Find task IDs that were in the database but are missing from file content
	 */
	private async findMissingTaskIds(currentContent: string, filePath: string): Promise<string[]> {
		// Extract all taskIds currently in the file
		const regex = /%%\[ticktick_id::\s*([a-zA-Z0-9]+)\]%%/gi;
		const matches = currentContent.matchAll(regex);
		const existingTaskIds = new Set([...matches].map((match) => match[1].toLowerCase()));

		// Get taskIds that should be in this file (from database)
		const tasksInFile = await this.fileTaskQueries.getTasksInFile(filePath);
		const dbTaskIds = tasksInFile.map(lt => lt.taskId).filter(id => !!id);

		// Find tasks in DB but not in file
		let missingTaskIds = dbTaskIds.filter(taskId =>
			!existingTaskIds.has(taskId.toLowerCase())
		);

		// Check if tasks were just moved to another file (not actually deleted)
		if (missingTaskIds.length > 0) {
			const actuallyDeleted: string[] = [];

			for (const taskId of missingTaskIds) {
				// First check if task exists in another file in the vault
				const foundInAnotherFile = await this.findTaskInVault(taskId, filePath);

				if (foundInAnotherFile) {
					log.trace(`Task ${taskId} moved from ${filePath} to ${foundInAnotherFile}`);
				} else {
					// Task not found anywhere in vault - it's actually deleted
					actuallyDeleted.push(taskId);
				}
			}

			missingTaskIds = actuallyDeleted;
		}

		return missingTaskIds;
	}

	/**
	 * Search for a task ID in all vault files (except the specified excluded file)
	 * Returns the file path if found, undefined otherwise
	 */
	private async findTaskInVault(taskId: string, excludeFilePath: string): Promise<string | undefined> {
		const allMarkdownFiles = this.app.vault.getMarkdownFiles();
		const taskIdPattern = new RegExp(`%%\\[ticktick_id::\\s*${taskId}\\]%%`, 'i');

		for (const file of allMarkdownFiles) {
			// Skip the file we're checking deletions from
			if (file.path === excludeFilePath) {
				continue;
			}

			try {
				const content = await this.app.vault.cachedRead(file);
				if (taskIdPattern.test(content)) {
					return file.path;
				}
			} catch (error) {
				log.warn(`Error reading file ${file.path} while searching for task ${taskId}:`, error);
			}
		}

		return undefined;
	}

	/**
	 * Check for deleted task items (sub-tasks) within tasks
	 */
	private async checkForDeletedTaskItems(filepath: string, currentContent: string): Promise<void> {
		const tasksInFile = await this.fileTaskQueries.getTasksInFile(filepath);

		for (const localTask of tasksInFile) {
			const task = localTask.task;
			if (!task.items || task.items.length === 0) {
				continue;
			}

			// Check which items are missing from the file
			const deletedItems: string[] = [];
			for (const item of task.items) {
				// Task items have their IDs in the markdown as %%itemId%%
				if (!currentContent.includes(item.id)) {
					deletedItems.push(item.id);
				}
			}

			// Remove deleted items from task
			if (deletedItems.length > 0) {
				await this.removeTaskItems(task, deletedItems, filepath);
			}
		}
	}

	/**
	 * Remove task items from a task
	 */
	private async removeTaskItems(task: ITask, itemIds: string[], filepath: string): Promise<void> {
		try {
			// Filter out deleted items
			task.items = task.items?.filter(item => !itemIds.includes(item.id)) || [];

			// Update task in TickTick
			task.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());

			// Add Obsidian URL if configured
			const taskURL = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath);
			if (taskURL && getSettings().fileLinksInTickTick !== 'noLink') {
				task.title = task.title + ' ' + taskURL;
			}

			const updatedTask = await this.plugin.tickTickRestAPI?.updateTask(task);

			// Update in database
			if (updatedTask) {
				await this.plugin.taskRepository.upsertTask(updatedTask, filepath, Date.now());
			}

			log.debug(`Removed ${itemIds.length} items from task ${task.id}`);
		} catch (error) {
			log.error('Task item removal failed:', error);
		}
	}

	/**
	 * Delete tasks by their IDs with user confirmation
	 */
	async deleteTasksByIds(taskIds: string[]): Promise<string[]> {
		if (taskIds.length === 0) {
			return [];
		}

		// Get confirmation from user
		const confirmed = await this.confirmDeletion(taskIds, 'The tasks were removed from the file');
		if (!confirmed) {
			new Notice('Tasks will not be deleted. Please rectify the issue before the next sync.', 5000);
			return [];
		}

		const deletedTaskIds: string[] = [];

		// Delete each task from TickTick and database
		for (const taskId of taskIds) {
			try {
				const projectId = await this.plugin.taskRepository?.getProjectIdForTask(taskId);

				// Delete from TickTick
				if (projectId) {
					const response = await this.plugin.tickTickRestAPI?.deleteTask(taskId, projectId);
					if (response) {
						new Notice(`Task ${taskId} deleted`);
					}
				}

				// Mark as deleted in database (tombstone pattern)
				await this.plugin.taskRepository.deleteTask(taskId);
				deletedTaskIds.push(taskId);

			} catch (error) {
				log.error(`Failed to delete task ${taskId}:`, error);
			}
		}

		if (deletedTaskIds.length > 0) {
			await this.plugin.saveSettings();
			log.debug(`Deleted ${deletedTaskIds.length} tasks`);
		}

		return deletedTaskIds;
	}

	/**
	 * Confirm deletion with user via modal
	 */
	private async confirmDeletion(taskIds: string[], reason: string): Promise<boolean> {
		const items = await this.fileTaskQueries.getDeletionItems(taskIds);

		const modal = new TaskDeletionModal(
			this.app,
			items,
			reason,
			() => {}
		);

		return await modal.showModal();
	}

	/**
	 * Delete a task from a specific file (used when task is invalid)
	 */
	async deleteTaskFromFile(task: ITask): Promise<void> {
		try {
			const filepath = await this.fileTaskQueries.getFilepathForTask(task.id);
			if (filepath) {
				const file = this.app.vault.getAbstractFileByPath(filepath);
				if (file instanceof TFile) {
					await this.plugin.fileOperation?.deleteTaskFromSpecificFile(file, task, true);
				}
			}
		} catch (error) {
			log.error(`Error deleting task ${task.id} from file:`, error);
		}
	}

	/**
	 * Delete multiple tasks from a specific file
	 */
	async deleteTasksFromFile(filepath: string, tasks: ITask[]): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filepath);
			if (file instanceof TFile) {
				await this.plugin.fileOperation?.deleteTasksFromSpecificFile(file, tasks, false);
			}
		} catch (error) {
			log.error(`Error deleting tasks from file ${filepath}:`, error);
		}
	}

	/**
	 * Handle file deletion - delete all tasks in the file
	 */
	async handleFileDeleted(filepath: string): Promise<void> {
		const hasTasks = await this.fileTaskQueries.fileHasTasks(filepath);
		if (!hasTasks) {
			return;
		}

		const taskIds = await this.fileTaskQueries.getTaskIdsInFile(filepath);
		if (taskIds.length > 0) {
			await this.deleteTasksByIds(taskIds);
		}

		// Clean up file metadata
		await this.plugin.fileMetadataService?.deleteFileMetadata(filepath);
	}

	/**
	 * Clean up orphaned tasks (tasks in DB with no file mapping)
	 */
	async cleanupOrphanedTasks(): Promise<number> {
		try {
			const allTasks = await this.plugin.taskRepository?.loadAllTasks();
			let orphanedCount = 0;

			for (const task of allTasks || []) {
				const filepath = await this.fileTaskQueries.getFilepathForTask(task.id);
				if (!filepath || filepath.length === 0) {
					log.debug(`Orphaned task found: ${task.id} - ${task.title}`);
					orphanedCount++;
				}
			}

			if (orphanedCount > 0) {
				log.warn(`Found ${orphanedCount} orphaned tasks (no file mapping)`);
			}

			return orphanedCount;
		} catch (error) {
			log.error('Error checking for orphaned tasks:', error);
			return 0;
		}
	}
}
