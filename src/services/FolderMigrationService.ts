/**
 * FolderMigrationService - Handles migration of existing flat file structure to folder structure
 * Reorganizes files when keepProjectFolders feature is enabled
 */

import { App, Notice } from 'obsidian';
import { db } from '@/db/dexie';
import { FolderSyncService } from '@/services/FolderSyncService';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

export class FolderMigrationService {
	private app: App;
	private folderSyncService: FolderSyncService;

	constructor(app: App, folderSyncService: FolderSyncService) {
		this.app = app;
		this.folderSyncService = folderSyncService;
	}

	/**
	 * Reorganize all files from flat structure to folder structure
	 * This is called when keepProjectFolders is enabled for the first time
	 * @returns Number of files moved
	 */
	async reorganizeFilesToFolders(): Promise<number> {
		const settings = getSettings();
		
		if (!settings.keepProjectFolders) {
			log.warn('Will not reorganize: keepProjectFolders is disabled');
			return 0;
		}

		log.info('Starting file reorganization into folders...');
		new Notice('Organizing task files into folders...');

		try {
			const filesToMove = await this.identifyFilesToMove();
			
			if (filesToMove.size === 0) {
				log.info('No files need to be moved');
				new Notice('All files are already organized');
				return 0;
			}

			log.info(`Found ${filesToMove.size} files to reorganize`);

			let successCount = 0;
			let errorCount = 0;

			// Process each file
			for (const [oldPath, moveInfo] of filesToMove) {
				try {
					const newPath = await this.folderSyncService.moveFileToProjectFolder(
						oldPath,
						moveInfo.newFolderPath,
						moveInfo.filename
					);

					if (newPath && newPath !== oldPath) {
						successCount++;
						log.debug(`Successfully moved ${oldPath} to ${newPath}`);
					} else if (newPath === oldPath) {
						// File was user-managed, not an error
						log.debug(`File ${oldPath} is user-managed, skipped`);
					}
				} catch (error) {
					errorCount++;
					log.error(`Failed to move ${oldPath}:`, error);
				}
			}

			const message = `Reorganization complete: ${successCount} files moved`;
			if (errorCount > 0) {
				new Notice(`${message}, ${errorCount} errors (see console)`);
			} else {
				new Notice(message);
			}

			log.info(`File reorganization complete: ${successCount} moved, ${errorCount} errors`);
			return successCount;
		} catch (error) {
			log.error('Error during file reorganization:', error);
			new Notice(`Error organizing files: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return 0;
		}
	}

	/**
	 * Identify which files need to be moved and where
	 * @returns Map of current path -> new location info
	 */
	private async identifyFilesToMove(): Promise<Map<string, { newFolderPath: string, filename: string }>> {
		const filesToMove = new Map<string, { newFolderPath: string, filename: string }>();

		try {
			// Get all files from database
			const allFiles = await db.files.toArray();

			for (const fileRecord of allFiles) {
				// Skip files without defaultProjectId (user-managed)
				if (!fileRecord.defaultProjectId) {
					log.debug(`Skipping unassociated file: ${fileRecord.path}`);
					continue;
				}

				// Skip explicitly user-managed files
				if (fileRecord.managedByPlugin === false) {
					log.debug(`Skipping user-managed file: ${fileRecord.path}`);
					continue;
				}

				// Calculate where this file should be
				const newFolderPath = await this.folderSyncService.getFolderPathForProject(fileRecord.defaultProjectId);
				
				// Extract filename from current path
				const filename = this.getFilename(fileRecord.path);
				
				// Construct what the new path would be
				const expectedPath = newFolderPath ? `${newFolderPath}/${filename}` : filename;

				// If paths differ, this file needs to move
				if (fileRecord.path !== expectedPath) {
					filesToMove.set(fileRecord.path, {
						newFolderPath,
						filename
					});
					log.debug(`File ${fileRecord.path} should move to ${expectedPath}`);
				}
			}
		} catch (error) {
			log.error('Error identifying files to move:', error);
		}

		return filesToMove;
	}

	/**
	 * Extract filename from a full path
	 * @param path - Full file path
	 * @returns Just the filename
	 */
	private getFilename(path: string): string {
		const parts = path.split('/');
		return parts[parts.length - 1];
	}

	/**
	 * Preview what changes would be made without actually moving files
	 * Useful for showing user what will happen before confirming
	 * @returns Array of { from, to } paths
	 */
	async previewReorganization(): Promise<Array<{ from: string, to: string }>> {
		const preview: Array<{ from: string, to: string }> = [];
		const filesToMove = await this.identifyFilesToMove();

		for (const [oldPath, moveInfo] of filesToMove) {
			const newPath = moveInfo.newFolderPath 
				? `${moveInfo.newFolderPath}/${moveInfo.filename}`
				: moveInfo.filename;
			preview.push({ from: oldPath, to: newPath });
		}

		return preview;
	}

	/**
	 * Mark a file as user-managed so it won't be automatically moved
	 * @param filepath - The file path to mark
	 */
	async markFileAsUserManaged(filepath: string): Promise<void> {
		try {
			const fileRecord = await db.files.get(filepath);
			if (fileRecord) {
				await db.files.update(filepath, { managedByPlugin: false });
				log.info(`Marked file ${filepath} as user-managed`);
			} else {
				// Create a new record
				await db.files.put({
					path: filepath,
					managedByPlugin: false
				});
				log.info(`Created user-managed file record for ${filepath}`);
			}
		} catch (error) {
			log.error(`Error marking file ${filepath} as user-managed:`, error);
		}
	}

	/**
	 * Mark a file as plugin-managed so it will be automatically organized
	 * @param filepath - The file path to mark
	 */
	async markFileAsPluginManaged(filepath: string): Promise<void> {
		try {
			const fileRecord = await db.files.get(filepath);
			if (fileRecord) {
				await db.files.update(filepath, { managedByPlugin: true });
				log.info(`Marked file ${filepath} as plugin-managed`);
			}
		} catch (error) {
			log.error(`Error marking file ${filepath} as plugin-managed:`, error);
		}
	}
}
