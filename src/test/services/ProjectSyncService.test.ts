import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';
import type { IProject } from '@/api/types/Project';

vi.mock('obsidian', () => ({
	App: vi.fn(),
	AbstractInputSuggest: class {},
	Modal: vi.fn(),
	Notice: vi.fn(),
	Plugin: vi.fn(),
	PluginSettingTab: vi.fn(),
	TFile: vi.fn(),
	TFolder: vi.fn(),
	MarkdownView: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
	default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const projectsTable = new Map<string, { id: string; project: IProject }>();
const filesTable = new Map<string, { path: string; defaultProjectId?: string }>();

vi.mock('@/db/dexie', () => ({
	db: {
		projects: {
			get: vi.fn(async (id: string) => projectsTable.get(id)),
			bulkPut: vi.fn(async (rows: Array<{ id: string; project: IProject }>) => {
				rows.forEach(r => projectsTable.set(r.id, r));
			}),
			toArray: vi.fn(async () => [...projectsTable.values()]),
		},
		projectGroups: { get: vi.fn(async () => undefined) },
	},
}));

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn(async () => [...projectsTable.values()].map(r => r.project)),
	getProjectById: vi.fn(async (id: string) => projectsTable.get(id)?.project),
}));

const upsertFile = vi.fn(async (path: string, defaultProjectId?: string) => {
	filesTable.set(path, { path, defaultProjectId });
});

vi.mock('@/db/files', () => ({
	upsertFile: (path: string, id?: string) => upsertFile(path, id),
	getAllFiles: vi.fn(async () => [...filesTable.values()]),
	getFile: vi.fn(async (p: string) => filesTable.get(p)),
	deleteFile: vi.fn(),
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({
		inboxID: 'inbox-1',
		inboxName: 'Inbox',
		keepProjectFolders: false,
	})),
	getDefaultFolder: vi.fn(() => ''),
	updateSettings: vi.fn(),
}));

vi.mock('@/modals/FoundDuplicateListsModal', () => ({
	FoundDuplicateListsModal: vi.fn(function () {
		return { showModal: vi.fn().mockResolvedValue(true) };
	}),
}));

import { ProjectSyncService } from '@/services/ProjectSyncService';

const remoteProjects = (): IProject[] => ([
	{ id: 'proj-a', name: 'Work' } as IProject,
	{ id: 'proj-b', name: 'Home' } as IProject,
]);

function makePlugin() {
	const updateFilePath = vi.fn(async () => {});
	return {
		plugin: {
			fileMetadataService: {
				getAllFileMetadata: vi.fn(async () => ({})),
				getFilepathForProjectId: vi.fn(async (id: string) => {
					for (const f of filesTable.values()) {
						if (f.defaultProjectId === id) return f.path;
					}
					return undefined;
				}),
				updateFilePath,
			},
		},
		updateFilePath,
	};
}

describe('ProjectSyncService.saveProjectsToCache', () => {
	beforeEach(() => {
		projectsTable.clear();
		filesTable.clear();
		upsertFile.mockClear();
	});

	it('maps every project to a file on the very first sync', async () => {
		const { plugin } = makePlugin();
		const svc = new ProjectSyncService({} as never, plugin as never);

		// A fresh install starts with an empty projects cache.
		expect(projectsTable.size).toBe(0);

		await svc.saveProjectsToCache(remoteProjects());

		const mapped = upsertFile.mock.calls.map(c => c[0]);
		expect(mapped).toContain('Work.md');
		expect(mapped).toContain('Home.md');
		expect(mapped).toContain('Inbox.md');
	});

	it('does not re-create mappings on subsequent syncs', async () => {
		const { plugin } = makePlugin();
		const svc = new ProjectSyncService({} as never, plugin as never);

		await svc.saveProjectsToCache(remoteProjects());
		upsertFile.mockClear();

		await svc.saveProjectsToCache(remoteProjects());
		await svc.saveProjectsToCache(remoteProjects());

		expect(upsertFile).not.toHaveBeenCalled();
	});

	it('leaves every project resolvable to a file path', async () => {
		const { plugin } = makePlugin();
		const svc = new ProjectSyncService({} as never, plugin as never);

		await svc.saveProjectsToCache(remoteProjects());

		const resolve = plugin.fileMetadataService.getFilepathForProjectId;
		expect(await resolve('proj-a')).toBe('Work.md');
		expect(await resolve('proj-b')).toBe('Home.md');
		expect(await resolve('inbox-1')).toBe('Inbox.md');
	});

	it('still relocates the file when a project is renamed in TickTick', async () => {
		const { plugin, updateFilePath } = makePlugin();
		const svc = new ProjectSyncService(
			{ vault: { getAbstractFileByPath: () => null } } as never,
			plugin as never
		);

		// Project is already cached under its old name and already mapped to a file.
		projectsTable.set('proj-a', { id: 'proj-a', project: { id: 'proj-a', name: 'Work' } as IProject });
		filesTable.set('Work.md', { path: 'Work.md', defaultProjectId: 'proj-a' });

		await svc.checkProjectRename('proj-a', 'Work Stuff');

		expect(updateFilePath).toHaveBeenCalledWith('Work.md', 'Work Stuff.md');
	});

	it('re-creates a file entry for a cached project whose vault file is gone', async () => {
		const { plugin } = makePlugin();
		const svc = new ProjectSyncService(
			{ vault: { getAbstractFileByPath: () => null } } as never,
			plugin as never
		);

		// Project is cached but its vault file was deleted.
		// The mapping and file should be re-created.
		projectsTable.set('proj-a', { id: 'proj-a', project: { id: 'proj-a', name: 'Work' } as IProject });

		await svc.checkProjectRename('proj-a', 'Work');

		expect(upsertFile).toHaveBeenCalledWith('Work.md', 'proj-a');
	});

	it('re-creates a file entry for a cached project when the vault file still exists', async () => {
		const { plugin } = makePlugin();
		const svc = new ProjectSyncService(
			{ vault: { getAbstractFileByPath: () => new TFile() } } as never,
			plugin as never
		);

		// Project is cached and its vault file exists, but the database mapping
		// was lost (e.g. corruption). The mapping should be rebuilt.
		projectsTable.set('proj-a', { id: 'proj-a', project: { id: 'proj-a', name: 'Work' } as IProject });

		await svc.checkProjectRename('proj-a', 'Work');

		expect(upsertFile).toHaveBeenCalledWith('Work.md', 'proj-a');
	});
});
