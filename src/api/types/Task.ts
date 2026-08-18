import type { date_holder_type } from '@/dateMan';

/**
 * A TickTick reminder. On the web sync API (batch/check, batch/task) reminders
 * are objects: `{ id, trigger }` where `trigger` is an RFC 5545 TRIGGER value
 * such as `TRIGGER:PT30M` (30 minutes before the task's start/due time) or
 * `TRIGGER:P0DT9H0M0S` (9 hours before, TickTick's "on time" for all-day
 * tasks). `id` is assigned by TickTick and is absent on freshly-parsed lines.
 */
export type Reminder = {
	id?: string;
	trigger: string;
};

export interface ITask {
	id: string;
	projectId: string;
	childIds: string[];
	parentId: string;
	sortOrder: number;
	title: string;
	//New to the game: The Task Description. It's not the content, the title or the items!
	desc: string;
	content: string;
	startDate: string;
	dueDate: string;
	timeZone?: string;
	isFloating?: boolean;
	isAllDay: boolean;
	// Vestigial: the web sync API only exposes `reminders`. Kept for payload
	// compatibility; the server ignores it.
	reminder: string;
	reminders: Reminder[];
	repeatFirstDate?: string;
	repeatFlag: string;
	exDate?: string[];
	completedTime?: string;
	completedUserId?: string;
	repeatTaskId?: string;
	priority: number;
	status: number;
	items: ITaskItem[];
	progress: number;
	modifiedTime: string;
	etag?: string;
	deleted: number;
	createdTime?: string;
	creator?: string;
	repeatFrom?: string;
	focusSummaries?: unknown[];
	columnId?: string;
	kind?: string;
	assignee?: unknown;
	isDirty?: boolean;
	local?: boolean;
	remindTime?: string;
	tags?: string[];
	//This is not a TickTick data element. It must be managed separately.
	dateHolder: date_holder_type;
	lineHash: string;
	//Not a TickTick data element. Set when the Obsidian line explicitly says
	//`⏰ off`, telling the sync to delete all reminders on TickTick.
	clearReminders?: boolean;
}

export interface ITaskItem {
	id: string,
	title: string,
	status: number
}


export interface IUpdate {
	'add': ITask[],
	'addAttachments': [],
	'delete': ITask[],
	'deleteAttachments': [],
	'update': ITask[],
	'updateAttachments': []
}
