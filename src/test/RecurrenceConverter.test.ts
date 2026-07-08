import { describe, it, expect } from 'vitest';
import {
	rruleToTasksText,
	tasksTextToRRule,
	normalizeRepeatFlag,
} from '../utils/RecurrenceConverter';

describe('rruleToTasksText', () => {
	it('converts daily RRULE to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=DAILY')).toBe('every day');
	});

	it('converts weekly RRULE to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=WEEKLY;BYDAY=MO')).toBe('every week on Monday');
	});

	it('converts multi-day weekly RRULE to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('every week on Monday, Wednesday, Friday');
	});

	it('converts monthly by monthday RRULE to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=MONTHLY;BYMONTHDAY=15')).toBe('every month on the 15th');
	});

	it('converts monthly by weekday RRULE to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=MONTHLY;BYDAY=1MO')).toBe('every month on the 1st Monday');
	});

	it('converts RRULE with INTERVAL=2 to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=DAILY;INTERVAL=2')).toBe('every 2 days');
	});

	it('strips TT_SKIP extension before converting', () => {
		expect(rruleToTasksText('RRULE:FREQ=DAILY;TT_SKIP=WEEKEND')).toBe('every day');
	});

	it('strips TT_CALENDAR extension before converting', () => {
		expect(rruleToTasksText('RRULE:FREQ=WEEKLY;BYDAY=MO;TT_CALENDAR=20260605T000000')).toBe('every week on Monday');
	});

	it('returns null for null input', () => {
		expect(rruleToTasksText(null as unknown)).toBeNull();
	});

	it('returns null for empty string input', () => {
		expect(rruleToTasksText('')).toBeNull();
	});

	it('returns null for invalid RRULE string', () => {
		expect(rruleToTasksText('RRULE:FREQ=INVALID')).toBeNull();
	});

	it('converts yearly RRULE to text', () => {
		expect(rruleToTasksText('RRULE:FREQ=YEARLY')).toBe('every year');
	});
});

describe('tasksTextToRRule', () => {
	it('parses "every day" to daily RRULE', () => {
		const result = tasksTextToRRule('every day');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:FREQ=DAILY');
		expect(result!.repeatFrom).toBeUndefined();
	});

	it('parses "every 2 days" to daily RRULE with interval 2', () => {
		const result = tasksTextToRRule('every 2 days');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:INTERVAL=2;FREQ=DAILY');
		expect(result!.repeatFrom).toBeUndefined();
	});

	it('parses "every week on Monday" to weekly RRULE', () => {
		const result = tasksTextToRRule('every week on Monday');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
		expect(result!.repeatFrom).toBeUndefined();
	});

	it('parses "every month on the 15th" to monthly RRULE', () => {
		const result = tasksTextToRRule('every month on the 15th');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
		expect(result!.repeatFrom).toBeUndefined();
	});

	it('parses "every year" to yearly RRULE', () => {
		const result = tasksTextToRRule('every year');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:FREQ=YEARLY');
		expect(result!.repeatFrom).toBeUndefined();
	});

	it('parses "every day when done" with completedDate', () => {
		const result = tasksTextToRRule('every day when done');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:FREQ=DAILY');
		expect(result!.repeatFrom).toBe('completedDate');
	});

	it('parses "every month on the 1st Monday" to monthly by weekday', () => {
		const result = tasksTextToRRule('every month on the 1st Monday');
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).toBe('RRULE:FREQ=MONTHLY;BYDAY=+1MO');
		expect(result!.repeatFrom).toBeUndefined();
	});

	it('returns null for null input', () => {
		expect(tasksTextToRRule(null as unknown)).toBeNull();
	});

	it('returns null for empty string input', () => {
		expect(tasksTextToRRule('')).toBeNull();
	});

	it('returns null for whitespace-only input', () => {
		expect(tasksTextToRRule('   ')).toBeNull();
	});

	it('returns null for unparseable text', () => {
		expect(tasksTextToRRule('garbage text that is not recurrence')).toBeNull();
	});
});

describe('normalizeRepeatFlag', () => {
	it('returns empty string for null input', () => {
		expect(normalizeRepeatFlag(null as unknown)).toBe('');
	});

	it('returns empty string for empty input', () => {
		expect(normalizeRepeatFlag('')).toBe('');
	});

	it('normalizes daily RRULE to canonical form', () => {
		expect(normalizeRepeatFlag('RRULE:FREQ=DAILY')).toBe('RRULE:FREQ=DAILY');
	});

	it('strips INTERVAL=1 as a default', () => {
		expect(normalizeRepeatFlag('RRULE:FREQ=DAILY;INTERVAL=1')).toBe('RRULE:FREQ=DAILY');
	});

	it('preserves INTERVAL=2 as non-default', () => {
		const result = normalizeRepeatFlag('RRULE:INTERVAL=2;FREQ=DAILY');
		expect(result).toBe('RRULE:INTERVAL=2;FREQ=DAILY');
	});

	it('strips TT_SKIP extension', () => {
		expect(normalizeRepeatFlag('RRULE:FREQ=DAILY;TT_SKIP=WEEKEND')).toBe('RRULE:FREQ=DAILY');
	});

	it('normalizes yearly RRULE', () => {
		expect(normalizeRepeatFlag('RRULE:FREQ=YEARLY')).toBe('RRULE:FREQ=YEARLY');
	});
});

describe('round-trip stability', () => {
	it('daily: text -> rrule -> text is stable', () => {
		const result = tasksTextToRRule('every day');
		expect(result).not.toBeNull();
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every day');
	});

	it('every 2 days: text -> rrule -> text is stable', () => {
		const result = tasksTextToRRule('every 2 days');
		expect(result).not.toBeNull();
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every 2 days');
	});

	it('weekly Monday: text -> rrule -> text is stable', () => {
		const result = tasksTextToRRule('every week on Monday');
		expect(result).not.toBeNull();
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every week on Monday');
	});

	it('weekly Mon/Wed/Fri: text -> rrule -> text is stable', () => {
		const result = tasksTextToRRule('every week on Monday, Wednesday, Friday');
		expect(result).not.toBeNull();
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every week on Monday, Wednesday, Friday');
	});

	it('monthly on 15th: text -> rrule -> text is stable', () => {
		const result = tasksTextToRRule('every month on the 15th');
		expect(result).not.toBeNull();
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every month on the 15th');
	});

	it('yearly: text -> rrule -> text is stable', () => {
		const result = tasksTextToRRule('every year');
		expect(result).not.toBeNull();
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every year');
	});

	it('with when done: text -> rrule -> text preserves when done', () => {
		const result = tasksTextToRRule('every day when done');
		expect(result).not.toBeNull();
		expect(result!.repeatFrom).toBe('completedDate');
		const text = rruleToTasksText(result!.repeatFlag);
		expect(text).toBe('every day');
	});

	it('rrule without TT extensions -> text -> normalized rrule is semantically stable', () => {
		const original = 'RRULE:FREQ=WEEKLY;BYDAY=MO';
		const text = rruleToTasksText(original);
		expect(text).toBe('every week on Monday');
		const result = tasksTextToRRule(text!);
		expect(result).not.toBeNull();
		const normalized = normalizeRepeatFlag(result!.repeatFlag);
		expect(normalized).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
	});

	it('rrule with TT_SKIP -> text -> normalized rrule strips TT_SKIP', () => {
		const original = 'RRULE:FREQ=DAILY;TT_SKIP=WEEKEND';
		const text = rruleToTasksText(original);
		expect(text).toBe('every day');
		const result = tasksTextToRRule(text!);
		expect(result).not.toBeNull();
		expect(result!.repeatFlag).not.toContain('TT_SKIP');
		expect(result!.repeatFlag).toBe('RRULE:FREQ=DAILY');
	});
});
