import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IProject } from '@/api/types/Project';
import type { LocalProject } from '@/db/schema';

vi.mock('@/db/dexie', () => ({
	db: {
		projects: {
			toArray: vi.fn(),
			get: vi.fn(),
		},
	},
}));

import { db } from '@/db/dexie';
import { getSelectableProjects, isProjectArchived } from '@/db/projects';

function project(id: string, name: string, closed?: IProject['closed']): IProject {
	return { id, name, closed } as IProject;
}

function local(project: IProject, flags: Partial<LocalProject> = {}): LocalProject {
	return { id: project.id, project, ...flags } as LocalProject;
}

describe('isProjectArchived', () => {
	it('treats boolean, numeric and string closed values as archived', () => {
		expect(isProjectArchived(project('a', 'A', true))).toBe(true);
		expect(isProjectArchived(project('a', 'A', 1))).toBe(true);
		expect(isProjectArchived(project('a', 'A', 'true'))).toBe(true);
		expect(isProjectArchived(project('a', 'A', '1'))).toBe(true);
	});

	it('treats other values as active', () => {
		expect(isProjectArchived(project('a', 'A', false))).toBe(false);
		expect(isProjectArchived(project('a', 'A', 0))).toBe(false);
		expect(isProjectArchived(project('a', 'A', null))).toBe(false);
		expect(isProjectArchived(project('a', 'A'))).toBe(false);
	});
});

describe('getSelectableProjects', () => {
	beforeEach(() => {
		vi.mocked(db.projects.toArray).mockResolvedValue([]);
	});

	it('excludes archived, deleted and paused lists from the cache', async () => {
		vi.mocked(db.projects.toArray).mockResolvedValue([
			local(project('active', 'Active')),
			local(project('archived', 'Archived'), { archived: true }),
			local(project('closed', 'Closed', true)),
			local(project('deleted', 'Deleted'), { deleted: true }),
			local(project('paused', 'Paused'), { syncPaused: true }),
		]);

		const result = await getSelectableProjects();

		expect(result.map(p => p.id)).toEqual(['active']);
	});

	it('includes lists created in TickTick since the last sync', async () => {
		vi.mocked(db.projects.toArray).mockResolvedValue([
			local(project('cached', 'Cached')),
		]);

		const result = await getSelectableProjects([
			project('cached', 'Cached'),
			project('brand-new', 'Brand New'),
		]);

		expect(result.map(p => p.id)).toEqual(['cached', 'brand-new']);
	});

	it('does not include archived or deleted lists from TickTick', async () => {
		const result = await getSelectableProjects([
			project('active', 'Active'),
			project('archived', 'Archived', true),
			{ ...project('deleted', 'Deleted'), deleted: true },
		]);

		expect(result.map(p => p.id)).toEqual(['active']);
	});

	it('keeps locally archived or paused lists hidden even if TickTick reports them active', async () => {
		vi.mocked(db.projects.toArray).mockResolvedValue([
			local(project('archived', 'Archived'), { archived: true }),
			local(project('paused', 'Paused'), { syncPaused: true }),
		]);

		const result = await getSelectableProjects([
			project('archived', 'Archived'),
			project('paused', 'Paused'),
		]);

		expect(result).toEqual([]);
	});

	it('uses the fresh name when a list was renamed', async () => {
		vi.mocked(db.projects.toArray).mockResolvedValue([
			local(project('a', 'Old Name')),
		]);

		const result = await getSelectableProjects([project('a', 'New Name')]);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('New Name');
	});
});
