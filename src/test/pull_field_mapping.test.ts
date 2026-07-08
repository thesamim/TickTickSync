import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { pullFromTickTick } from '../sync/pull';
import { db } from '../db/dexie';

// Mock the dependencies
vi.mock('../db/dexie', () => ({
	db: {
		tasks: {
			get: vi.fn(),
			put: vi.fn(),
			update: vi.fn(),
			bulkPut: vi.fn(),
			where: vi.fn(() => ({
				anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
				equals: vi.fn(() => ({ first: vi.fn(), toArray: vi.fn().mockResolvedValue([]) })),
				first: vi.fn(),
				toArray: vi.fn().mockResolvedValue([]),
			})),
		},
		meta: {
			update: vi.fn(),
		},
		transaction: vi.fn((_mode: string, _table: string, callback: () => void) => callback()),
	},
}));

vi.mock('../sync/journal', () => ({
	logSyncEvent: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock('../sync/conflicts', () => ({
	resolveTaskConflict: vi.fn((local: unknown, remote: unknown) => ({
		resolved: remote,
		conflictDetected: false,
		winner: "remote" as const,
	})),
}));

describe('pullFromTickTick field mapping and echo detection', () => {
	const mockApi = {
		getUpdatedTasks: vi.fn(),
		checkpoint: 123456789,
		plugin: {
			dateMan: { addDateHolderToTask: vi.fn() },
		},
	};

	const mockMeta = {
		deviceId: 'test-device',
		lastFullSync: 0,
		lastDeltaSync: 0,
		schemaVersion: 2,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should correctly map modifiedTime to updatedAt and use "ticktick" as default deviceId', async () => {
		const now = new Date();
		const modifiedTimeString = now.toISOString();
		const expectedTimestamp = now.getTime();

		const remoteTask = {
			id: 'remote-task-id',
			modifiedTime: modifiedTimeString,
			deleted: 0,
		};

		mockApi.getUpdatedTasks.mockResolvedValue({ update: [remoteTask], delete: [] });

		// Mock where chain to support both anyOf (bulk fetch) and equals (per-task lookup)
		const anyOfToArray = vi.fn().mockResolvedValue([]);
		const anyOf = vi.fn(() => ({ toArray: anyOfToArray }));
		const first = vi.fn().mockResolvedValue(undefined);
		const equals = vi.fn(() => ({ first }));
		(db.tasks.where as unknown as Mock) = vi.fn(() => ({ anyOf, equals, first: vi.fn(), toArray: vi.fn() }));

		await pullFromTickTick(mockApi, mockMeta, false);

		expect((db.tasks as unknown as Record<string, Mock>).bulkPut).toHaveBeenCalledWith([expect.objectContaining({
			updatedAt: expectedTimestamp,
		})]);
	});

	it('should ignore echoes (when remote task was originally sent by us)', async () => {
		const now = new Date();
		const modifiedTimeString = now.toISOString();

		const remoteTask = {
			id: 'remote-task-id',
			modifiedTime: modifiedTimeString,
			deleted: 0,
		};

		mockApi.getUpdatedTasks.mockResolvedValue({ update: [remoteTask], delete: [] });

		// Local task matches this device and the same modifiedTime — our own echo
		const localTask = {
			localId: 'local-uuid',
			taskId: 'remote-task-id',
			updatedAt: now.getTime(),
			lastModifiedByDeviceId: 'test-device',
			task: { modifiedTime: modifiedTimeString },
		};

		const anyOfToArray = vi.fn().mockResolvedValue([localTask]);
		const anyOf = vi.fn(() => ({ toArray: anyOfToArray }));
		const first = vi.fn().mockResolvedValue(localTask);
		const equals = vi.fn(() => ({ first }));
		(db.tasks.where as unknown as Mock) = vi.fn(() => ({ anyOf, equals, first: vi.fn(), toArray: vi.fn() }));

		const applied = await pullFromTickTick(mockApi, mockMeta, false);

		expect(applied).toBe(0);
		expect((db.tasks as unknown as Record<string, Mock>).bulkPut).not.toHaveBeenCalled();
	});
});
