/**
 * Scope: DateMan.parseDates() producing a correct, timezone-aware isoDate
 * for all-day (date-only) values -- the #366 regression and its 2026-07-27
 * follow-up correction.
 *
 * TickTick interprets an all-day task's dueDate relative to the task's own
 * timeZone field, not UTC (confirmed live: a naive UTC-midnight value
 * displayed as the wrong day in TickTick's own UI for a UTC-negative
 * zone). So the correct isoDate is the actual UTC instant corresponding to
 * midnight of the given date *in the task's timezone* -- not a literal
 * "just append Z" UTC midnight, and not dependent on host OS timezone
 * either.
 *
 * Distinct from dateMan_scheduled.test.ts, which covers
 * addDateHolderToTask's field *preservation* logic (merging old/new task
 * date holders), not date parsing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateMan } from '../dateMan';

// Mock logger to avoid window.moment issues
vi.mock('@/utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	}
}));

describe('DateMan.parseDates all-day timezone handling (#366)', () => {
	let dateMan: DateMan;
	let originalTZ: string | undefined;

	beforeEach(() => {
		dateMan = new DateMan();
		originalTZ = process.env.TZ;
	});

	afterEach(() => {
		process.env.TZ = originalTZ;
	});

	it.each([
		// [task timeZone, date, expected UTC isoDate for midnight in that zone]
		['America/Mexico_City', '2026-07-27', '2026-07-27T06:00:00.000+0000'], // UTC-6, no DST
		['Pacific/Kiritimati', '2026-08-09', '2026-08-08T10:00:00.000+0000'], // UTC+14
		['UTC', '2026-08-09', '2026-08-09T00:00:00.000+0000'],
	])('resolves midnight in task timeZone %s on %s to the correct UTC instant', (timeZone, date, expectedIsoDate) => {
		const result = dateMan.parseDates(`Some task 📅 ${date}`, timeZone);

		expect(result.dueDate).toMatchObject({ date, isoDate: expectedIsoDate });
	});

	it('is unaffected by host OS timezone -- only the passed timeZone parameter matters', () => {
		const line = 'Some task 📅 2026-07-27';
		const taskTimeZone = 'America/Mexico_City';

		process.env.TZ = 'Pacific/Kiritimati'; // host far ahead of UTC
		const eastHost = dateMan.parseDates(line, taskTimeZone);

		process.env.TZ = 'Etc/GMT+12'; // host far behind UTC
		const westHost = dateMan.parseDates(line, taskTimeZone);

		expect(eastHost.dueDate?.isoDate).toBe('2026-07-27T06:00:00.000+0000');
		expect(westHost.dueDate?.isoDate).toBe(eastHost.dueDate?.isoDate);
	});

	it('produces an identical isoDate on repeated parses of the same line', () => {
		// isoDate (not date, which is just an echo of the regex match) is
		// the field #366 actually affects. Guards against any per-call
		// state drift in DateMan itself.
		const line = 'Some task 📅 2026-08-09';

		const isoDates = Array.from({ length: 5 }, () => dateMan.parseDates(line, 'Pacific/Kiritimati').dueDate?.isoDate);

		expect(isoDates).toEqual(Array(5).fill('2026-08-08T10:00:00.000+0000'));
	});
});
