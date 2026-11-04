import { db } from "./dexie";
import type { IProject } from '@/api/types/Project';
import type { IProjectGroup } from '@/api/types/ProjectGroup';
import type { LocalProject, LocalProjectGroup } from '@/db/schema';

export async function upsertProjects(projects: IProject[]) {
	const localProjects: LocalProject[] = projects.map(p => ({
		id: p.id,
		project: p
	}));
	await db.projects.bulkPut(localProjects);
}

/**
 * Store the freshly fetched projects without losing the lifecycle flags
 * (archived / deleted / syncPaused) that were set on a previous sync.
 */
export async function upsertProjectsPreservingState(projects: IProject[]): Promise<void> {
	const existing = await getAllLocalProjects();
	const existingById = new Map(existing.map(lp => [lp.id, lp]));

	const localProjects: LocalProject[] = projects.map(p => {
		const previous = existingById.get(p.id);
		return {
			id: p.id,
			project: p,
			archived: previous?.archived,
			deleted: previous?.deleted,
			syncPaused: previous?.syncPaused,
			archivedFromPath: previous?.archivedFromPath,
			restoreSkipped: previous?.restoreSkipped
		};
	});

	await db.projects.bulkPut(localProjects);
}

export async function upsertProjectGroups(groups: IProjectGroup[]) {
	const localGroups: LocalProjectGroup[] = groups.map(g => ({
		id: g.id,
		group: g
	}));
	await db.projectGroups.bulkPut(localGroups);
}

export async function getAllProjects(): Promise<IProject[]> {
	const lps = await db.projects.toArray();
	return lps.map(lp => lp.project);
}

/**
 * All cached projects, including the lifecycle flags.
 */
export async function getAllLocalProjects(): Promise<LocalProject[]> {
	return db.projects.toArray();
}

export async function getProjectById(id: string): Promise<IProject | undefined> {
	const lp = await db.projects.get(id);
	return lp?.project;
}

export async function getLocalProjectById(id: string): Promise<LocalProject | undefined> {
	return db.projects.get(id);
}

/**
 * Update the lifecycle flags of a cached project.
 */
export async function updateProjectState(
	id: string,
	changes: Partial<Pick<LocalProject, 'archived' | 'deleted' | 'syncPaused' | 'archivedFromPath' | 'restoreSkipped'>>
): Promise<void> {
	const existing = await db.projects.get(id);
	if (!existing) return;
	await db.projects.put({ ...existing, ...changes });
}

/**
 * Remove a project from the cache entirely.
 */
export async function deleteProject(id: string): Promise<void> {
	await db.projects.delete(id);
}

/**
 * Projects that should still take part in syncing: lists that are neither
 * gone from TickTick nor paused by the user.
 */
export async function getSyncableProjects(): Promise<IProject[]> {
	const lps = (await db.projects?.toArray?.()) ?? [];
	return lps
		.filter(lp => !lp.deleted && !lp.syncPaused)
		.map(lp => lp.project);
}

/**
 * Ids of the lists the plugin must leave alone (paused or deleted).
 */
export async function getPausedProjectIds(): Promise<Set<string>> {
	const lps = (await db.projects?.toArray?.()) ?? [];
	return new Set(lps.filter(lp => lp.syncPaused || lp.deleted).map(lp => lp.id));
}

/**
 * A list is archived when TickTick reports it as closed. The API has returned
 * this as a boolean, a number or a string over time.
 */
export function isProjectArchived(project: IProject): boolean {
	const closed = (project as { closed?: unknown })?.closed;
	if (closed === true || closed === 1) return true;
	if (typeof closed === 'string') {
		const value = closed.toLowerCase();
		return value === 'true' || value === '1';
	}
	return false;
}

/**
 * Projects that may be picked from a dropdown: archived, deleted and paused
 * lists are excluded. When a freshly fetched project list is supplied (for
 * example straight from TickTick), lists created since the last sync are
 * included as well, so brand-new task-less lists can be selected immediately.
 */
export async function getSelectableProjects(freshProjects?: IProject[] | null): Promise<IProject[]> {
	const lps = (await db.projects?.toArray?.()) ?? [];
	const hidden = new Set(
		lps
			.filter(lp => lp.archived || lp.deleted || lp.syncPaused || isProjectArchived(lp.project))
			.map(lp => lp.id)
	);

	const byId = new Map<string, IProject>();
	for (const lp of lps) {
		if (!lp.project || hidden.has(lp.id)) continue;
		byId.set(lp.id, lp.project);
	}

	for (const project of freshProjects ?? []) {
		if (!project?.id) continue;
		if (project.deleted || isProjectArchived(project)) continue;
		// Respect the lifecycle decision already stored locally (the list may
		// have been archived/paused here before the next TickTick sync).
		if (hidden.has(project.id)) continue;
		byId.set(project.id, project);
	}

	return [...byId.values()];
}
