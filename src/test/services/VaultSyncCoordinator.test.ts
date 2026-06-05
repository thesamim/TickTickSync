import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultSyncCoordinator } from '@/services/VaultSyncCoordinator';
import type { LocalTask } from '@/db/schema';
import type { ITask } from '@/api/types/Task';

// Mock Obsidian dependencies
vi.mock('obsidian', () => ({
	App: vi.fn(),
	Modal: vi.fn(),
	Notice: vi.fn(),
	Plugin: vi.fn(),
	PluginSettingTab: vi.fn(),
	TFile: vi.fn(),
	TFolder: vi.fn(),
	MarkdownView: vi.fn(),
}));

vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			where: vi.fn(),
			toArray: vi.fn(),
			update: vi.fn(),
		},
		meta: {
			update: vi.fn(),
		},
		transaction: vi.fn((_mode, _table, callback) => callback()),
	},
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({
		SyncTag: undefined,
		SyncProject: undefined,
		tagAndOr: 0,
		defaultProjectId: 'default-project-id',
		keepProjectFolders: false,
	})),
}));

vi.mock('@/modals/TaskDeletionModal', () => ({
	TaskDeletionModal: vi.fn(function () {
		return { showModal: vi.fn().mockResolvedValue(true) };
	}),
}));

vi.mock('@/utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

function makeLocalTask(overrides: Partial<LocalTask> = {}): LocalTask {
	return {
		localId: 'local-1',
		taskId: 'task-1',
		task: { id: 'task-1', projectId: 'proj-1' } as ITask,
		updatedAt: 1000,
		lastModifiedByDeviceId: 'device-1',
		file: '',
		source: 'obsidian',
		...overrides,
	};
}

describe('VaultSyncCoordinator', () => {
	let coordinator: VaultSyncCoordinator;

	beforeEach(() => {
		vi.clearAllMocks();
		coordinator = new VaultSyncCoordinator(
			{} as any,
			{} as any,
			undefined
		);
	});

	describe('determineActionNeeded', () => {
		let fn: Function;

		beforeEach(() => {
			fn = (coordinator as any).determineActionNeeded.bind(coordinator);
		});

		it('should return add for a task with no file', () => {
			const lt = makeLocalTask({ file: '' });
			const result = fn(lt, 'Projects/New.md');
			expect(result).toEqual({ action: 'add' });
		});

		it('should return move when targetFile differs from lt.file', () => {
			const lt = makeLocalTask({
				file: 'Projects/Old.md',
				updatedAt: 1000,
				lastVaultSync: 1000,
			});
			const result = fn(lt, 'Projects/New.md');
			expect(result).toEqual({ action: 'move' });
		});

		it('should return update when file is same but content changed', () => {
			const lt = makeLocalTask({
				file: 'Projects/Same.md',
				updatedAt: 2000,
				lastVaultSync: 1000,
			});
			const result = fn(lt, 'Projects/Same.md');
			expect(result).toEqual({ action: 'update' });
		});

		it('should return none when nothing changed', () => {
			const lt = makeLocalTask({
				file: 'Projects/Same.md',
				updatedAt: 1000,
				lastVaultSync: 1000,
			});
			const result = fn(lt, 'Projects/Same.md');
			expect(result).toEqual({ action: 'none' });
		});

		it('should treat undefined lastVaultSync as changed', () => {
			const lt = makeLocalTask({
				file: 'Projects/Same.md',
				updatedAt: 1000,
				lastVaultSync: undefined,
			});
			const result = fn(lt, 'Projects/Same.md');
			expect(result).toEqual({ action: 'update' });
		});

		it('should prefer move over update when both changed and file moved', () => {
			const lt = makeLocalTask({
				file: 'Projects/Old.md',
				updatedAt: 2000,
				lastVaultSync: 1000,
			});
			const result = fn(lt, 'Projects/New.md');
			expect(result).toEqual({ action: 'move' });
		});
	});

	describe('matchesFilter', () => {
		let fn: Function;

		beforeEach(() => {
			fn = (coordinator as any).matchesFilter.bind(coordinator);
		});

		it('should return true when no filter is set', () => {
			const task = { id: 't1', projectId: 'p1', tags: ['work'] } as ITask;
			expect(fn(task, undefined, undefined, 0)).toBe(true);
		});

		it('should return true when task matches syncTag', () => {
			const task = { id: 't1', projectId: 'p1', tags: ['work'] } as ITask;
			expect(fn(task, 'work', undefined, 0)).toBe(true);
		});

		it('should return false when task does not match syncTag', () => {
			const task = { id: 't1', projectId: 'p1', tags: ['personal'] } as ITask;
			expect(fn(task, 'work', undefined, 0)).toBe(false);
		});

		it('should return true when task matches syncProject', () => {
			const task = { id: 't1', projectId: 'p1', tags: [] } as ITask;
			expect(fn(task, undefined, 'p1', 0)).toBe(true);
		});

		it('should return false when task does not match syncProject', () => {
			const task = { id: 't1', projectId: 'p2', tags: [] } as ITask;
			expect(fn(task, undefined, 'p1', 0)).toBe(false);
		});

		it('should return true with AND filter when both match', () => {
			const task = { id: 't1', projectId: 'p1', tags: ['work'] } as ITask;
			expect(fn(task, 'work', 'p1', 1)).toBe(true);
		});

		it('should return false with AND filter when only one matches', () => {
			const task = { id: 't1', projectId: 'p1', tags: ['personal'] } as ITask;
			expect(fn(task, 'work', 'p1', 1)).toBe(false);
		});

		it('should return true with OR filter when one matches', () => {
			const task = { id: 't1', projectId: 'p1', tags: ['personal'] } as ITask;
			expect(fn(task, 'work', 'p1', 0)).toBe(true);
		});

		it('should return false with OR filter when neither matches', () => {
			const task = { id: 't1', projectId: 'p2', tags: ['personal'] } as ITask;
			expect(fn(task, 'work', 'p1', 0)).toBe(false);
		});
	});

	describe('confirmDeletions', () => {
		it('should exclude moved task IDs from confirmation', async () => {
			const movedTask = { id: 'moved-1' } as ITask;
			const deletedTask = { id: 'deleted-1' } as ITask;

			const fileGroups = new Map();
			fileGroups.set('OldFile.md', {
				toAdd: [],
				toUpdate: [],
				toDelete: [movedTask, deletedTask],
				toRemoveForMove: [],
			});

			const movedTaskIds = new Set(['moved-1']);

			(coordinator as any).plugin = {
				cacheOperation: {
					getDeletionItems: vi.fn().mockResolvedValue([
						{ title: 'Deleted task', filePath: 'OldFile.md' },
					]),
				},
			};

			const result = await (coordinator as any).confirmDeletions(fileGroups, movedTaskIds);

			expect(result).toBe(true);

			// Verify only the deleted task (not the moved one) was passed to getDeletionItems
			const getDeletionItems = (coordinator as any).plugin.cacheOperation.getDeletionItems;
			expect(getDeletionItems).toHaveBeenCalledWith(['deleted-1']);
		});

		it('should skip modal when all toDelete are moved tasks', async () => {
			const movedTask = { id: 'moved-1' } as ITask;

			const fileGroups = new Map();
			fileGroups.set('OldFile.md', {
				toAdd: [],
				toUpdate: [],
				toDelete: [movedTask],
				toRemoveForMove: [],
			});

			const movedTaskIds = new Set(['moved-1']);

			(coordinator as any).plugin = {
				cacheOperation: {
					getDeletionItems: vi.fn(),
				},
			};

			const result = await (coordinator as any).confirmDeletions(fileGroups, movedTaskIds);

			// Should return true immediately without calling getDeletionItems
			expect(result).toBe(true);
			expect((coordinator as any).plugin.cacheOperation.getDeletionItems).not.toHaveBeenCalled();
		});

		it('should treat missing movedTaskIds as empty set', async () => {
			const deletedTask = { id: 'deleted-1' } as ITask;

			const fileGroups = new Map();
			fileGroups.set('File.md', {
				toAdd: [],
				toUpdate: [],
				toDelete: [deletedTask],
				toRemoveForMove: [],
			});

			(coordinator as any).plugin = {
				cacheOperation: {
					getDeletionItems: vi.fn().mockResolvedValue([
						{ title: 'Deleted task', filePath: 'File.md' },
					]),
				},
			};

			const result = await (coordinator as any).confirmDeletions(fileGroups);

			expect(result).toBe(true);
			expect((coordinator as any).plugin.cacheOperation.getDeletionItems).toHaveBeenCalledWith(['deleted-1']);
		});
	});
});
