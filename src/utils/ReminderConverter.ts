/**
 * Reminder duration helpers.
 *
 * TickTick stores reminders as RFC 5545 TRIGGER values that are *relative*
 * to the task's start/due time, e.g. `TRIGGER:PT30M` or `TRIGGER:-PT35M`
 * (both mean "30/35 minutes before"; the leading `-` is the RFC 5545 "before"
 * sign) and `TRIGGER:P0DT9H0M0S` (9 hours before -- TickTick's "on time" for
 * all-day tasks). Obsidian lines use a compact shorthand: `30m`, `1h30m`,
 * `1d`, `1w`.
 *
 * Round-trip:
 *   line `⏰ 30m`  ->  trigger `TRIGGER:PT30M`  ->  line `⏰ 30m`
 */

const UNIT_TO_SECONDS: Record<string, number> = {
	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
	w: 604800,
};

const SHORTHAND_TOKEN = /(\d+(?:\.\d+)?)([smhdw])/gi;

const ISO_DURATION = /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

/** A reminder lead time in seconds (0 = on time). */
export type ReminderLeadSeconds = number;

/**
 * Parse user-written reminder text (the part after `⏰`). Returns either a
 * TRIGGER value, an explicit "clear all reminders" marker, or null if the
 * text is not a valid reminder.
 */
export function parseReminderText(text: string): { trigger: string } | { clear: true } | null {
	const trimmed = (text ?? '').trim();
	if (!trimmed) return null;
	if (trimmed.toLowerCase() === 'off') return { clear: true };
	const seconds = parseReminderDuration(trimmed);
	if (seconds === null) return null;
	return { trigger: secondsToTrigger(seconds) };
}

/**
 * Parse a shorthand (`30m`, `1h30m`, `1d`, `0m`, `on time`) or ISO 8601
 * duration (`PT30M`, `P1D`, `P0DT9H0M0S`) into a lead time in seconds.
 */
export function parseReminderDuration(text: string): ReminderLeadSeconds | null {
	const trimmed = (text ?? '').trim();
	if (!trimmed) return null;
	if (/^on time$/i.test(trimmed)) return 0;
	const isoSeconds = parseISODuration(trimmed);
	if (isoSeconds !== null) return isoSeconds;
	return parseShorthandDuration(trimmed);
}

/**
 * Convert a TRIGGER value (`TRIGGER:PT30M`, `TRIGGER:-PT35M`) back to a lead
 * time in seconds. A leading `-` (RFC 5545 "before" sign) is treated the same
 * as TickTick's bare positive values. Returns null for absolute date-time
 * triggers, which cannot be expressed as a lead time.
 */
export function triggerToSeconds(trigger: string): ReminderLeadSeconds | null {
	if (!trigger) return null;
	const value = trigger.replace(/^TRIGGER:/i, '').trim();
	if (!value) return null;
	const unsigned = value.startsWith('-') ? value.slice(1) : value;
	if (/^\d{8}T\d{6}/.test(unsigned)) return null;
	return parseReminderDuration(unsigned);
}

/**
 * Normalize a TRIGGER value to the canonical form produced by this plugin
 * (`TRIGGER:PT30M`), so equivalent values (`TRIGGER:PT35M` vs
 * `TRIGGER:-PT35M`) compare equal. Absolute date-time triggers are returned
 * unchanged.
 */
export function normalizeTrigger(trigger: string): string {
	const seconds = triggerToSeconds(trigger);
	if (seconds === null) return trigger;
	return secondsToTrigger(seconds);
}

/**
 * Format a trigger for the TickTick *create/update* API. TickTick stores
 * "before due" reminders as negative RFC 5545 triggers in minutes form
 * (e.g. `TRIGGER:-PT35M`) and rejects positive relative triggers
 * (`TRIGGER:PT30M`, `TRIGGER:P1D`) with a 500, since a positive relative
 * TRIGGER means "after" per RFC 5545. `TRIGGER:PT0S` (on time) carries no
 * sign. Absolute date-time triggers are returned unchanged.
 */
export function toApiTrigger(trigger: string): string {
	const normalized = normalizeTrigger(trigger);
	const duration = normalized.replace(/^TRIGGER:/i, '').trim();
	if (!duration || duration === 'PT0S') return normalized;
	const seconds = triggerToSeconds(normalized);
	if (seconds === null) return normalized;
	return `TRIGGER:-PT${Math.round(seconds / 60)}M`;
}

/** Format a lead time as an RFC 5545 TRIGGER value, e.g. `TRIGGER:PT30M`. */
export function secondsToTrigger(totalSeconds: ReminderLeadSeconds): string {
	return `TRIGGER:${secondsToISODuration(totalSeconds)}`;
}

/** Format a lead time as a compact Obsidian shorthand, e.g. `1h30m`, `0m`. */
export function secondsToShorthand(totalSeconds: ReminderLeadSeconds): string {
	const seconds = Math.round(totalSeconds);
	if (seconds <= 0) return '0m';
	const parts: string[] = [];
	let remaining = seconds;
	for (const [size, label] of [[604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's']] as const) {
		if (remaining >= size) {
			const count = Math.floor(remaining / size);
			parts.push(`${count}${label}`);
			remaining -= count * size;
		}
	}
	return parts.join('');
}

/** Format a lead time as an ISO 8601 duration, e.g. `PT1H30M`, `P1D`. */
export function secondsToISODuration(totalSeconds: ReminderLeadSeconds): string {
	const seconds = Math.round(totalSeconds);
	if (seconds <= 0) return 'PT0S';
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const time = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${secs ? `${secs}S` : ''}`;
	if (days > 0) {
		return `P${days}D${time ? `T${time}` : ''}`;
	}
	return time ? `PT${time}` : 'PT0S';
}

function parseISODuration(text: string): ReminderLeadSeconds | null {
	const match = text.match(ISO_DURATION);
	if (!match) return null;
	const [, weeks, days, hours, minutes, seconds] = match;
	if (weeks === undefined && days === undefined && hours === undefined && minutes === undefined && seconds === undefined) {
		return null;
	}
	const toNumber = (v: string | undefined): number => (v === undefined ? 0 : parseFloat(v));
	return (
		toNumber(weeks) * 604800 +
		toNumber(days) * 86400 +
		toNumber(hours) * 3600 +
		toNumber(minutes) * 60 +
		toNumber(seconds)
	);
}

function parseShorthandDuration(text: string): ReminderLeadSeconds | null {
	let total = 0;
	let consumed = 0;
	const regex = new RegExp(SHORTHAND_TOKEN.source, 'gi');
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		if (match.index !== consumed) return null;
		total += parseFloat(match[1]) * UNIT_TO_SECONDS[match[2].toLowerCase()];
		consumed = regex.lastIndex;
	}
	if (consumed === 0 || consumed !== text.length) return null;
	return total;
}
