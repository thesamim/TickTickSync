import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushToTickTick } from '../sync/push';
import { db } from '../db/dexie';

// Mock the dependencies
vi.mock('../db/dexie', () => ({
	db: {
		tasks: {
			update: vi.fn(),
			where: vi.fn(),
			transaction: vi.fn(),
		},
		meta: {
			update: vi.fn(),
		},
		transaction: vi.fn((mode, table, callback) => callback()),
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

describe('pushToTickTick field mapping', () => {
	const mockApi = {
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn(),
	} as any;

	const mockMeta = {
		deviceId: 'test-device',
		lastDeltaSync: 1000,
		key: 'sync' as const,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should correctly map modifiedTime to updatedAt after creating a task', async () => {
		const now = new Date();
		const modifiedTimeString = now.toISOString();
		const expectedTimestamp = now.getTime();

		const dirtyTask = {
			localId: 'local-uuid',
			taskId: undefined,
			task: { title: 'New Task' },
			updatedAt: 2000,
			lastModifiedByDeviceId: 'test-device'
		};

		// Mock db.tasks.where("updatedAt").above(...).and(...).toArray()
		const mockToArray = vi.fn().mockResolvedValue([dirtyTask]);
		const mockAnd = vi.fn().mockReturnValue({ toArray: mockToArray });
		const mockAbove = vi.fn().mockReturnValue({ and: mockAnd });
		const mockWhere = vi.fn().mockReturnValue({ above: mockAbove });
		(db.tasks.where as any) = mockWhere;

		mockApi.createTask.mockResolvedValue({
			id: 'new-remote-id',
			modifiedTime: modifiedTimeString,
			title: 'New Task'
		});

		await pushToTickTick(mockApi, mockMeta, false);

		expect(db.tasks.update).toHaveBeenCalledWith('local-uuid', expect.objectContaining({
			taskId: 'new-remote-id',
			updatedAt: expectedTimestamp,
			lastModifiedByDeviceId: 'test-device'
		}));
	});

	it('should correctly map modifiedTime to updatedAt after updating a task', async () => {
		const now = new Date();
		const modifiedTimeString = now.toISOString();
		const expectedTimestamp = now.getTime();

		const dirtyTask = {
			localId: 'local-uuid',
			taskId: 'existing-id',
			task: { id: 'existing-id', title: 'Updated Task' },
			updatedAt: 2000,
			lastModifiedByDeviceId: 'test-device'
		};

		const mockToArray = vi.fn().mockResolvedValue([dirtyTask]);
		const mockAnd = vi.fn().mockReturnValue({ toArray: mockToArray });
		const mockAbove = vi.fn().mockReturnValue({ and: mockAnd });
		const mockWhere = vi.fn().mockReturnValue({ above: mockAbove });
		(db.tasks.where as any) = mockWhere;

		mockApi.updateTask.mockResolvedValue({
			id: 'existing-id',
			modifiedTime: modifiedTimeString,
			title: 'Updated Task'
		});

		await pushToTickTick(mockApi, mockMeta, false);

		expect(db.tasks.update).toHaveBeenCalledWith('local-uuid', expect.objectContaining({
			updatedAt: expectedTimestamp,
			lastModifiedByDeviceId: 'test-device'
		}));
	});
});
