/**
 * Regression test for issue #209 - "Completion Date synchronization".
 *
 * Scenario (reported 2025-01-12):
 * 1. A task in TickTick with NO due date is completed. The user then edits
 *    the completion date on TickTick's "Completed tasks" page (e.g. from
 *    today back to yesterday).
 * 2. First sync: Obsidian updates correctly and the completion mark shows
 *    yesterday's date.
 * 3. Second sync: the plugin detects a spurious "due date changed" and
 *    pushes an update to TickTick, which reverts the completion date to
 *    today.
 *
 * The spurious push happens when DateMan builds a dateHolder entry for an
 * empty/absent due date (TickTick returns `dueDate: null`/`""` for tasks
 * without a due date). That garbage entry (1970-01-01 / 'Invalid Date')
 * makes `areDatesChanged` report the dates as modified on the pull-write-
 * reparse round trip, so the plugin pushes the task back to TickTick.
 */

import { describe, it, expect, vi } from 'vitest';
import { DateMan } from '../dateMan';
import type { ITask } from '../api/types/Task';

// Mock logger to avoid window.moment issues
vi.mock('@/utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	}
}));

const TZ = 'America/Mexico_City';

function buildCompletedTask(extra: Record<string, unknown> = {}): ITask {
	return {
		id: 'abc123',
		projectId: 'proj1',
		title: 'Task without due date',
		content: '',
		desc: '',
		status: 2,
		isAllDay: true,
		priority: 0,
		items: [],
		progress: 0,
		deleted: 0,
		childIds: [],
		parentId: '',
		sortOrder: 0,
		reminder: '',
		reminders: [],
		repeatFlag: '',
		modifiedTime: '2025-01-12T08:00:00.000+0000',
		completedTime: '2025-01-11T10:00:00.000+0000', // yesterday
		dateHolder: {} as never,
		lineHash: '',
		...extra
	};
}

describe('issue #209 - completion date round trip', () => {
	let dateMan: DateMan;

	beforeEach(() => {
		dateMan = new DateMan();
		process.env.TZ = TZ;
	});

	it.each([
		['dueDate absent', {}],
		['dueDate null', { dueDate: null }],
		['dueDate empty string', { dueDate: '' }],
		['dueDate null + startDate null', { dueDate: null, startDate: null }],
	])('%s: does not manufacture a date for a task with no due date', (_, extra) => {
		const task = buildCompletedTask(extra);
		dateMan.addDateHolderToTask(task, undefined);

		expect(task.dateHolder.dueDate).toBeNull();
		expect(task.dateHolder.startDate).toBeNull();
		// The completion date must be kept, since that is what the user edited.
		expect(task.dateHolder.completedTime).not.toBeNull();
	});

	it('pull-write-reparse does not report a date change for a completed no-due-date task', () => {
		const savedTask = buildCompletedTask({ dueDate: null, startDate: null });
		dateMan.addDateHolderToTask(savedTask, undefined);

		// 1. Write the task to an Obsidian line (what synchronizeToVault does).
		const baseLine = `- [x] ${savedTask.title} #ticktick %%[ticktick_id:: ${savedTask.id}]%%`;
		const line = dateMan.addDatesToLine(baseLine, savedTask);
		expect(line).toContain('✅ 2025-01-11');

		// 2. Re-parse the line (what checkLineForModifications does on the
		//    next sync).
		const editedTask = { ...savedTask, dateHolder: dateMan.parseDates(line, TZ) } as ITask;

		// 3. The two date holders must agree; otherwise the plugin pushes a
		//    task update back to TickTick, which reverts the completed date.
		const changed = dateMan.areDatesChanged(editedTask, savedTask);

		expect(changed).toBe(false);
	});
});
