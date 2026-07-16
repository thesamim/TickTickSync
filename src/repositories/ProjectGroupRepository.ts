/**
 * ProjectGroupRepository - Data access layer for ProjectGroups
 * Provides methods to query projectGroups and their relationships with projects
 */

import { db } from '@/db/dexie';
import type { IProjectGroup } from '@/api/types/ProjectGroup';
import type { IProject } from '@/api/types/Project';
import log from '@/utils/logger';

export class ProjectGroupRepository {
	/**
	 * Get a project group by its ID
	 * @param groupId - The project group ID
	 * @returns The project group or undefined if not found
	 */
	async getProjectGroupById(groupId: string): Promise<IProjectGroup | undefined> {
		try {
			const localGroup = await db.projectGroups.get(groupId);
			return localGroup?.group;
		} catch (error) {
			log.error(`Error getting project group ${groupId}:`, error);
			return undefined;
		}
	}

	/**
	 * Get all project groups
	 * @returns Array of all project groups
	 */
	async getAllProjectGroups(): Promise<IProjectGroup[]> {
		try {
			const localGroups = await db.projectGroups.toArray();
			return localGroups.map(lg => lg.group);
		} catch (error) {
			log.error('Error getting all project groups:', error);
			return [];
		}
	}

	/**
	 * Get all projects that belong to a specific project group
	 * @param groupId - The project group ID
	 * @returns Array of projects in the group
	 */
	async getProjectsByGroupId(groupId: string): Promise<IProject[]> {
		try {
			const allProjects = await db.projects.toArray();
			return allProjects
				.filter(lp => lp.project.groupId === groupId)
				.map(lp => lp.project);
		} catch (error) {
			log.error(`Error getting projects for group ${groupId}:`, error);
			return [];
		}
	}

	/**
	 * Get the project group for a given project
	 * @param projectId - The project ID
	 * @returns The project group or undefined if project has no group or not found
	 */
	async getProjectGroupForProject(projectId: string): Promise<IProjectGroup | undefined> {
		try {
			const localProject = await db.projects.get(projectId);
			if (!localProject?.project.groupId) {
				return undefined;
			}
			return this.getProjectGroupById(localProject.project.groupId);
		} catch (error) {
			log.error(`Error getting project group for project ${projectId}:`, error);
			return undefined;
		}
	}

	/**
	 * Check if a project belongs to a specific group
	 * @param projectId - The project ID
	 * @param groupId - The group ID to check
	 * @returns True if project belongs to the group
	 */
	async projectBelongsToGroup(projectId: string, groupId: string): Promise<boolean> {
		try {
			const localProject = await db.projects.get(projectId);
			return localProject?.project.groupId === groupId;
		} catch (error) {
			log.error(`Error checking if project ${projectId} belongs to group ${groupId}:`, error);
			return false;
		}
	}

	/**
	 * Get project group name by ID
	 * @param groupId - The project group ID
	 * @returns The group name or undefined
	 */
	async getProjectGroupName(groupId: string): Promise<string | undefined> {
		const group = await this.getProjectGroupById(groupId);
		return group?.name;
	}
}
