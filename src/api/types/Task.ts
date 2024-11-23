import { date_holder_type } from '../../dateMan';

export interface ITask {
	id: string;
	projectId: string;
	sortOrder: any;
	title: string;
	content: string;
	startDate: string;
	dueDate: string;
	timeZone: string;
	isFloating?: boolean;
	isAllDay: boolean;
	reminder: string; // we only get a set
	reminders: any[];
	repeatFirstDate?: string;
	repeatFlag: string;
	exDate?: any[];
	completedTime?: string;
	completedUserId?: any;
	repeatTaskId?: string;
	priority: number;
	status: number;
	items: any[];
	progress: number;
	modifiedTime: string;
	etag?: string;
	deleted: number;
	createdTime?: string;
	creator?: any;
	repeatFrom?: string;
	focusSummaries?: any[];
	columnId?: string;
	kind?: string;
	assignee?: any;
	isDirty?: boolean;
	local?: boolean;
	remindTime?: any;
	tags?: any[];
	childIds: string[];
	parentId: string;
	//This is not a TickTick data element. It must be managed separately.
	dateHolder: date_holder_type;
}

export interface IUpdate {
	'add': ITask[],
	'addAttachments': [],
	'delete': ITask[],
	'deleteAttachments': [],
	'update': ITask[],
	'updateAttachments': []
}
