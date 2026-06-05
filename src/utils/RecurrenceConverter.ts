import { RRule, rrulestr } from 'rrule';

const RRULE_PREFIX = 'RRULE:';

export interface RecurrenceParseResult {
	repeatFlag: string;
	repeatFrom?: string;
}

function stripRRulePrefix(rruleStr: string): string {
	return rruleStr.replace(/^RRULE:/i, '');
}

function ensureRRulePrefix(rruleStr: string): string {
	return rruleStr.toUpperCase().startsWith('RRULE:') ? rruleStr : `RRULE:${rruleStr}`;
}

const TT_EXTENSION_REGEX = /;TT_[A-Z0-9_]+=[A-Z0-9_,.-]+/gi;

function stripTickTickExtensions(rruleStr: string): string {
	return rruleStr.replace(TT_EXTENSION_REGEX, '');
}

export function rruleToTasksText(repeatFlag: string): string | null {
	if (!repeatFlag) return null;

	try {
		const cleaned = stripTickTickExtensions(repeatFlag);
		const stripped = stripRRulePrefix(cleaned);
		if (!stripped) return null;

		const rule = rrulestr(ensureRRulePrefix(cleaned), { forceset: false }) as RRule;
		return rule.toText();
	} catch {
		return null;
	}
}

export function normalizeRepeatFlag(repeatFlag: string): string {
	if (!repeatFlag) return '';
	const cleaned = stripTickTickExtensions(repeatFlag);
	const stripped = stripRRulePrefix(cleaned);
	if (!stripped) return '';
	try {
		const rule = rrulestr(ensureRRulePrefix(cleaned), { forceset: false }) as RRule;
		const text = rule.toText();
		const options = RRule.parseText(text);
		if (!options || options.freq === undefined) return stripped;
		const normalized = RRule.optionsToString(options);
		const parts = normalized.split('\n');
		return parts.find(p => p.startsWith('RRULE:')) || stripped;
	} catch {
		return stripped;
	}
}

export function tasksTextToRRule(text: string): RecurrenceParseResult | null {
	if (!text) return null;

	const trimmed = text.trim();
	if (trimmed.length === 0) return null;

	let baseOnToday = false;
	let ruleText = trimmed;

	if (ruleText.toLowerCase().endsWith('when done')) {
		baseOnToday = true;
		ruleText = ruleText.slice(0, -'when done'.length).trim();
	}

	try {
		const options = RRule.parseText(ruleText);
		if (!options || options.freq === undefined) return null;

		const rruleStr = RRule.optionsToString(options);
		const parts = rruleStr.split('\n');
		const rrulePart = parts.find(p => p.startsWith('RRULE:'));
		if (!rrulePart) return null;

		const result: RecurrenceParseResult = {
			repeatFlag: rrulePart
		};

		if (baseOnToday) {
			result.repeatFrom = 'completedDate';
		}

		return result;
	} catch {
		return null;
	}
}
