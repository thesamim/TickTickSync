/**
 * FileTaskQueries - Direct database queries for file-task relationships
 * REPLACES the redundant FileMetadata abstraction
 *
 * This service provides simple, direct queries instead of building
 * intermediate FileMetadata objects that duplicate database data.
 */

import { db } from "@/db/dexie";
import { getAllFiles, getFile } from "@/db/files";
import type { LocalTask } from "@/db/schema";
import type { ITask } from "@/api/types/Task";
import log from "@/utils/logger";
import { getSettings } from '@/settings';

export class FileTaskQueries {
	/**
	 * Get all task IDs in a specific file
	 */
	async getTaskIdsInFile(filepath: string): Promise<string[]> {
		try {
			const tasks = await db.tasks.where("file").equals(filepath).toArray();
			return tasks.map(t => t.taskId).filter(id => !!id);
		} catch (error) {
			log.error(`Error getting task IDs for file ${filepath}:`, error);
			return [];
		}
	}

	/**
	 * Get all tasks in a specific file
	 */
	async getTasksInFile(filepath: string): Promise<LocalTask[]> {
		try {
			return await db.tasks.where("file").equals(filepath).toArray();
		} catch (error) {
			log.error(`Error getting tasks for file ${filepath}:`, error);
			return [];
		}
	}

	/**
	 * Get count of tasks in a file
	 */
	async getTaskCountInFile(filepath: string): Promise<number> {
		try {
			return await db.tasks.where("file").equals(filepath).count();
		} catch (error) {
			log.error(`Error getting task count for file ${filepath}:`, error);
			return 0;
		}
	}

	/**
	 * Check if a file has any tasks
	 */
	async fileHasTasks(filepath: string): Promise<boolean> {
		const count = await this.getTaskCountInFile(filepath);
		return count > 0;
	}

	/**
	 * Get the default project ID for a file
	 */
	async getDefaultProjectForFile(filepath: string): Promise<string | undefined> {
		try {
			const file = await getFile(filepath);
			log.debug(`Default project for file ${filepath}:`, file?.defaultProjectId);
			return file?.defaultProjectId;
		} catch (error) {
			log.error(`Error getting default project for file ${filepath}:`, error);
			return undefined;
		}
	}

	/**
	 * Get the default project name for a file
	 */
	async getDefaultProjectNameForFile(filepath: string): Promise<string | undefined> {
		try {
			const file = await getFile(filepath);
			if (!file?.defaultProjectId) return undefined;

			const project = await db.projects.get(file.defaultProjectId);
			return project?.project.name;
		} catch (error) {
			log.error(`Error getting default project name for file ${filepath}:`, error);
			return undefined;
		}
	}

	/**
	 * Get all files that have tasks
	 */
	async getFilesWithTasks(): Promise<string[]> {
		try {
			const tasks = await db.tasks.toArray();
			const files = new Set(tasks.map(t => t.file).filter(f => f && f.length > 0));
			return Array.from(files);
		} catch (error) {
			log.error("Error getting files with tasks:", error);
			return [];
		}
	}

	/**
	 * Get all files from the database
	 */
	async getAllFiles(): Promise<Array<{ path: string; defaultProjectId?: string }>> {
		try {
			return await getAllFiles();
		} catch (error) {
			log.error("Error getting all files:", error);
			return [];
		}
	}

	/**
	 * Find missing task IDs (tasks that were in the file but are now gone)
	 * Used for deletion detection
	 */
	async findMissingTaskIds(filepath: string, currentTaskIds: string[]): Promise<string[]> {
		try {
			const dbTaskIds = await this.getTaskIdsInFile(filepath);
			const currentSet = new Set(currentTaskIds.map(id => id.toLowerCase()));
			return dbTaskIds.filter(id => !currentSet.has(id.toLowerCase()));
		} catch (error) {
			log.error(`Error finding missing task IDs for file ${filepath}:`, error);
			return [];
		}
	}

	/**
	 * Get task items (sub-tasks) for a specific task
	 * Returns item IDs
	 */
	async getTaskItemIds(taskId: string): Promise<string[]> {
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			return localTask?.task.items?.map(item => item.id) || [];
		} catch (error) {
			log.error(`Error getting task items for task ${taskId}:`, error);
			return [];
		}
	}

	/**
	 * Check for duplicate tasks (same task appearing in multiple files)
	 */
	async findDuplicateTasks(): Promise<Map<string, string[]>> {
		try {
			const tasks = await db.tasks.toArray();
			const taskIdToFiles = new Map<string, string[]>();

			// Build map of taskId -> files where it appears
			for (const lt of tasks) {
				if (lt.taskId && lt.file) {
					if (!taskIdToFiles.has(lt.taskId)) {
						taskIdToFiles.set(lt.taskId, []);
					}
					taskIdToFiles.get(lt.taskId)!.push(lt.file);
				}
			}

			// Filter to only duplicates (appears in multiple files)
			const duplicates = new Map<string, string[]>();
			for (const [taskId, files] of taskIdToFiles) {
				if (files.length > 1) {
					duplicates.set(taskId, files);
				}
			}

			return duplicates;
		} catch (error) {
			log.error("Error finding duplicate tasks:", error);
			return new Map();
		}
	}

	/**
	 * Get filepath where a task is located
	 */
	async getFilepathForTask(taskId: string): Promise<string | undefined> {
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			return localTask?.file || undefined;
		} catch (error) {
			log.error(`Error getting filepath for task ${taskId}:`, error);
			return undefined;
		}
	}

	/**
	 * Get filepath for a project (based on file's default project)
	 */
	async getFilepathForProject(projectId: string): Promise<string | undefined> {
		try {
			const files = await getAllFiles();
			const file = files.find(f => f.defaultProjectId === projectId);
			return file?.path;
		} catch (error) {
			log.error(`Error getting filepath for project ${projectId}:`, error);
			return undefined;
		}
	}

	/**
	 * Get summary statistics for all files
	 * Useful for debugging and admin operations
	 */
	async getFileSummaries(): Promise<Array<{
		filepath: string;
		taskCount: number;
		defaultProject?: string;
	}>> {
		try {
			const files = await getAllFiles();
			const summaries = [];

			for (const file of files) {
				const count = await this.getTaskCountInFile(file.path);
				summaries.push({
					filepath: file.path,
					taskCount: count,
					defaultProject: file.defaultProjectId
				});
			}

			return summaries;
		} catch (error) {
			log.error("Error getting file summaries:", error);
			return [];
		}
	}

	/**
	 * Check if a file has a default project ID associated
	 */
	async filepathHasDefaultProjectID(filepath: string): Promise<boolean> {
		try {
			const file = await getFile(filepath);
			return !!(file && file.defaultProjectId);
		} catch (error) {
			log.error(`Error checking default project ID for ${filepath}:`, error);
			return false;
		}
	}

	/**
	 * Get the default project ID for a filepath with fallback chain
	 * Falls back: file.defaultProjectId → settings.defaultProjectId → settings.inboxID
	 */
	async getDefaultProjectIdForFilepath(filepath: string): Promise<string | undefined> {
		try {
			const file = await getFile(filepath);
			if (file && file.defaultProjectId) {
				return file.defaultProjectId;
			}
			let defaultProjectId = getSettings().defaultProjectId;
			if (!defaultProjectId) {
				defaultProjectId = getSettings().inboxID;
			}
			return defaultProjectId;
		} catch (error) {
			log.error(`Error getting default project ID for ${filepath}:`, error);
			return undefined;
		}
	}

	/**
	 * Get items for deletion confirmation modal
	 */
	async getDeletionItems(taskIds: string[]): Promise<Array<{ title: string; filePath: string }>> {
		try {
			const items: Array<{ title: string; filePath: string }> = [];

			for (const taskId of taskIds) {
				const localTask = await db.tasks.where("taskId").equals(taskId).first();
				if (localTask) {
					items.push({
						title: localTask.task.title || taskId,
						filePath: localTask.file || "Unknown"
					});
				}
			}

			return items;
		} catch (error) {
			log.error("Error getting deletion items:", error);
			return [];
		}
	}
}
