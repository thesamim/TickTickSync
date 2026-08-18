import { describe, expect, it } from 'vitest';
import {
	normalizeTrigger,
	parseReminderDuration,
	parseReminderText,
	secondsToISODuration,
	secondsToShorthand,
	secondsToTrigger,
	toApiTrigger,
	triggerToSeconds,
} from '@/utils/ReminderConverter';

describe('parseReminderDuration', () => {
	it('parses shorthand durations', () => {
		expect(parseReminderDuration('30m')).toBe(1800);
		expect(parseReminderDuration('1h')).toBe(3600);
		expect(parseReminderDuration('1h30m')).toBe(5400);
		expect(parseReminderDuration('1d')).toBe(86400);
		expect(parseReminderDuration('1w')).toBe(604800);
		expect(parseReminderDuration('0m')).toBe(0);
		expect(parseReminderDuration('1h30m15s')).toBe(5415);
	});

	it('parses "on time" as zero lead', () => {
		expect(parseReminderDuration('on time')).toBe(0);
		expect(parseReminderDuration('On Time')).toBe(0);
	});

	it('parses ISO 8601 durations', () => {
		expect(parseReminderDuration('PT30M')).toBe(1800);
		expect(parseReminderDuration('PT1H30M')).toBe(5400);
		expect(parseReminderDuration('P1D')).toBe(86400);
		expect(parseReminderDuration('P1DT1H')).toBe(90000);
		expect(parseReminderDuration('P0DT9H0M0S')).toBe(32400);
		expect(parseReminderDuration('PT0S')).toBe(0);
	});

	it('rejects invalid input', () => {
		expect(parseReminderDuration('')).toBeNull();
		expect(parseReminderDuration('banana')).toBeNull();
		expect(parseReminderDuration('30x')).toBeNull();
		expect(parseReminderDuration('1h 30m')).toBeNull();
		expect(parseReminderDuration('P')).toBeNull();
		expect(parseReminderDuration('PT')).toBeNull();
	});
});

describe('secondsToShorthand / secondsToISODuration / secondsToTrigger', () => {
	it('formats shorthand', () => {
		expect(secondsToShorthand(1800)).toBe('30m');
		expect(secondsToShorthand(5400)).toBe('1h30m');
		expect(secondsToShorthand(86400)).toBe('1d');
		expect(secondsToShorthand(604800)).toBe('1w');
		expect(secondsToShorthand(0)).toBe('0m');
	});

	it('formats ISO durations', () => {
		expect(secondsToISODuration(1800)).toBe('PT30M');
		expect(secondsToISODuration(32400)).toBe('PT9H');
		expect(secondsToISODuration(86400)).toBe('P1D');
		expect(secondsToISODuration(0)).toBe('PT0S');
	});

	it('formats TRIGGER values', () => {
		expect(secondsToTrigger(1800)).toBe('TRIGGER:PT30M');
		expect(secondsToTrigger(0)).toBe('TRIGGER:PT0S');
		expect(secondsToTrigger(32400)).toBe('TRIGGER:PT9H');
	});
});

describe('triggerToSeconds', () => {
	it('parses relative TRIGGER values', () => {
		expect(triggerToSeconds('TRIGGER:PT30M')).toBe(1800);
		expect(triggerToSeconds('TRIGGER:P0DT9H0M0S')).toBe(32400);
		expect(triggerToSeconds('TRIGGER:PT0S')).toBe(0);
	});

	it('parses negative (RFC 5545 "before") TRIGGER values', () => {
		expect(triggerToSeconds('TRIGGER:-PT35M')).toBe(2100);
		expect(triggerToSeconds('TRIGGER:-P1D')).toBe(86400);
		expect(triggerToSeconds('TRIGGER:-PT1H30M')).toBe(5400);
		expect(triggerToSeconds('TRIGGER:-PT0S')).toBe(0);
	});

	it('returns null for absolute date-time triggers and garbage', () => {
		expect(triggerToSeconds('TRIGGER:20260820T150000Z')).toBeNull();
		expect(triggerToSeconds('TRIGGER:-20260820T150000Z')).toBeNull();
		expect(triggerToSeconds('')).toBeNull();
		expect(triggerToSeconds('nope')).toBeNull();
	});
});

describe('normalizeTrigger', () => {
	it('canonicalizes equivalent TRIGGER values', () => {
		expect(normalizeTrigger('TRIGGER:PT35M')).toBe('TRIGGER:PT35M');
		expect(normalizeTrigger('TRIGGER:-PT35M')).toBe('TRIGGER:PT35M');
		expect(normalizeTrigger('TRIGGER:PT0S')).toBe('TRIGGER:PT0S');
		expect(normalizeTrigger('TRIGGER:P0DT9H0M0S')).toBe('TRIGGER:PT9H');
	});

	it('returns absolute date-time triggers unchanged', () => {
		expect(normalizeTrigger('TRIGGER:20260820T150000Z')).toBe('TRIGGER:20260820T150000Z');
	});
});

describe('toApiTrigger', () => {
	it('negates before-due triggers into minutes form (TickTick create/update shape)', () => {
		expect(toApiTrigger('TRIGGER:PT30M')).toBe('TRIGGER:-PT30M');
		expect(toApiTrigger('TRIGGER:P1D')).toBe('TRIGGER:-PT1440M');
		expect(toApiTrigger('TRIGGER:P7D')).toBe('TRIGGER:-PT10080M');
		expect(toApiTrigger('TRIGGER:PT1H30M')).toBe('TRIGGER:-PT90M');
	});

	it('keeps already-negative triggers as-is', () => {
		expect(toApiTrigger('TRIGGER:-PT35M')).toBe('TRIGGER:-PT35M');
		expect(toApiTrigger('TRIGGER:-PT1440M')).toBe('TRIGGER:-PT1440M');
	});

	it('keeps the on-time trigger unsigned', () => {
		expect(toApiTrigger('TRIGGER:PT0S')).toBe('TRIGGER:PT0S');
	});

	it('passes absolute date-time triggers through unchanged', () => {
		expect(toApiTrigger('TRIGGER:20260820T150000Z')).toBe('TRIGGER:20260820T150000Z');
	});
});

describe('parseReminderText', () => {
	it('parses a duration into a TRIGGER', () => {
		expect(parseReminderText('30m')).toEqual({ trigger: 'TRIGGER:PT30M' });
		expect(parseReminderText('PT30M')).toEqual({ trigger: 'TRIGGER:PT30M' });
		expect(parseReminderText('on time')).toEqual({ trigger: 'TRIGGER:PT0S' });
	});

	it('parses "off" as an explicit clear', () => {
		expect(parseReminderText('off')).toEqual({ clear: true });
		expect(parseReminderText('OFF')).toEqual({ clear: true });
	});

	it('rejects invalid values', () => {
		expect(parseReminderText('banana')).toBeNull();
		expect(parseReminderText('')).toBeNull();
		expect(parseReminderText('  ')).toBeNull();
	});
});
