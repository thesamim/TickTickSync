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

export async function getAllProjectGroups(): Promise<IProjectGroup[]> {
	const lgs = await db.projectGroups.toArray();
	return lgs.map(lg => lg.group);
}

export async function getProjectById(id: string): Promise<IProject | undefined> {
	const lp = await db.projects.get(id);
	return lp?.project;
}
