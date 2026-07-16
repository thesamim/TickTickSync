import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('DateMan.addDateHolderToTask preservation', () => {
	let dateMan: DateMan;

	beforeEach(() => {
		dateMan = new DateMan();
	});

	it('should preserve scheduled_date from oldTask when it is not in newTask', () => {
		const oldTask: ITask = {
			id: '1',
			title: 'Task 1',
			dateHolder: {
				isAllDay: true,
				scheduled_date: {
					hasATime: false,
					date: '2025-01-10',
					time: '',
					isoDate: '2025-01-10T00:00:00.000+0000',
					emoji: '⏳'
				},
				cancelled_date: null,
				createdTime: null,
				completedTime: null,
				dueDate: null,
				startDate: null
			}
		} as unknown;

		const newTask: ITask = {
			id: '1',
			title: 'Task 1 (updated)',
			isAllDay: true,
			dueDate: '2025-01-10T00:00:00.000+0000',
			startDate: '2025-01-10T00:00:00.000+0000'
		} as unknown;

		dateMan.addDateHolderToTask(newTask, oldTask);

		expect(newTask.dateHolder).toBeDefined();
		// This is expected to FAIL currently because scheduled_date is not preserved
		expect(newTask.dateHolder.scheduled_date).toEqual(oldTask.dateHolder.scheduled_date);
	});

	it('should preserve cancelled_date and createdTime from oldTask', () => {
		const oldTask: ITask = {
			id: '1',
			dateHolder: {
				isAllDay: true,
				cancelled_date: { date: '2025-01-01', emoji: '❌' },
				createdTime: { date: '2025-01-01', emoji: '➕' },
				scheduled_date: null,
				completedTime: null,
				dueDate: null,
				startDate: null
			}
		} as unknown;

		const newTask: ITask = {
			id: '1',
			isAllDay: true,
			dueDate: '2025-01-10T00:00:00.000+0000',
			startDate: '2025-01-10T00:00:00.000+0000'
		} as unknown;

		dateMan.addDateHolderToTask(newTask, oldTask);

		expect(newTask.dateHolder.cancelled_date).toEqual(oldTask.dateHolder.cancelled_date);
		expect(newTask.dateHolder.createdTime).toEqual(oldTask.dateHolder.createdTime);
	});

	it('should NOT update scheduled_date from task.startDate (it is Obsidian-only)', () => {
		const oldTask: ITask = {
			id: '1',
			dateHolder: {
				isAllDay: true,
				scheduled_date: {
					date: '2025-01-10',
					emoji: '⏳'
				},
				cancelled_date: null,
				createdTime: null,
				completedTime: null,
				dueDate: null,
				startDate: null
			}
		} as unknown;

		const newTask: ITask = {
			id: '1',
			isAllDay: true,
			dueDate: '2025-01-15T12:00:00.000+0000',
			startDate: '2025-01-14T12:00:00.000+0000' // Use midday to avoid TZ shifts in tests
		} as unknown;

		dateMan.addDateHolderToTask(newTask, oldTask);

		// scheduled_date should remain as it was in oldTask
		expect(newTask.dateHolder.scheduled_date.date).toBe('2025-01-10');
		// task.startDate should go to startDate (🛫)
		expect(newTask.dateHolder.startDate.date).toBe('2025-01-14');
		expect(newTask.dateHolder.startDate.emoji).toBe('🛫');
	});
});
