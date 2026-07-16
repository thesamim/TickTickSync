/**
 * FileMetadataService - Manages file-to-task mappings and file metadata
 * Extracts metadata management logic from CacheOperation
 */

import { db } from "@/db/dexie";
import { getAllFiles, getFile, upsertFile, deleteFile } from "@/db/files";
import type { ITask } from "@/api/types/Task";
import log from "@/utils/logger";

export interface FileMetadata {
	[fileName: string]: FileDetail;
}

export interface FileDetail {
	TickTickTasks: TaskDetail[];
	TickTickCount: number;
	defaultProjectId?: string;
}

export interface TaskDetail {
	taskId: string;
	taskItems: string[];
}

export class FileMetadataService {
	/**
	 * Get metadata for a specific file
	 */
	async getFileMetadata(filepath: string, projectId?: string): Promise<FileDetail | undefined> {
		try {
			const file = await getFile(filepath);
			if (file) {
				const tasksInFile = await db.tasks.where("file").equals(filepath).toArray();
				return {
					TickTickTasks: tasksInFile.map(lt => ({
						taskId: lt.taskId,
						taskItems: lt.task.items?.map(i => i.id) || []
					})),
					TickTickCount: tasksInFile.length,
					defaultProjectId: file.defaultProjectId
				};
			}

			// Create empty metadata if file doesn't exist
			if (projectId) {
				await upsertFile(filepath, projectId);
				return {
					TickTickTasks: [],
					TickTickCount: 0,
					defaultProjectId: projectId
				};
			}

			return undefined;
		} catch (error) {
			log.error(`Error getting file metadata for ${filepath}:`, error);
			return undefined;
		}
	}

	/**
	 * Get metadata for all files
	 */
	async getAllFileMetadata(): Promise<FileMetadata> {
		try {
			const files = await getAllFiles();
			const allTasks = await db.tasks.toArray();
			const tasksByFile = new Map<string, typeof allTasks>();

			for (const lt of allTasks) {
				if (lt.file) {
					if (!tasksByFile.has(lt.file)) tasksByFile.set(lt.file, []);
					tasksByFile.get(lt.file)!.push(lt);
				}
			}

			const metadata: FileMetadata = {};
			for (const file of files) {
				const tasksInFile = tasksByFile.get(file.path) || [];
				metadata[file.path] = {
					TickTickTasks: tasksInFile.map(lt => ({
						taskId: lt.taskId,
						taskItems: lt.task.items?.map(i => i.id) || []
					})),
					TickTickCount: tasksInFile.length,
					defaultProjectId: file.defaultProjectId
				};
			}

			return metadata;
		} catch (error) {
			log.error("Error getting all file metadata:", error);
			return {};
		}
	}

	/**
	 * Update file metadata
	 */
	async updateFileMetadata(filepath: string, metadata: FileDetail): Promise<void> {
		try {
			await upsertFile(filepath, metadata.defaultProjectId);
		} catch (error) {
			log.error(`Error updating file metadata for ${filepath}:`, error);
			throw error;
		}
	}

	/**
	 * Get the filepath where a task is located
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
	 * Get the filepath for a project ID (based on file's default project)
	 */
	async getFilepathForProjectId(projectId: string): Promise<string | undefined> {
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
	 * Get the default project name for a filepath
	 */
	async getDefaultProjectNameForFilepath(filepath: string): Promise<string | undefined> {
		try {
			const file = await getFile(filepath);
			if (!file?.defaultProjectId) return undefined;

			const project = await db.projects.get(file.defaultProjectId);
			return project?.project.name;
		} catch (error) {
			log.error(`Error getting default project name for ${filepath}:`, error);
			return undefined;
		}
	}

	/**
	 * Add a task to file metadata
	 */
	async addTaskToFile(filepath: string, task: ITask): Promise<void> {
		try {
			const file = await getFile(filepath);
			if (!file) {
				await upsertFile(filepath, task.projectId);
			}

			// Update the task's file association
			const localTask = await db.tasks.where("taskId").equals(task.id).first();
			if (localTask) {
				await db.tasks.update(localTask.localId, { file: filepath });
			}
		} catch (error) {
			log.error(`Error adding task ${task.id} to file ${filepath}:`, error);
			throw error;
		}
	}

	/**
	 * Remove a task from file metadata
	 */
	async removeTaskFromFile(filepath: string, taskId: string): Promise<void> {
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			if (localTask && localTask.file === filepath) {
				await db.tasks.update(localTask.localId, { file: "" });
			}
		} catch (error) {
			log.error(`Error removing task ${taskId} from file ${filepath}:`, error);
			throw error;
		}
	}

	/**
	 * Delete a file from metadata (and clear task associations)
	 */
	async deleteFileMetadata(filepath: string): Promise<void> {
		try {
			// Clear file association from all tasks in this file
			const tasksInFile = await db.tasks.where("file").equals(filepath).toArray();
			for (const lt of tasksInFile) {
				await db.tasks.update(lt.localId, { file: "" });
			}

			// Delete the file record
			await deleteFile(filepath);
		} catch (error) {
			log.error(`Error deleting file metadata for ${filepath}:`, error);
			throw error;
		}
	}

	/**
	 * Clear the file association for a task (by task ID regardless of current file)
	 */
	async clearTaskFile(taskId: string): Promise<void> {
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			if (localTask) {
				await db.tasks.update(localTask.localId, { file: "" });
			}
		} catch (error) {
			log.error(`Error clearing file for task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Update a file path (e.g., after rename)
	 */
	async updateFilePath(oldPath: string, newPath: string): Promise<void> {
		try {
			// Update all tasks that reference the old path
			const tasksInFile = await db.tasks.where("file").equals(oldPath).toArray();
			for (const lt of tasksInFile) {
				await db.tasks.update(lt.localId, { file: newPath });
			}

			// Update the file record
			const file = await getFile(oldPath);
			if (file) {
				await deleteFile(oldPath);
				await upsertFile(newPath, file.defaultProjectId);
			}
		} catch (error) {
			log.error(`Error updating file path from ${oldPath} to ${newPath}:`, error);
			throw error;
		}
	}

	/**
	 * Check for duplicate tasks across files
	 */
	async checkForDuplicates(filesMetadata: FileMetadata): Promise<{ duplicates: Record<string, string[]>; taskIds: Record<string, string> } | undefined> {
		try {
			const taskIdToFiles = new Map<string, string[]>();

			// Build a map of taskId -> files where it appears
			for (const [filepath, metadata] of Object.entries(filesMetadata)) {
				for (const taskDetail of metadata.TickTickTasks) {
					if (!taskIdToFiles.has(taskDetail.taskId)) {
						taskIdToFiles.set(taskDetail.taskId, []);
					}
					taskIdToFiles.get(taskDetail.taskId)!.push(filepath);
				}
			}

			// Find duplicates (tasks appearing in multiple files)
			const duplicates: Record<string, string[]> = {};
			const taskIds: Record<string, string> = {};

			for (const [taskId, files] of taskIdToFiles) {
				if (files.length > 1) {
					// First file is the "original", rest are duplicates
					taskIds[taskId] = files[0];
					duplicates[taskId] = files.slice(1);
				}
			}

			return {
				duplicates,
				taskIds
			};
		} catch (error) {
			log.error("Error checking for duplicates:", error);
			return undefined;
		}
	}

	/**
	 * Get items for deletion confirmation
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
