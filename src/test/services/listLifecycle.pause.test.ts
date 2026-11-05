import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IProject } from '@/api/types/Project';
import type { LocalProject } from '@/db/schema';

const projectTable = new Map<string, LocalProject>();

vi.mock('obsidian', () => ({
	App: class {},
	Modal: class {},
	Notice: vi.fn(),
	Setting: class {},
	TFile: class {},
}));

vi.mock('@/utils/logger', () => ({
	default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({
		handleArchivedLists: true,
		handleDeletedLists: true,
		archivedListsFolder: 'Archived',
		keepProjectFolders: true,
	})),
}));

vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			where: vi.fn(() => ({
				equals: vi.fn(() => ({
					toArray: vi.fn(async () => []),
				})),
			})),
			update: vi.fn(async () => 1),
			toArray: vi.fn(async () => []),
		},
	},
}));

vi.mock('@/db/projects', () => ({
	getAllLocalProjects: vi.fn(async () => [...projectTable.values()]),
	getLocalProjectById: vi.fn(async (id: string) => projectTable.get(id)),
	updateProjectState: vi.fn(async (id: string, changes: Partial<LocalProject>) => {
		const existing = projectTable.get(id);
		if (existing) Object.assign(existing, changes);
	}),
	deleteProject: vi.fn(async () => undefined),
}));

vi.mock('@/db/files', () => ({
	getAllFiles: vi.fn(async () => []),
	deleteFile: vi.fn(async () => undefined),
	upsertFile: vi.fn(async () => undefined),
}));

import { Notice } from 'obsidian';
import { updateProjectState } from '@/db/projects';
import { ListLifecycleService } from '@/services/ListLifecycleService';
import type TickTickSync from '@/main';
import type { App } from 'obsidian';

function makeService(): ListLifecycleService {
	const app = {
		vault: { getAbstractFileByPath: vi.fn(() => null) },
		fileManager: { renameFile: vi.fn() },
	};
	return new ListLifecycleService(
		app as unknown as App,
		{ fileMetadataService: {} } as unknown as TickTickSync
	);
}

function addProject(
	id: string,
	name: string,
	flags: Partial<LocalProject> = {},
	closed?: IProject['closed']
): void {
	const project = { id, name, closed } as IProject;
	projectTable.set(id, { id, project, ...flags });
}

describe('ListLifecycleService pause/resume', () => {
	beforeEach(() => {
		projectTable.clear();
		vi.clearAllMocks();
	});

	it('lists active and paused lists, excluding archived and deleted ones', async () => {
		addProject('active', 'Alpha');
		addProject('paused', 'Beta', { userPaused: true });
		addProject('lifecycle', 'Gamma', { syncPaused: true });
		addProject('archived', 'Archived', { archived: true });
		addProject('closed', 'Closed', {}, true);
		addProject('deleted', 'Deleted', { deleted: true });

		const lists = await makeService().getPausableLists();

		expect(lists).toEqual([
			{ id: 'active', name: 'Alpha', paused: false },
			{ id: 'paused', name: 'Beta', paused: true },
			{ id: 'lifecycle', name: 'Gamma', paused: true },
		]);
	});

	it('pauses an active list', async () => {
		addProject('a', 'Alpha');

		await makeService().setListPaused('a', true);

		expect(updateProjectState).toHaveBeenCalledWith('a', { userPaused: true });
		expect(projectTable.get('a')?.userPaused).toBe(true);
		expect(Notice).toHaveBeenCalledWith('Paused list "Alpha"');
	});

	it('resumes a paused list', async () => {
		addProject('a', 'Alpha', { userPaused: true });

		await makeService().setListPaused('a', false);

		expect(updateProjectState).toHaveBeenCalledWith('a', { userPaused: false, syncPaused: false });
		expect(projectTable.get('a')?.userPaused).toBe(false);
		expect(projectTable.get('a')?.syncPaused).toBe(false);
		expect(Notice).toHaveBeenCalledWith('Resumed list "Alpha"');
	});

	it('refuses to pause a list that is archived in TickTick', async () => {
		addProject('a', 'Alpha', {}, true);

		await makeService().setListPaused('a', true);

		expect(updateProjectState).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith('Archived and deleted lists are already excluded from syncing.');
	});

	it('leaves a user-paused list alone during lifecycle handling', async () => {
		addProject('a', 'Alpha', { userPaused: true });

		await makeService().handleListLifecycle([{ id: 'a', name: 'Alpha' } as IProject]);

		expect(updateProjectState).not.toHaveBeenCalled();
		expect(Notice).not.toHaveBeenCalled();
	});
});
