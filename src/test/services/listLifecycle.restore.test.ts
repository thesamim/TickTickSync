import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IProject } from '@/api/types/Project';
import type { LocalProject } from '@/db/schema';

const filesTable: Array<{ path: string; defaultProjectId?: string }> = [];
const projectTable = new Map<string, LocalProject>();
const vaultFiles = new Set<string>();
const fileObjects = new Map<string, unknown>();

vi.mock('obsidian', () => {
	class TFile {}
	return {
		App: class {},
		Modal: class {},
		Notice: vi.fn(),
		Setting: class {},
		TFile,
	};
});

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
	getAllFiles: vi.fn(async () => [...filesTable]),
	deleteFile: vi.fn(async (path: string) => {
		const index = filesTable.findIndex(f => f.path === path);
		if (index >= 0) filesTable.splice(index, 1);
	}),
	upsertFile: vi.fn(async (path: string, defaultProjectId?: string) => {
		const existing = filesTable.find(f => f.path === path);
		if (existing) existing.defaultProjectId = defaultProjectId;
		else filesTable.push({ path, defaultProjectId });
	}),
}));

vi.mock('@/modals/ListLifecycleModal', () => ({
	ListLifecycleModal: class {
		showModal = vi.fn(async () => new Map());
	},
}));

import { TFile } from 'obsidian';
import { getLocalProjectById, updateProjectState } from '@/db/projects';
import { upsertFile } from '@/db/files';
import { ListLifecycleService } from '@/services/ListLifecycleService';
import type TickTickSync from '@/main';
import type { App } from 'obsidian';

function getOrCreateFile(path: string): TFile {
	let file = fileObjects.get(path) as TFile | undefined;
	if (!file) {
		file = new TFile();
		(file as unknown as { path: string }).path = path;
		fileObjects.set(path, file);
	}
	return file;
}

function makeService(options: {
	resolveAction?: 'move' | 'delete-misplaced' | 'delete-correct' | 'skip';
	expectedPath?: string;
} = {}) {
	const expectedPath = options.expectedPath ?? 'Tasks/My List.md';
	const app = {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => (vaultFiles.has(path) ? getOrCreateFile(path) : null)),
			createFolder: vi.fn(async () => undefined),
		},
		fileManager: {
			renameFile: vi.fn(async (file: TFile, newPath: string) => {
				const oldPath = (file as unknown as { path: string }).path;
				vaultFiles.delete(oldPath);
				vaultFiles.add(newPath);
				getOrCreateFile(newPath);
			}),
			trashFile: vi.fn(async () => undefined),
		},
	};
	const updateFilePath = vi.fn(async (oldPath: string, newPath: string) => {
		const record = filesTable.find(f => f.path === oldPath);
		if (record) record.path = newPath;
	});
	const folderSyncService = {
		getFilePathForProject: vi.fn(async () => expectedPath),
		resolveFileLocationConflict: vi.fn(async () => options.resolveAction ?? 'move'),
	};
	const plugin = {
		fileMetadataService: {
			updateFilePath,
			deleteFileMetadata: vi.fn(async () => undefined),
		},
	};
	const service = new ListLifecycleService(
		app as unknown as App,
		plugin as unknown as TickTickSync,
		folderSyncService as never
	);
	return { service, app, updateFilePath, folderSyncService };
}

function activeProject(id = 'p1', name = 'My List'): IProject {
	return { id, name } as IProject;
}

function setupProject(flags: Partial<LocalProject> = {}): void {
	const project = activeProject();
	projectTable.set(project.id, { id: project.id, project, ...flags });
}

function setupArchiveFile(path = 'Archived/My List.md'): void {
	filesTable.push({ path, defaultProjectId: 'p1' });
	vaultFiles.add(path);
}

describe('ListLifecycleService restore', () => {
	beforeEach(() => {
		filesTable.length = 0;
		projectTable.clear();
		vaultFiles.clear();
		fileObjects.clear();
		vi.clearAllMocks();
	});

	it('moves the archived file back to its normal location', async () => {
		setupProject({ archived: true, syncPaused: true, archivedFromPath: 'Tasks/My List.md' });
		setupArchiveFile();
		const { service, app, updateFilePath, folderSyncService } = makeService();

		await service.handleListLifecycle([activeProject()]);

		expect(app.fileManager.renameFile).toHaveBeenCalledWith(expect.any(TFile), 'Tasks/My List.md');
		expect(updateFilePath).toHaveBeenCalledWith('Archived/My List.md', 'Tasks/My List.md');
		expect(folderSyncService.resolveFileLocationConflict).not.toHaveBeenCalled();
		expect(updateProjectState).toHaveBeenCalledWith('p1', {
			archived: false,
			deleted: false,
			syncPaused: false,
			archivedFromPath: undefined,
			restoreSkipped: false,
		});
	});

	it('asks the user when a file already exists at the restore target', async () => {
		setupProject({ archived: true, syncPaused: true, archivedFromPath: 'Tasks/My List.md' });
		setupArchiveFile();
		vaultFiles.add('Tasks/My List.md');
		const { service, folderSyncService } = makeService({ resolveAction: 'move' });

		await service.handleListLifecycle([activeProject()]);

		expect(folderSyncService.resolveFileLocationConflict).toHaveBeenCalledWith(
			'Archived/My List.md',
			'Tasks/My List.md',
			expect.objectContaining({ id: 'p1' })
		);
		expect(updateProjectState).toHaveBeenCalledWith('p1', expect.objectContaining({ syncPaused: false }));
	});

	it('keeps the list frozen when the user skips the conflict', async () => {
		setupProject({ archived: true, syncPaused: true, archivedFromPath: 'Tasks/My List.md' });
		setupArchiveFile();
		vaultFiles.add('Tasks/My List.md');
		const { service, folderSyncService } = makeService({ resolveAction: 'skip' });

		await service.handleListLifecycle([activeProject()]);

		expect(folderSyncService.resolveFileLocationConflict).toHaveBeenCalled();
		expect(upsertFile).toHaveBeenCalledWith('Archived/My List.md', 'p1');
		expect(updateProjectState).toHaveBeenCalledWith('p1', { restoreSkipped: true });
		expect(updateProjectState).not.toHaveBeenCalledWith(
			'p1',
			expect.objectContaining({ syncPaused: false })
		);
	});

	it('restores an archived file even when the lifecycle flags were lost', async () => {
		setupProject();
		setupArchiveFile();
		vaultFiles.add('Tasks/My List.md');
		const { service, folderSyncService } = makeService({ resolveAction: 'move' });

		await service.handleListLifecycle([activeProject()]);

		expect(folderSyncService.resolveFileLocationConflict).toHaveBeenCalledWith(
			'Archived/My List.md',
			'Tasks/My List.md',
			expect.objectContaining({ id: 'p1' })
		);
	});

	it('does not ask again while the user keeps a skipped restore', async () => {
		setupProject({ syncPaused: true, restoreSkipped: true });
		setupArchiveFile();
		vaultFiles.add('Tasks/My List.md');
		const { service, folderSyncService } = makeService({ resolveAction: 'move' });

		await service.handleListLifecycle([activeProject()]);

		expect(folderSyncService.resolveFileLocationConflict).not.toHaveBeenCalled();
		expect(await getLocalProjectById('p1')).toMatchObject({ syncPaused: true, restoreSkipped: true });
	});

	it('restores a skipped list silently once the conflict is gone', async () => {
		setupProject({ syncPaused: true, restoreSkipped: true });
		setupArchiveFile();
		const { service, app, folderSyncService } = makeService({ resolveAction: 'move' });

		await service.handleListLifecycle([activeProject()]);

		expect(folderSyncService.resolveFileLocationConflict).not.toHaveBeenCalled();
		expect(app.fileManager.renameFile).toHaveBeenCalledWith(expect.any(TFile), 'Tasks/My List.md');
		expect(await getLocalProjectById('p1')).toMatchObject({
			archived: false,
			syncPaused: false,
			restoreSkipped: false,
		});
	});
});
