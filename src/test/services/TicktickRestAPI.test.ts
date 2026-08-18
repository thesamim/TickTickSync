import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { TickTickRestAPI } from '@/services/TicktickRestAPI';
import type { ITask } from '@/api/types/Task';

vi.mock('obsidian', () => ({
	App: vi.fn(),
	Notice: vi.fn(),
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({
		token: 'test-token',
		inboxID: 'inbox-id',
		baseURL: 'https://api.ticktick.com',
		checkPoint: 0,
		debugMode: false,
	})),
	updateSettings: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock('@/main', () => ({ default: class TickTickSyncMock {} }));

vi.mock('@/api/tick_singleton_factory', () => ({ getTick: vi.fn() }));

function makeTask(overrides: Partial<ITask> = {}): ITask {
	return {
		id: 'local-id',
		projectId: 'proj-1',
		title: 'Local Title',
		status: 0,
		priority: 0,
		isAllDay: true,
		timeZone: 'America/Chicago',
		reminders: [],
		...overrides,
	} as ITask;
}

describe('TickTickRestAPI.createTask', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function makeApi(addTaskResult: unknown) {
		const api = { addTask: vi.fn().mockResolvedValue(addTaskResult) };
		const plugin = {
			dateMan: { addDateHolderToTask: vi.fn() },
			saveSettings: vi.fn(),
		};
		const rest = new TickTickRestAPI({} as never, plugin as never, api as never);
		return { rest, api: api as { addTask: Mock }, plugin: plugin as { dateMan: { addDateHolderToTask: Mock } } };
	}

	it('returns the server task, with server fields winning over the local task', async () => {
		const local = makeTask();
		const server = { ...makeTask(), id: 'server-id', title: 'Server Title' };
		const { rest } = makeApi(server);

		const result = await rest.createTask(local);

		expect(result.id).toBe('server-id');
		expect(result.title).toBe('Server Title');
	});

	it('returns null and surfaces the API error when the create fails (empty array)', async () => {
		const local = makeTask({ title: 'Local Title' });
		const apiWithError = {
			addTask: vi.fn().mockResolvedValue([]),
			lastError: { operation: 'Add Task', statusCode: 400, errorMessage: 'reminder is invalid' },
		};
		const plugin = { dateMan: { addDateHolderToTask: vi.fn() }, saveSettings: vi.fn() };
		const rest = new TickTickRestAPI({} as never, plugin as never, apiWithError as never);
		const { Notice } = await import('obsidian');

		const result = await rest.createTask(local);

		expect(result).toBeNull();
		expect(Notice).toHaveBeenCalledWith(expect.stringContaining('reminder is invalid'), 8000);
	});

	it('returns null and surfaces the API error when the create fails (null)', async () => {
		const local = makeTask({ title: 'Local Title' });
		const apiWithError = {
			addTask: vi.fn().mockResolvedValue(null),
			lastError: { operation: 'Add Task', statusCode: 500, errorMessage: 'something exploded' },
		};
		const plugin = { dateMan: { addDateHolderToTask: vi.fn() }, saveSettings: vi.fn() };
		const rest = new TickTickRestAPI({} as never, plugin as never, apiWithError as never);
		const { Notice } = await import('obsidian');

		const result = await rest.createTask(local);

		expect(result).toBeNull();
		expect(Notice).toHaveBeenCalledWith(expect.stringContaining('something exploded'), 8000);
	});

	it('keeps local fields that the server response omits', async () => {
		const local = makeTask({ title: 'Local Title' });
		const server = { id: 'server-id', title: 'Server Title' };
		const { rest } = makeApi(server);

		const result = await rest.createTask(local);

		expect(result.projectId).toBe('proj-1');
		expect(result.timeZone).toBe('America/Chicago');
	});

	it('passes reminders through to the API as-is', async () => {
		const local = makeTask({
			reminders: [{ trigger: 'TRIGGER:P1D' }],
		});
		const server = { ...makeTask(), id: 'server-id', reminders: [{ id: 'r1', trigger: 'TRIGGER:PT0S' }] };
		const { rest, api } = makeApi(server);

		const result = await rest.createTask(local);

		expect(api.addTask).toHaveBeenCalledWith(expect.objectContaining({
			reminders: [{ trigger: 'TRIGGER:P1D' }],
		}));
		expect(result.reminders).toEqual([{ id: 'r1', trigger: 'TRIGGER:PT0S' }]);
	});
});
