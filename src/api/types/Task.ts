import { date_holder_type } from '../../dateMan';

export interface ITask {
	id: string;
	projectId: string;
	childIds: string[];
	parentId: string;
	sortOrder: any;
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
	reminders: any[];
	repeatFirstDate?: string;
	repeatFlag: string;
	exDate?: any[];
	completedTime?: string;
	completedUserId?: any;
	repeatTaskId?: string;
	priority: number;
	status: number;
	items: ITaskItem[];
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
