import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			toArray: vi.fn(),
			update: vi.fn(),
			where: vi.fn(),
		},
	},
}));
vi.mock('@/db/projects', () => ({
	getAllLocalProjects: vi.fn().mockResolvedValue([]),
	getLocalProjectById: vi.fn(),
	updateProjectState: vi.fn().mockResolvedValue(undefined),
	deleteProject: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/db/files', () => ({
	getAllFiles: vi.fn().mockResolvedValue([]),
	deleteFile: vi.fn().mockResolvedValue(undefined),
}));

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type TickTickSync from '@/main';
import { db } from '@/db/dexie';
import { deleteProject } from '@/db/projects';
import { ListLifecycleService } from '@/services/ListLifecycleService';
import type { ListLifecycleAction } from '@/modals/ListLifecycleModal';

function makeService(options: { file?: TFile | null; fileOperation?: unknown } = {}): ListLifecycleService {
	const app = {
		vault: {
			getAbstractFileByPath: vi.fn().mockReturnValue(options.file ?? null),
			createFolder: vi.fn().mockResolvedValue(undefined),
		},
		fileManager: {
			trashFile: vi.fn().mockResolvedValue(undefined),
		},
	};
	const plugin = {
		fileMetadataService: {
			deleteFileMetadata: vi.fn().mockResolvedValue(undefined),
		},
		...(options.fileOperation ? { fileOperation: options.fileOperation } : {}),
	};
	return new ListLifecycleService(app as unknown as App, plugin as unknown as TickTickSync);
}

function applyTrashAction(service: ListLifecycleService, projectId: string, filePath: string): Promise<void> {
	return (service as unknown as {
		applyAction(projectId: string, action: ListLifecycleAction, filePath?: string): Promise<void>;
	}).applyAction(projectId, { type: 'trash' } as ListLifecycleAction, filePath);
}

describe('ListLifecycleService trash action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.tasks.toArray).mockResolvedValue([
			{ localId: 'a', task: { projectId: 'deleted-list' } },
			{ localId: 'b', task: { projectId: 'other-list' } },
			{ localId: 'c', task: { projectId: 'deleted-list' } },
		] as never);
		vi.mocked(db.tasks.update).mockResolvedValue(1);
	});

	it('marks the deleted list tasks as deleted without using an unindexed query', async () => {
		const service = makeService();

		await applyTrashAction(service, 'deleted-list', 'Lists/Gone.md');

		expect(db.tasks.where).not.toHaveBeenCalled();
		expect(db.tasks.update).toHaveBeenCalledTimes(2);
		expect(db.tasks.update).toHaveBeenCalledWith('a', {
			deleted: true,
			updatedAt: expect.any(Number),
			file: '',
		});
		expect(db.tasks.update).toHaveBeenCalledWith('c', {
			deleted: true,
			updatedAt: expect.any(Number),
			file: '',
		});
		expect(db.tasks.update).not.toHaveBeenCalledWith('b', expect.anything());
	});

	it('removes the deleted project from the project cache', async () => {
		const service = makeService();

		await applyTrashAction(service, 'deleted-list', 'Lists/Gone.md');

		expect(deleteProject).toHaveBeenCalledWith('deleted-list');
	});

	it('removes stale lines of the deleted list from other files', async () => {
		const staleFile = new TFile();
		const deleteTasksFromSpecificFile = vi.fn().mockResolvedValue(['task-1']);
		vi.mocked(db.tasks.toArray).mockResolvedValue([
			{ localId: 'a', task: { id: 'task-1', projectId: 'deleted-list' }, file: 'DefaultProject.md' },
		] as never);
		const service = makeService({
			file: staleFile,
			fileOperation: { deleteTasksFromSpecificFile },
		});

		await applyTrashAction(service, 'deleted-list', 'Lists/Gone.md');

		expect(deleteTasksFromSpecificFile).toHaveBeenCalledWith(
			staleFile,
			[{ id: 'task-1', projectId: 'deleted-list' }],
			false
		);
	});
});
