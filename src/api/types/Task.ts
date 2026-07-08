import type { date_holder_type } from '@/dateMan';

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
	timeZone: string;
	isFloating?: boolean;
	isAllDay: boolean;
	reminder: string; // we only get a set
	reminders: string[];
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
