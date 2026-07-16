/**
 * FolderSyncService - Manages folder structure for TickTick project groups
 * Handles folder path determination, creation, and file movement based on projectGroups
 */

import { App, Notice, TFile } from 'obsidian';
import type { ITask } from '@/api/types/Task';
import { db } from '@/db/dexie';
import { getDefaultFolder, getSettings } from '@/settings';
import { ProjectGroupRepository } from '@/repositories/ProjectGroupRepository';
import { getProjectById } from '@/db/projects';
import log from '@/utils/logger';
import type TickTickSync from '@/main';

export class FolderSyncService {
	private app: App;
	private projectGroupRepo: ProjectGroupRepository;
	private plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync, projectGroupRepo: ProjectGroupRepository) {
		this.app = app;
		this.projectGroupRepo = projectGroupRepo;
		this.plugin = plugin;
	}

	/**
	 * Get the folder path for a given project
	 * Returns the appropriate folder based on keepProjectFolders setting and project's groupId
	 * @param projectId - The project ID
	 * @returns Folder path (without trailing slash)
	 */
	async getFolderPathForProject(projectId: string, groupIdOverride?: string): Promise<string> {
		const settings = getSettings();
		const basePath = getDefaultFolder();

		// If folder organization is disabled, return base path
		if (!settings.keepProjectFolders) {
			return basePath;
		}

		try {
			// Use override groupId if provided (fresh TickTick data), otherwise read from DB cache
			let groupId = groupIdOverride;
			if (!groupId) {
				const project = await getProjectById(projectId);
				if (!project) {
					log.warn(`Project ${projectId} not found, using base path`);
					return basePath;
				}
				groupId = project.groupId;
			}

			if (!groupId) {
				log.debug(`Project ${projectId} has no groupId, using base path`);
				return basePath;
			}

			// Get the project group
			const projectGroup = await this.projectGroupRepo.getProjectGroupById(groupId);
			if (!projectGroup) {
				log.warn(`ProjectGroup ${groupId} not found, using base path`);
				return basePath;
			}

			// Construct folder path: basePath/groupName
			const folderName = this.sanitizeFolderName(projectGroup.name);
			return basePath ? `${basePath}/${folderName}` : folderName;
		} catch (error) {
			log.error(`Error getting folder path for project ${projectId}:`, error);
			return basePath;
		}
	}

	/**
	 * Get the folder path for a given task
	 * @param task - The task
	 * @returns Folder path (without trailing slash)
	 */
	async getFolderPathForTask(task: ITask): Promise<string> {
		return this.getFolderPathForProject(task.projectId);
	}

	/**
	 * Ensure a folder exists, creating it if necessary
	 * @param folderPath - The folder path to ensure exists
	 */
	async ensureFolderExists(folderPath: string): Promise<void> {
		if (!folderPath || folderPath === '') {
			return; // Root vault folder always exists
		}

		try {
			// Create nested folders one segment at a time (Obsidian may not create parents automatically)
			const parts = folderPath.split('/').filter(Boolean);
			let current = '';
			for (const part of parts) {
				current = current ? `${current}/${part}` : part;
				const existing = this.app.vault.getAbstractFileByPath(current);

			if (!existing) {
				log.debug(`Creating folder: ${current}`);
				try {
					await this.createFolderCompat(current);
				} catch (e) {
					if (e instanceof Error && e.message.includes('Folder already exists')) {
						return;
					}
					throw e;
				}
			} else if (existing instanceof TFile) {
					log.error(`Cannot create folder ${current}: a file with this name already exists`);
					throw new Error(`Path conflict: ${current} is a file, not a folder`);
				}
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes('Folder already exists')) {
				// Folder was created between check and creation, this is fine
				return;
			}
			log.error(`Error ensuring folder exists ${folderPath}:`, error);
			throw error;
		}
	}

	/**
	 * Check if a file should be managed by the plugin (moved/organized automatically)
	 * Unassociated files (no defaultProjectId) are user-managed
	 * @param filepath - The file path
	 * @returns True if plugin should manage the file location
	 */
	async shouldManageFile(filepath: string): Promise<boolean> {
		try {
			const fileRecord = await db.files.get(filepath);

			// If no file record exists, it's unassociated (user-managed)
			if (!fileRecord) {
				return false;
			}

			// If explicitly marked as user-managed
			if (fileRecord.managedByPlugin === false) {
				return false;
			}

			// If file has no defaultProjectId, it's unassociated (user-managed)
			if (!fileRecord.defaultProjectId) {
				return false;
			}

			// File has a defaultProjectId, so plugin manages it
			return true;
		} catch (error) {
			log.error(`Error checking if file ${filepath} should be managed:`, error);
			// Default to not managing on error (safer)
			return false;
		}
	}

	/**
	 * Move a file to the appropriate project folder
	 * @param oldPath - Current file path
	 * @param newFolderPath - Target folder path
	 * @param filename - The filename (e.g., "ProjectName.md")
	 * @returns The new file path or undefined if move failed
	 */
	async moveFileToProjectFolder(
		oldPath: string,
		newFolderPath: string,
		filename: string
	): Promise<string | undefined> {
		try {
			// Check if file should be managed
			const shouldManage = await this.shouldManageFile(oldPath);
			if (!shouldManage) {
				log.debug(`File ${oldPath} is user-managed, not moving`);
				return oldPath; // Return original path, don't move
			}

			// Construct new path
			const newPath = newFolderPath ? `${newFolderPath}/${filename}` : filename;

			// If paths are the same, nothing to do
			if (oldPath === newPath) {
				return oldPath;
			}

			// Ensure target folder exists
			if (newFolderPath) {
				await this.ensureFolderExists(newFolderPath);
			}

			// Get the file
			const file = this.app.vault.getAbstractFileByPath(oldPath);
			if (!(file instanceof TFile)) {
				log.warn(`File ${oldPath} not found or is not a file`);
				return undefined;
			}

			// Check if destination already exists
			const existingFile = this.app.vault.getAbstractFileByPath(newPath);
			if (existingFile) {
				log.warn(`File ${newPath} already exists, cannot move ${oldPath}`);
				new Notice(`Cannot move file: ${newPath} already exists`);
				return undefined;
			}

			// Perform the move
			log.info(`Moving file from ${oldPath} to ${newPath}`);

			await this.app.fileManager.renameFile(file, newPath);

			// Update database records
			await this.updateFilePathInDatabase(oldPath, newPath);

			return newPath;
		} catch (error) {
			log.error(`Error moving file from ${oldPath} to ${newFolderPath}/${filename}:`, error);
			new Notice(`Error moving file: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return undefined;
		}
	}

	/**
	 * Get the complete file path for a task (folder + filename)
	 * @param task - The task
	 * @param projectName - The project name (used as filename)
	 * @returns Complete file path
	 */
	async getFilePathForTask(task: ITask, projectName: string): Promise<string> {
		return this.getFilePathForProject(task.projectId, projectName);
	}

	/**
	 * Get the complete file path for a project (folder + filename)
	 * Centralizes path construction so all callers (rename detection, sync, etc.)
	 * produce the same path for the same project.
	 * @param projectId - The project ID
	 * @param projectName - The project name (used as filename)
	 * @returns Complete file path
	 */
	async getFilePathForProject(projectId: string, projectName: string, groupIdOverride?: string): Promise<string> {
		const folderPath = await this.getFolderPathForProject(projectId, groupIdOverride);
		const sanitizedProjectName = this.sanitizeFolderName(projectName);

		if (folderPath) {
			return `${folderPath}/${ sanitizedProjectName}.md`;
		}
		return `${sanitizedProjectName}.md`;
	}

	/**
	 * Check if two projects are in different project groups
	 * @param projectId1 - First project ID
	 * @param projectId2 - Second project ID
	 * @returns True if projects are in different groups
	 */
	async projectsInDifferentGroups(projectId1: string, projectId2: string): Promise<boolean> {
		try {
			const project1 = await getProjectById(projectId1);
			const project2 = await getProjectById(projectId2);

			// If either project not found, consider them different
			if (!project1 || !project2) {
				return true;
			}

			// Compare groupIds (treating undefined/null as equivalent)
			const groupId1 = project1.groupId || null;
			const groupId2 = project2.groupId || null;

			return groupId1 !== groupId2;
		} catch (error) {
			log.error(`Error comparing project groups for ${projectId1} and ${projectId2}:`, error);
			return false;
		}
	}

	/**
	 * Get the project group that corresponds to a folder path
	 * @param folderPath - The folder path relative to base
	 * @returns The project group ID or undefined if not found
	 */
	async getProjectGroupIdFromFolder(folderPath: string): Promise<string | undefined> {
		if (!folderPath) {
			return undefined;
		}

		try {
			// Get all project groups
			const allGroups = await this.projectGroupRepo.getAllProjectGroups();

			// Normalize folder path for comparison
			const normalizedFolder = folderPath.toLowerCase().trim();

			// Find matching group by name
			for (const group of allGroups) {
				const sanitizedGroupName = this.sanitizeFolderName(group.name).toLowerCase();
				if (sanitizedGroupName === normalizedFolder) {
					return group.id;
				}
			}

			return undefined;
		} catch (error) {
			log.error(`Error getting project group from folder ${folderPath}:`, error);
			return undefined;
		}
	}

	/**
	 * Get a project in a specific group, or the first project in that group
	 * @param groupId - The project group ID
	 * @param preferredProjectId - Optional preferred project ID to return if it's in the group
	 * @returns A project ID in the group, or undefined
	 */
	async getProjectInGroup(groupId: string, preferredProjectId?: string): Promise<string | undefined> {
		try {
			// If preferred project is specified, check if it's in this group
			if (preferredProjectId) {
				const project = await getProjectById(preferredProjectId);
				if (project && project.groupId === groupId) {
					return preferredProjectId;
				}
			}

			// Get all projects in this group
			const projectsInGroup = await this.projectGroupRepo.getProjectsByGroupId(groupId);

			if (projectsInGroup.length === 0) {
				log.warn(`No projects found in group ${groupId}`);
				return undefined;
			}

			// Return the first project
			return projectsInGroup[0].id;
		} catch (error) {
			log.error(`Error getting project in group ${groupId}:`, error);
			return undefined;
		}
	}

	/**
	 * Determine if a file move represents a project group change
	 * @param oldPath - Old file path
	 * @param newPath - New file path
	 * @returns Object with change info: { changed: boolean, oldGroupId?, newGroupId?, newProjectId? }
	 */
	async detectProjectGroupChange(oldPath: string, newPath: string): Promise<{
		changed: boolean;
		newGroupId?: string;
		newProjectId?: string;
		newProjectName?: string;
	}> {
		const settings = getSettings();

		// Only detect changes if folder organization is enabled
		if (!settings.keepProjectFolders) {
			return { changed: false };
		}

		try {
			// If folders are the same, no change
			if (oldPath === newPath) {
				return { changed: false };
			}

			// Extract folder names from paths
			const oldLocation = this.extractFolderFromPath(oldPath);
			const newLocation = this.extractFolderFromPath(newPath);



			// Get project group IDs from folder names
			const oldGroupId = oldLocation.folders ? await this.getProjectGroupIdFromFolder(oldLocation.folders) : undefined;
			const newGroupId = newLocation.folders ? await this.getProjectGroupIdFromFolder(newLocation.folders) : undefined;

			//no changes? return
			if ((oldLocation.filename === newLocation.filename) && (oldGroupId === newGroupId)) {
				return { changed: false };
			}

			//First lookup by oldpath
			let newProjectId = await this.plugin.fileTaskQueries.getDefaultProjectForFile(oldPath);
			if (!newProjectId) {
				//Just moved from TT.
				newProjectId = await this.plugin.fileTaskQueries.getDefaultProjectForFile(newPath);
				if (newProjectId) {
					//do nothing.
					log.debug("File already moved")
					return { changed: false };
				}
			}
			let newProjectName;
			if (oldLocation.filename === newLocation.filename) {
				const projectRecord = newProjectId ? await db.projects.get(newProjectId) : undefined;
				newProjectName = projectRecord?.project?.name;
			}
			else {
				newProjectName = newLocation.filename.replace('.md', '');
			}

			return {
				changed: true,
				newGroupId,
				newProjectId,
				newProjectName
			};
		} catch (error) {
			log.error(`Error detecting location change for ${oldPath} -> ${newPath}:`, error);
			return { changed: false };
		}
	}

	/**
	 * Update file path references in the database after a move
	 * @param oldPath - Old file path
	 * @param newPath - New file path
	 */
	private async updateFilePathInDatabase(oldPath: string, newPath: string): Promise<void> {
		try {
			// Update all tasks that reference this file
			const tasks = await db.tasks.where('file').equals(oldPath).toArray();
			for (const task of tasks) {
				await db.tasks.update(task.localId, { file: newPath });
			}

			// Update file metadata record
			const fileRecord = await db.files.get(oldPath);
			if (fileRecord) {
				await db.files.delete(oldPath);
				await db.files.put({
					...fileRecord,
					path: newPath
				});
			}

			log.debug(`Updated ${tasks.length} task references from ${oldPath} to ${newPath}`);
		} catch (error) {
			log.error(`Error updating file path in database from ${oldPath} to ${newPath}:`, error);
		}
	}

	/**
	 * Sanitize a folder name to be filesystem-safe
	 * @param name - The folder name
	 * @returns Sanitized folder name
	 */
	/**
	 * Create a folder using the vault API, compatible with older Obsidian versions
	 */
	private async createFolderCompat(path: string): Promise<void> {
		const methodName = 'createFolder' as const;
		await (this.app.vault as unknown as Record<string, (p: string) => Promise<unknown>>)[methodName](path);
	}

	private sanitizeFolderName(name: string): string {
		// Replace invalid filesystem characters
		return name
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/\s+/g, ' ')
			.trim();
	}

	/**
	 * Extract folder name from a file path (the immediate parent folder)
	 * @param filepath - The file path (e.g., "GroupName/ProjectName.md")
	 * @returns The folder name or null if file is in root
	 */
	private extractFolderFromPath(filepath: string): { folders: string, filename: string } {
		const lastSlash = filepath.lastIndexOf('/');
		if (lastSlash === -1) {
			return { folders: '', filename: filepath };
		}
		return {
			folders: filepath.substring(0, lastSlash),
			filename: filepath.substring(lastSlash + 1)
		};
	}
}
