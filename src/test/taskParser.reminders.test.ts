/**
 * Scope: TaskParser reminder syntax (`⏰ <duration>`), round-trip between
 * lines and ITask, and the reminder preservation helpers.
 */
import { describe, expect, it, vi } from 'vitest';
import { TaskParser } from '@/taskParser';
import type { ITask } from '@/api/types/Task';
import { getSettings } from '@/settings';

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn().mockResolvedValue([]),
}));

function makePlugin(parser: TaskParser) {
	return {
		taskParser: parser,
		fileTaskQueries: {
			getDefaultProjectIdForFilepath: (_: string) => 'proj-1',
		},
		fileMetadataService: {
			getFilepathForTask: (_: string) => 'Folder/File.md',
		},
		dateMan: {
			parseDates: (_: string) => ({}),
			stripDatesFromLine: (s: string) => s,
			addDatesToLine: (s: string) => s,
			formatDateToISO: (_: Date) => '2025-01-01T00:00:00.000Z',
		},
		app: { vault: { getName: () => 'TestVault' } },
	} as unknown;
}

function makeFileMap(line: string) {
	return {
		getTaskRecord: (_: string) => ({ task: line, parentId: '', taskLines: [] }),
		getTaskRecordByLine: (_: number) => ({ task: line, parentId: '', taskLines: [] }),
		getTaskItems: (_: string) => [],
	} as unknown;
}

function makeParser(): TaskParser {
	((getSettings as unknown as () => Record<string, string>)()).fileLinksInTickTick = 'noLink';
	((getSettings as unknown as () => Record<string, string>)()).noteDelimiter = '';
	const parser = new TaskParser({} as unknown, {} as unknown);
	parser.plugin = makePlugin(parser);
	return parser;
}

function makeTask(overrides: Partial<ITask> = {}): ITask {
	return {
		id: 'abcdefabcdefabcdefabcdef',
		projectId: 'proj-1',
		title: 'Meeting',
		status: 0,
		tags: [],
		priority: 0,
		desc: '',
		content: '',
		items: [],
		reminders: [],
		...overrides,
	} as ITask;
}

describe('convertLineToTask reminder parsing', () => {
	it('parses a shorthand reminder into a TRIGGER', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([{ trigger: 'TRIGGER:PT30M' }]);
		expect(task.clearReminders).toBeUndefined();
	});

	it('parses an ISO duration the same as shorthand', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ PT30M #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([{ trigger: 'TRIGGER:PT30M' }]);
	});

	it('parses multiple reminders', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m ⏰ 1d #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([
			{ trigger: 'TRIGGER:PT30M' },
			{ trigger: 'TRIGGER:P1D' },
		]);
	});

	it('parses "on time" as PT0S', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ on time #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([{ trigger: 'TRIGGER:PT0S' }]);
	});

	it('treats "off" as an explicit clear', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ off #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([]);
		expect(task.clearReminders).toBe(true);
	});

	it('clears when any token is "off", even with other tokens', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m ⏰ off #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([]);
		expect(task.clearReminders).toBe(true);
	});

	it('produces no reminders when the line has none', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([]);
		expect(task.clearReminders).toBeUndefined();
	});

	it('strips the reminder out of the title/content', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.title).toBe('Meeting');
		expect(task.title).not.toContain('⏰');
		expect(task.title).not.toContain('30m');
	});
});

describe('convertTaskToLine reminder rendering', () => {
	it('renders relative reminders as shorthand', async () => {
		const parser = makeParser();
		const task = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		const line = await parser.convertTaskToLine(task, 0);

		expect(line).toContain('⏰ 30m');
	});

	it('renders multiple reminders', async () => {
		const parser = makeParser();
		const task = makeTask({
			reminders: [
				{ id: 'r1', trigger: 'TRIGGER:PT30M' },
				{ id: 'r2', trigger: 'TRIGGER:P1D' },
			],
		});
		const line = await parser.convertTaskToLine(task, 0);

		expect(line).toContain('⏰ 30m');
		expect(line).toContain('⏰ 1d');
	});

	it('renders reminders with negative RFC 5545 triggers (TickTick pull)', async () => {
		const parser = makeParser();
		const task = makeTask({
			reminders: [
				{ id: 'r1', trigger: 'TRIGGER:PT0S' },
				{ id: 'r2', trigger: 'TRIGGER:-PT35M' },
			],
		});
		const line = await parser.convertTaskToLine(task, 0);

		expect(line).toContain('⏰ 0m');
		expect(line).toContain('⏰ 35m');
	});

	it('omits absolute date-time triggers from the line', async () => {
		const parser = makeParser();
		const task = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:20260820T150000Z' }] });
		const line = await parser.convertTaskToLine(task, 0);

		expect(line).not.toContain('⏰');
	});

	it('renders nothing when there are no reminders', async () => {
		const parser = makeParser();
		const task = makeTask({ reminders: [] });
		const line = await parser.convertTaskToLine(task, 0);

		expect(line).not.toContain('⏰');
	});

	it('round-trips line -> task -> line', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		const rendered = await parser.convertTaskToLine(task, 0);
		expect(rendered).toContain('⏰ 30m');
	});

	it('renders reminders before priority, recurrence, and dates', async () => {
		const parser = makeParser();
		(parser.plugin as { dateMan: Record<string, unknown> }).dateMan.addDatesToLine = (s: string) => s + ' 📅 2026-08-15';
		const task = makeTask({
			priority: 5,
			repeatFlag: 'RRULE:FREQ=DAILY',
			dueDate: '2026-08-15T10:00:00.000+0000',
			startDate: '',
			reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }],
		});
		const line = await parser.convertTaskToLine(task, 0);

		const reminderPos = line.indexOf('⏰');
		const priorityPos = line.indexOf('⏫');
		const datePos = line.indexOf('📅');
		expect(reminderPos).toBeGreaterThan(-1);
		expect(priorityPos).toBeGreaterThan(reminderPos);
		expect(datePos).toBeGreaterThan(priorityPos);
	});

	it('parses a reminder that is immediately followed by a priority emoji', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m ⏫ #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([{ trigger: 'TRIGGER:PT30M' }]);
		expect(task.priority).toBe(5);
		expect(task.title).toBe('Meeting');
	});

	it('round-trips a reminder placed before a full emoji cluster', async () => {
		const parser = makeParser();
		const line = '- [ ] Meeting ⏰ 30m ⏫ 🔁 every day 📅 2026-08-15 #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
		const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

		expect(task.reminders).toEqual([{ trigger: 'TRIGGER:PT30M' }]);
		const rendered = await parser.convertTaskToLine(task, 0);
		expect(rendered).toContain('⏰ 30m');
	});
});

describe('areRemindersChanged', () => {
	it('is false when both sides are empty', () => {
		const parser = makeParser();
		expect(parser.areRemindersChanged(makeTask(), makeTask())).toBe(false);
	});

	it('is true when a reminder was added', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT30M' }] });
		expect(parser.areRemindersChanged(lineTask, makeTask())).toBe(true);
	});

	it('is true when a reminder was removed', () => {
		const parser = makeParser();
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		expect(parser.areRemindersChanged(makeTask(), savedTask)).toBe(true);
	});

	it('is true when a reminder value changed', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT30M' }] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT1H' }] });
		expect(parser.areRemindersChanged(lineTask, savedTask)).toBe(true);
	});

	it('is false when the same reminders are present in a different order', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT30M' }, { trigger: 'TRIGGER:P1D' }] });
		const savedTask = makeTask({ reminders: [{ id: 'r2', trigger: 'TRIGGER:P1D' }, { id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		expect(parser.areRemindersChanged(lineTask, savedTask)).toBe(false);
	});

	it('is false when triggers differ only by RFC 5545 sign', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT35M' }] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:-PT35M' }] });
		expect(parser.areRemindersChanged(lineTask, savedTask)).toBe(false);
	});

	it('is true on an explicit clear when reminders exist', () => {
		const parser = makeParser();
		const lineTask = makeTask({ clearReminders: true, reminders: [] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		expect(parser.areRemindersChanged(lineTask, savedTask)).toBe(true);
	});

	it('is false on an explicit clear when nothing to clear', () => {
		const parser = makeParser();
		const lineTask = makeTask({ clearReminders: true, reminders: [] });
		expect(parser.areRemindersChanged(lineTask, makeTask())).toBe(false);
	});
});

describe('preserveReminders', () => {
	it('carries saved reminders over when the line has none', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		parser.preserveReminders(lineTask, savedTask);

		expect(lineTask.reminders).toEqual([{ id: 'r1', trigger: 'TRIGGER:PT30M' }]);
	});

	it('does nothing when both sides are empty', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [] });
		parser.preserveReminders(lineTask, makeTask());

		expect(lineTask.reminders).toEqual([]);
	});

	it('clears reminders on an explicit `⏰ off`', () => {
		const parser = makeParser();
		const lineTask = makeTask({ clearReminders: true, reminders: [] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		parser.preserveReminders(lineTask, savedTask);

		expect(lineTask.reminders).toEqual([]);
	});

	it('merges TickTick ids onto matching line reminders', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT30M' }] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		parser.preserveReminders(lineTask, savedTask);

		expect(lineTask.reminders).toEqual([{ id: 'r1', trigger: 'TRIGGER:PT30M' }]);
	});

	it('merges ids across an RFC 5545 sign difference and keeps the TickTick trigger', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT35M' }] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:-PT35M' }] });
		parser.preserveReminders(lineTask, savedTask);

		expect(lineTask.reminders).toEqual([{ id: 'r1', trigger: 'TRIGGER:-PT35M' }]);
	});

	it('leaves changed reminders without a stale id', () => {
		const parser = makeParser();
		const lineTask = makeTask({ reminders: [{ trigger: 'TRIGGER:PT1H' }] });
		const savedTask = makeTask({ reminders: [{ id: 'r1', trigger: 'TRIGGER:PT30M' }] });
		parser.preserveReminders(lineTask, savedTask);

		expect(lineTask.reminders).toEqual([{ trigger: 'TRIGGER:PT1H' }]);
	});
});

describe('settings-dependent parsing', () => {
	it('still parses reminders when stopInjectingTickTickTag is enabled', async () => {
		((getSettings as unknown as () => Record<string, unknown>)()).stopInjectingTickTickTag = true;
		try {
			const parser = makeParser();
			const line = '- [ ] Meeting ⏰ 30m #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%';
			const task = await parser.convertLineToTask(line, 0, 'Folder/File.md', makeFileMap(line), null);

			expect(task.reminders).toEqual([{ trigger: 'TRIGGER:PT30M' }]);
		} finally {
			((getSettings as unknown as () => Record<string, unknown>)()).stopInjectingTickTickTag = false;
		}
	});
});
