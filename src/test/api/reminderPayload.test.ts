import { describe, expect, it, vi, type Mock } from 'vitest';
import { Tick } from '@/api/index';
import type { ITask } from '@/api/types/Task';

vi.mock('obsidian', () => ({
	Platform: { isIosApp: false, isAndroidApp: false, isDesktopApp: true, isMobileApp: false },
	requestUrl: vi.fn(),
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({})),
	updateSettings: vi.fn(),
}));

function makeApi(): { tick: Tick; mock: Mock } {
	const tick = new Tick({
		username: 'user',
		password: 'pass',
		baseUrl: 'ticktick.com',
		token: 'token',
		checkPoint: 123,
	});
	const mock = vi.spyOn(tick, 'makeRequest') as unknown as Mock;
	mock.mockResolvedValue({ sortOrder: 5 });
	return { tick, mock };
}

function makeTask(overrides: Partial<ITask> = {}): ITask {
	return {
		id: 'task-1',
		projectId: 'proj-1',
		title: 'Meeting',
		status: 0,
		priority: 0,
		isAllDay: false,
		timeZone: 'America/Chicago',
		reminders: [],
		...overrides,
	} as ITask;
}

describe('addTask payload reminders', () => {
	it('sends reminders with client-generated ObjectIds on create', async () => {
		const { tick, mock } = makeApi();
		const task = makeTask({ reminders: [{ trigger: 'TRIGGER:PT30M' }, { trigger: 'TRIGGER:P1D' }] });

		await tick.addTask(task);

		const body = mock.mock.calls[0][3];
		expect(body.reminders).toHaveLength(2);
		expect(body.reminders[0]).toEqual({
			id: expect.stringMatching(/^[a-f0-9]{24}$/),
			trigger: 'TRIGGER:PT30M',
		});
		expect(body.reminders[1]).toEqual({
			id: expect.stringMatching(/^[a-f0-9]{24}$/),
			trigger: 'TRIGGER:P1D',
		});
		expect(body.reminders[0].id).not.toBe(body.reminders[1].id);
	});

	it('sets the singular reminder field to the first trigger on create', async () => {
		const { tick, mock } = makeApi();
		const task = makeTask({ reminders: [{ trigger: 'TRIGGER:PT30M' }, { trigger: 'TRIGGER:P1D' }] });

		await tick.addTask(task);

		const body = mock.mock.calls[0][3];
		expect(body.reminder).toBe('TRIGGER:PT30M');
	});

	it('sends an empty reminders array when there are none', async () => {
		const { tick, mock } = makeApi();

		await tick.addTask(makeTask({ reminders: [] }));

		const body = mock.mock.calls[0][3];
		expect(body.reminders).toEqual([]);
	});

	it('replaces local reminder ids on create because no remote reminder exists yet', async () => {
		const { tick, mock } = makeApi();
		const task = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });

		await tick.addTask(task);

		const body = mock.mock.calls[0][3];
		expect(body.reminders).toEqual([{
			id: expect.stringMatching(/^[a-f0-9]{24}$/),
			trigger: 'TRIGGER:PT30M',
		}]);
		expect(body.reminders[0].id).not.toBe('r1');
	});

	it('returns the created task directly', async () => {
		const { tick, mock } = makeApi();
		const created = { id: 'task-1', projectId: 'proj-1', title: 'Meeting', sortOrder: 7 };
		mock.mockResolvedValue(created);

		const result = await tick.addTask(makeTask());

		expect(result).toEqual(created);
	});

	it('unwraps an {ok, result} response from POST /task', async () => {
		const { tick, mock } = makeApi();
		const created = { id: 'task-1', projectId: 'proj-1', title: 'Meeting', sortOrder: 7 };
		mock.mockResolvedValue({ ok: true, result: created });

		const result = await tick.addTask(makeTask());

		expect(result).toEqual(created);
		expect(tick.inboxProperties.sortOrder).toBe(6);
	});
});

describe('updateTask payload reminders', () => {
	it('preserves existing reminder ids and generates ObjectIds for new reminders on update', async () => {
		const { tick, mock } = makeApi();
		const task = makeTask({
			reminders: [{ id: 'r1', trigger: 'TRIGGER:-PT35M' }, { trigger: 'TRIGGER:PT30M' }],
		});

		await tick.updateTask(task);

		const payload = mock.mock.calls[0][3];
		expect(payload.update[0].reminders).toEqual([
			{ id: 'r1', trigger: 'TRIGGER:-PT35M' },
			{ id: expect.stringMatching(/^[a-f0-9]{24}$/), trigger: 'TRIGGER:PT30M' },
		]);
	});

	it('sends an empty reminders array when there are none', async () => {
		const { tick, mock } = makeApi();

		await tick.updateTask(makeTask({ reminders: [] }));

		const payload = mock.mock.calls[0][3];
		expect(payload.update[0].reminders).toEqual([]);
	});
});
