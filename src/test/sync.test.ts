import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pullFromTickTick } from '../sync/pull';
import { db } from '../db/dexie';

// Mock the dependencies
vi.mock('../db/dexie', () => ({
	db: {
		tasks: {
			get: vi.fn(),
			put: vi.fn(),
			update: vi.fn(),
			where: vi.fn(),
		},
		meta: {
			update: vi.fn(),
		},
	},
}));

vi.mock('../sync/journal', () => ({
	logSyncEvent: vi.fn(),
}));

vi.mock('loglevel', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock('./conflicts', () => ({
	resolveTaskConflict: vi.fn((local, remote) => remote), // Default to remote for testing
}));

describe('pullFromTickTick', () => {
	const mockApi = {
		getUpdatedTasks: vi.fn(),
		checkpoint: 123456789,
	} as any;

	const mockMeta = {
		deviceId: 'test-device',
		lastFullSync: 0,
		lastDeltaSync: 0,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should get task by taskId index', async () => {
		const remoteTask = {
			id: 'remote-task-id',
			updatedAt: Date.now(),
			lastModifiedBy: 'someone-else',
			deleted: false,
		};

		mockApi.getUpdatedTasks.mockResolvedValue({ update: [remoteTask], delete: [] });

		// Mock where("taskId").equals(...).first()
		const mockFirst = vi.fn().mockResolvedValue(undefined);
		const mockEquals = vi.fn().mockReturnValue({ first: mockFirst });
		const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(mockWhere).toHaveBeenCalledWith('taskId');
		expect(mockEquals).toHaveBeenCalledWith('remote-task-id');
	});

	it('should include localId in put task', async () => {
		const remoteTask = {
			id: 'remote-task-id',
			updatedAt: Date.now(),
			lastModifiedBy: 'someone-else',
			deleted: false,
		};

		mockApi.getUpdatedTasks.mockResolvedValue({ update: [remoteTask], delete: [] });
		
		// Mock where(...).equals(...).first() returning undefined
		const mockFirst = vi.fn().mockResolvedValue(undefined);
		const mockEquals = vi.fn().mockReturnValue({ first: mockFirst });
		const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
		(db.tasks.where as any) = mockWhere;
		
		await pullFromTickTick(mockApi, mockMeta, false);
		
		const putCall = (db.tasks.put as any).mock.calls[0][0];
		expect(putCall).toHaveProperty('localId');
		expect(putCall.localId).toBe('tt:remote-task-id');
	});

	it('should handle remote deletions', async () => {
		const deletedId = 'deleted-task-id';
		mockApi.getUpdatedTasks.mockResolvedValue({ update: [], delete: [deletedId] });

		const localTask = { localId: 'local-uuid', taskId: deletedId, deleted: false };
		
		const mockFirst = vi.fn().mockResolvedValue(localTask);
		const mockEquals = vi.fn().mockReturnValue({ first: mockFirst });
		const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(db.tasks.update).toHaveBeenCalledWith('local-uuid', expect.objectContaining({
			deleted: true,
			lastModifiedByDeviceId: 'ticktick'
		}));
	});

	it('should skip invalid updates', async () => {
		mockApi.getUpdatedTasks.mockResolvedValue({ update: [{ id: undefined, taskId: undefined } as any], delete: [] });

		const mockWhere = vi.fn();
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('should handle updates with taskId instead of id', async () => {
		const remoteTask = {
			taskId: 'remote-task-id',
			updatedAt: Date.now(),
			lastModifiedBy: 'someone-else',
			deleted: false,
		};

		mockApi.getUpdatedTasks.mockResolvedValue({ update: [remoteTask], delete: [] });

		const mockFirst = vi.fn().mockResolvedValue(undefined);
		const mockEquals = vi.fn().mockReturnValue({ first: mockFirst });
		const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(mockWhere).toHaveBeenCalledWith('taskId');
		expect(mockEquals).toHaveBeenCalledWith('remote-task-id');
	});

	it('should skip invalid deletedIds', async () => {
		mockApi.getUpdatedTasks.mockResolvedValue({ update: [], delete: [undefined, null, { notId: 'test' } as any] });

		const mockWhere = vi.fn();
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('should handle deletion objects with taskId', async () => {
		const deletedId = 'deleted-task-id';
		mockApi.getUpdatedTasks.mockResolvedValue({ update: [], delete: [{ taskId: deletedId }] });

		const localTask = { localId: 'local-uuid', taskId: deletedId, deleted: false };
		
		const mockFirst = vi.fn().mockResolvedValue(localTask);
		const mockEquals = vi.fn().mockReturnValue({ first: mockFirst });
		const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(mockWhere).toHaveBeenCalledWith('taskId');
		expect(mockEquals).toHaveBeenCalledWith(deletedId);
		expect(db.tasks.update).toHaveBeenCalledWith('local-uuid', expect.objectContaining({
			deleted: true
		}));
	});

	it('should handle deletion objects with id', async () => {
		const deletedId = 'deleted-task-id';
		mockApi.getUpdatedTasks.mockResolvedValue({ update: [], delete: [{ id: deletedId }] });

		const localTask = { localId: 'local-uuid', taskId: deletedId, deleted: false };
		
		const mockFirst = vi.fn().mockResolvedValue(localTask);
		const mockEquals = vi.fn().mockReturnValue({ first: mockFirst });
		const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
		(db.tasks.where as any) = mockWhere;

		await pullFromTickTick(mockApi, mockMeta, false);

		expect(mockWhere).toHaveBeenCalledWith('taskId');
		expect(mockEquals).toHaveBeenCalledWith(deletedId);
	});

});
