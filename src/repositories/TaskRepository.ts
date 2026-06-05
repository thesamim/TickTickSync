/**
 * TaskRepository - Responsible for all database operations related to tasks
 * Extracts database access logic from CacheOperation
 */

import { db } from "@/db/dexie";
import type { ITask } from "@/api/types/Task";
import type { LocalTask } from "@/db/schema";
import log from "@/utils/logger";
import { getCurrentDeviceInfo } from "@/db/device";

export class TaskRepository {
	/**
	 * Load a task by its TickTick ID
	 */
	async loadTaskById(taskId: string): Promise<ITask | undefined> {
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			return localTask?.task;
		} catch (error) {
			log.error(`Error loading task ${taskId}:`, error);
			return undefined;
		}
	}

	/**
	 * Load a LocalTask by its TickTick ID
	 */
	async loadLocalTaskById(taskId: string): Promise<LocalTask | undefined> {
		try {
			return await db.tasks.where("taskId").equals(taskId).first();
		} catch (error) {
			log.error(`Error loading local task ${taskId}:`, error);
			return undefined;
		}
	}

	/**
	 * Load all tasks from the database
	 */
	async loadAllTasks(): Promise<ITask[]> {
		try {
			const localTasks = await db.tasks.toArray();
			return localTasks.map(lt => lt.task);
		} catch (error) {
			log.error("Error loading all tasks:", error);
			return [];
		}
	}

	/**
	 * Load tasks for a specific file
	 */
	async loadTasksForFile(filepath: string): Promise<ITask[]> {
		try {
			const localTasks = await db.tasks.where("file").equals(filepath).toArray();
			return localTasks.map(lt => lt.task);
		} catch (error) {
			log.error(`Error loading tasks for file ${filepath}:`, error);
			return [];
		}
	}

	/**
	 * Load tasks by project ID
	 */
	async loadTasksByProjectId(projectId: string): Promise<ITask[]> {
		try {
			const localTasks = await db.tasks.toArray();
			return localTasks
				.filter(lt => lt.task.projectId === projectId)
				.map(lt => lt.task);
		} catch (error) {
			log.error(`Error loading tasks for project ${projectId}:`, error);
			return [];
		}
	}

	/**
	 * Load tasks by tag/label
	 */
	async loadTasksByTag(tag: string): Promise<LocalTask[]> {
		try {
			const normalizedTag = tag.toLowerCase();
			const allTasks = await db.tasks.toArray();
			return allTasks.filter(lt =>
				lt.task.tags?.some(t => t.toLowerCase() === normalizedTag)
			);
		} catch (error) {
			log.error(`Error loading tasks with tag ${tag}:`, error);
			return [];
		}
	}

	/**
	 * Save or update a task
	 */
	async upsertTask(task: ITask, filepath?: string, timestamp?: number): Promise<void> {
		try {
			const existingTask = await db.tasks.where("taskId").equals(task.id).first();
			const now = timestamp || Date.now();
			const deviceId = getCurrentDeviceInfo()?.deviceId || "unknown";

			if (existingTask) {
				// Preserve reminder fields from the existing task if the incoming task lacks them
				if ((!task.reminders || task.reminders.length === 0) && existingTask.task.reminders?.length) {
					task.reminders = existingTask.task.reminders;
				}
				if (!task.reminder && existingTask.task.reminder) {
					task.reminder = existingTask.task.reminder;
				}
				if (!task.remindTime && existingTask.task.remindTime) {
					task.remindTime = existingTask.task.remindTime;
				}
			if (!task.repeatFlag && existingTask.task.repeatFlag) {
				task.repeatFlag = existingTask.task.repeatFlag;
				task.repeatFrom = existingTask.task.repeatFrom;
			}

				// Update existing
				await db.tasks.update(existingTask.localId, {
					task: task,
					updatedAt: now,
					lastModifiedByDeviceId: deviceId,
					...(filepath && { file: filepath, lastVaultSync: now })
				});
			} else {
				// Create new
				const newLocalTask: LocalTask = {
					localId: `tt:${task.id}`,
					taskId: task.id,
					task: task,
					updatedAt: now,
					lastModifiedByDeviceId: deviceId,
					file: filepath || "",
					source: "obsidian",
					lastVaultSync: filepath ? now : undefined
				};
				await db.tasks.put(newLocalTask);
			}
		} catch (error) {
			log.error(`Error upserting task ${task.id}:`, error);
			throw error;
		}
	}

	/**
	 * Delete a task by ID
	 */
	async deleteTask(taskId: string): Promise<void> {
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			if (localTask) {
				// Mark as deleted rather than hard delete (tombstone pattern)
				await db.tasks.update(localTask.localId, {
					deleted: true,
					updatedAt: Date.now(),
					lastModifiedByDeviceId: getCurrentDeviceInfo()?.deviceId || "unknown"
				});
			}
		} catch (error) {
			log.error(`Error deleting task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Delete multiple tasks by IDs
	 */
	async deleteTasks(taskIds: string[]): Promise<void> {
		try {
			const localTasks = await db.tasks.where("taskId").anyOf(taskIds).toArray();
			const updates = localTasks.map(lt => ({
				localId: lt.localId,
				changes: {
					deleted: true,
					updatedAt: Date.now(),
					lastModifiedByDeviceId: getCurrentDeviceInfo()?.deviceId || "unknown"
				}
			}));

			await db.transaction("rw", db.tasks, async () => {
				for (const update of updates) {
					await db.tasks.update(update.localId, update.changes);
				}
			});
		} catch (error) {
			log.error("Error deleting multiple tasks:", error);
			throw error;
		}
	}

	/**
	 * Mark a task as completed
	 */
	async closeTask(taskId: string): Promise<string | undefined> {
		try {
			const localTask = await this.loadLocalTaskById(taskId);
			if (localTask) {
				localTask.task.status = 2; // TickTick completed status
				await this.upsertTask(localTask.task);
				return localTask.task.projectId;
			}
			return undefined;
		} catch (error) {
			log.error(`Error closing task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Mark a task as incomplete/open
	 */
	async reopenTask(taskId: string): Promise<string | undefined> {
		try {
			const localTask = await this.loadLocalTaskById(taskId);
			if (localTask) {
				localTask.task.status = 0; // TickTick open status
				await this.upsertTask(localTask.task);
				return localTask.task.projectId;
			}
			return undefined;
		} catch (error) {
			log.error(`Error reopening task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Get the project ID for a task
	 */
	async getProjectIdForTask(taskId: string): Promise<string | undefined> {
		try {
			const task = await this.loadTaskById(taskId);
			return task?.projectId;
		} catch (error) {
			log.error(`Error getting project ID for task ${taskId}:`, error);
			return undefined;
		}
	}

	/**
	 * Get count of tasks
	 */
	async getTaskCount(): Promise<number> {
		try {
			return await db.tasks.count();
		} catch (error) {
			log.error("Error getting task count:", error);
			return 0;
		}
	}

	/**
	 * Check if a task exists
	 */
	async taskExists(taskId: string): Promise<boolean> {
		try {
			const task = await db.tasks.where("taskId").equals(taskId).first();
			return !!task;
		} catch (error) {
			log.error(`Error checking if task ${taskId} exists:`, error);
			return false;
		}
	}
}
