import type TickTickSync from '@/main';
import type { IProject } from '@/api/types/Project';
import { getSelectableProjects } from '@/db/projects';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

export type ProjectOption = Pick<IProject, 'id' | 'name'>;

/**
 * Turn a project list into the `id -> name` map used by `<select>` dropdowns.
 */
export function buildProjectOptions(projects: ProjectOption[]): Record<string, string> {
	const options: Record<string, string> = {};
	for (const project of projects) {
		options[project.id] = project.name;
	}
	return options;
}

/**
 * Projects from the local cache. Archived, deleted and paused lists are
 * excluded.
 */
export async function loadCachedProjectOptions(plugin: TickTickSync): Promise<ProjectOption[]> {
	try {
		return await getSelectableProjects();
	} catch {
		return await plugin.service.getProjects?.() ?? [];
	}
}

/**
 * Ask TickTick for the current project list so lists created since the last
 * sync (even ones without tasks) show up in pickers without waiting for a
 * synchronization. Returns `undefined` when the request failed, so callers can
 * keep showing the cached list.
 */
export async function loadFreshProjectOptions(plugin: TickTickSync): Promise<ProjectOption[] | undefined> {
	// Not logged in: nothing to fetch, and avoid triggering a login notice just
	// from opening the settings tab.
	if (!getSettings().token) return undefined;
	try {
		const freshProjects = await plugin.tickTickRestAPI?.GetAllProjects();
		if (!freshProjects) return undefined;
		return await getSelectableProjects(freshProjects);
	} catch (error) {
		log.debug('Could not refresh the project list from TickTick:', error);
		return undefined;
	}
}
