'use strict';
import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import ObjectID from 'bson-objectid';

import { IProjectGroup } from './types/ProjectGroup';
import { IProject, ISections } from './types/Project';
// import { ITag } from './types/Tag';
import { ITask } from './types/Task';
// import { IFilter } from './types/Filter';
// import { IHabit } from './types/Habit';

import { API_ENDPOINTS } from './utils/get-api-endpoints';

const {
	ticktickServer,
	protocol,
	apiProtocol,
	apiVersion,
	TaskEndPoint,
	updateTaskEndPoint,
	allTagsEndPoint,
	generalDetailsEndPoint,
	allHabitsEndPoint,
	allProjectsEndPoint,
	allTasksEndPoint,
	signInEndPoint,
	userPreferencesEndPoint,
	getSections,
	getAllCompletedItems,
	exportData,
	projectMove,
	parentMove
} = API_ENDPOINTS;

interface IoptionsProps {
	token: string;
	username?: string;
	password?: string;
	baseUrl?: string;

}


export class Tick {
	username: string | undefined;
	password: string | undefined;
	inboxProperties: {
		id: string; sortOrder: number;
	};
	token: string;
	apiUrl: string;
	loginUrl: string;
	private originUrl: string;

	constructor({ username, password, baseUrl, token }: IoptionsProps) {
		this.username = username;
		this.password = password;
		this.token = token;
		this.inboxProperties = {
			id: '', sortOrder: 0
		};
		if (baseUrl) {
			this.apiUrl = `${apiProtocol}${baseUrl}${apiVersion}`;
			this.loginUrl = `${protocol}${baseUrl}${apiVersion}`;
			this.originUrl = `${protocol}${baseUrl}`;
		} else {
			this.apiUrl = `${apiProtocol}${ticktickServer}${apiVersion}`;
			this.loginUrl = `${protocol}${ticktickServer}${apiVersion}`;
			this.originUrl = `${protocol}${ticktickServer}`;
		}
	}

	get inboxId(): string {
		return this.inboxProperties.id;
	}

	private _lastError: any;

	get lastError(): any {
		return this._lastError;
	}

	// USER ======================================================================
	async login(): Promise<boolean> {
		try {
			let ret = false;
			const url = `${this.loginUrl}/${signInEndPoint}`;
			const body = {
				username: this.username,
				password: this.password
			};

			const response = await this.makeRequest('Login', url, 'POST', body);

			if (response) {
				this.token = response.token;
				ret = await this.getInboxProperties();
			}
			return ret;
		} catch (e: any) {
			this.setError('Login', null, e);
			console.error(e);

			return false;
		}
	}

	async getUserSettings(): Promise<any[] | null> {
		try {

			const url = `${this.apiUrl}/${userPreferencesEndPoint}`;

			const response = await this.makeRequest('Get User Settings', url, 'GET', undefined);
			if (response) {
				return response;
			} else {
				return null;
			}
		} catch (e) {
			console.error('Get Inbox Properties failed: ', e);
			this.setError('Get Inbox Properties', null, e);
			return null;
		}
	}


	async getInboxProperties(): Promise<boolean> {
		try {
			let url;
			//Dida does not return inbox in the general details. It does in the all task.
			if (this.originUrl.includes('ticktick') && (this.token) && (this.token.length > 0)) {
				url = `${this.apiUrl}/${generalDetailsEndPoint}`;
			} else {
				url = `${this.apiUrl}/${allTasksEndPoint}`;
			}
			// @ts-ignore
			let response = await this.makeRequest('Get Inbox Properties', url, 'GET');
			if (response) {
				if (!response.inboxId) {
					//WTF? Force the other url
					url = `${this.apiUrl}/${allTasksEndPoint}`;
					// @ts-ignore
					response = await this.makeRequest('Get Inbox Properties', url, 'GET');
				}
				this.inboxProperties.id = response.inboxId;
				response['syncTaskBean'].update.forEach((task: any) => {
					if (task.projectId == this.inboxProperties.id && task.sortOrder < this.inboxProperties.sortOrder) {
						this.inboxProperties.sortOrder = task.sortOrder;
					}
				});
				this.inboxProperties.sortOrder--;
				return true;
			}
			this.inboxProperties.id = '';
			this.inboxProperties.sortOrder = 0;
			return false;
		} catch (e) {
			console.error('Get Inbox Properties failed: ', e);
			this.setError('Get Inbox Properties', null, e);
			return false;
		}
	}

	// FILTERS ===================================================================

	// TODO: If Filters required at some point, they come from generalDetailsEndPoint

	// TAGS ======================================================================

	// TODO: if Tags required, they come from allTagsEndPoint

	// HABITS ====================================================================

	//TODO: if Habits required, they come from allHabitsEndPoint

	// PROJECTS ==================================================================

	async getProjectGroups(): Promise<IProjectGroup[]> {
		try {
			const url = `${this.apiUrl}/${generalDetailsEndPoint}`;
			const response = await this.makeRequest('Get Project Groups', url, 'GET', undefined);
			if (response) {
				return response['projectGroups'];
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get Project Groups failed: ', e);
			this.setError('Get Project Groups', null, e);
			return [];
		}
	}

	async getProjects(): Promise<IProject[]> {
		try {
			const url = `${this.apiUrl}/${allProjectsEndPoint}`;
			const response = await this.makeRequest('Get Projects', url, 'GET', undefined);
			if (response) {
				return response;
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get Projects failed: ', e);
			this.setError('Get Projects', null, e);
			return [];
		}
	}


	async getProjectSections(projectId: string): Promise<ISections[]> {
		try {
			const url = `${this.apiUrl}/${getSections}/${projectId}`;
			const response = await this.makeRequest('Get Project Sections', url, 'GET', undefined);
			if (response) {
				return response;
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get Project Sections failed: ', e);
			this.setError('Get Project Sections', null, e);
			return [];
		}
	}

	// RESOURCES =================================================================
	async getAllResources(): Promise<ITask[]> {
		try {
			const url = `${this.apiUrl}/${allTasksEndPoint}`;
			const response = await this.makeRequest('Get All Resources', url, 'GET', undefined);
			if (response) {
				return response;
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get All Resources failed: ', e);
			this.setError('Get All Resources', null, e);
			return [];
		}
	}

	// TASKS =====================================================================
	async getTaskDetails(): Promise<ITask[]> {
		try {
			const url = `${this.apiUrl}/${allTasksEndPoint}`;
			const response = await this.makeRequest('Get Task Details', url, 'GET', undefined);
			if (response) {
				return response['syncTaskBean'];
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get Tasks Details failed: ', e);
			this.setError('Get Tasks', null, e);
			return [];
		}
	}


	async getTasks(): Promise<ITask[]> {
		try {
			const url = `${this.apiUrl}/${generalDetailsEndPoint}`;
			const response = await this.makeRequest('Get Tasks', url, 'GET', undefined);
			if (response) {
				return response['syncTaskBean'].update;
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get Tasks failed: ', e);
			this.setError('Get Tasks', null, e);
			return [];
		}
	}

	async getTask(taskID: string, projectID: string | undefined | null): Promise<ITask | null> {
		try {
			let url = `${this.apiUrl}/${TaskEndPoint}/${taskID}`;//

			const projectParam = `?projectID=${projectID}`;
			if (projectID) {
				url = url + projectParam;
			}
			const response = await this.makeRequest('Get Tasks', url, 'GET', undefined);
			if (response) {
				return response;
			} else {
				return null;
			}
		} catch (e) {
			console.error('Get Tasks failed: ', e);
			this.setError('Get Tasks', null, e);
			return null;
		}
	}

	async getAllCompletedItems(): Promise<ITask[]> {
		try {
			const url = `${this.apiUrl}/${getAllCompletedItems}`;
			const response = await this.makeRequest('Get All Completed Items', url, 'GET', undefined);
			if (response) {
				return response['syncTaskBean'].update;
			} else {
				return [];
			}
		} catch (e) {
			console.error('Get All Completed Items failed: ', e);
			this.setError('Get All Completed Tasks', null, e);
			return [];
		}
	}

	async addTask(jsonOptions: any): Promise<any> {
		try {
			let bIsAllDay = true;
			if (jsonOptions.isAllDay == null) {
				bIsAllDay = true;
			} else {
				bIsAllDay = jsonOptions.isAllDay;
			}
			const thisTask: ITask = {
				id: jsonOptions.id ? jsonOptions.id : ObjectID(),
				projectId: jsonOptions.projectId ? jsonOptions.projectId : this.inboxProperties.id,
				sortOrder: jsonOptions.sortOrder ? jsonOptions.sortOrder : this.inboxProperties.sortOrder,
				title: jsonOptions.title,
				content: jsonOptions.content ? jsonOptions.content : '',
				startDate: jsonOptions.startDate ? jsonOptions.startDate : null,
				dueDate: jsonOptions.dueDate ? jsonOptions.dueDate : null,
				timeZone: jsonOptions.timeZone ? jsonOptions.timeZone : 'America/New_York', // This needs to be updated to grab dynamically
				isAllDay: bIsAllDay,
				reminder: jsonOptions.reminder ? jsonOptions.reminder : null,
				reminders: jsonOptions.reminders ? jsonOptions.reminders : [{
					id: ObjectID(),
					trigger: 'TRIGGER:PT0S'
				}],
				repeatFlag: jsonOptions.repeatFlag ? jsonOptions.repeatFlag : null,
				priority: jsonOptions.priority ? jsonOptions.priority : 0,
				status: jsonOptions.status ? jsonOptions.status : 0,
				items: jsonOptions.items ? jsonOptions.items : [],
				progress: jsonOptions.progress ? jsonOptions.progress : 0,
				modifiedTime: jsonOptions.modifiedTime ? jsonOptions.modifiedTime : new Date().toISOString().replace('Z', '+0000'), //"2017-08-12T17:04:51.982+0000",
				deleted: jsonOptions.deleted ? jsonOptions.deleted : 0,
				assignee: jsonOptions.assignee ? jsonOptions.assignee : null,
				isDirty: jsonOptions.isDirty ? jsonOptions.isDirty : true,
				local: jsonOptions.local ? jsonOptions.local : true,
				remindTime: jsonOptions.remindTime ? jsonOptions.remindTime : null,
				tags: jsonOptions.tags ? jsonOptions.tags : [],
				childIds: jsonOptions.childIds ? jsonOptions.childIds : [],
				parentId: jsonOptions.parentId ? jsonOptions.parentId : null
			};

			const url = `${this.apiUrl}/${TaskEndPoint}`;
			const response = await this.makeRequest('Add Task', url, 'POST', thisTask);
			if (response) {
				let bodySortOrder;
				bodySortOrder = response.sortOrder;
				this.inboxProperties.sortOrder = bodySortOrder - 1;

				return response;
			} else {
				return [];
			}
		} catch (e) {
			console.error('Add Task failed: ', e);
			this.setError('Add Task', null, e);
			return [];
		}

	}

	async updateTask(jsonOptions: any): Promise<any> {
		try {
			let bIsAllDay = true;
			if (jsonOptions.isAllDay == null) {
				bIsAllDay = true;
			} else {
				bIsAllDay = jsonOptions.isAllDay;
			}
			const thisTask: ITask = {
				id: jsonOptions.id ? jsonOptions.id : ObjectID(),
				projectId: jsonOptions.projectId ? jsonOptions.projectId : this.inboxProperties.id,
				sortOrder: jsonOptions.sortOrder ? jsonOptions.sortOrder : this.inboxProperties.sortOrder,
				title: jsonOptions.title,
				content: jsonOptions.content ? jsonOptions.content : '',
				startDate: jsonOptions.startDate ? jsonOptions.startDate : null,
				dueDate: jsonOptions.dueDate ? jsonOptions.dueDate : null,
				timeZone: jsonOptions.timeZone ? jsonOptions.timeZone : 'America/New_York', // This needs to be updated to grab dynamically
				isAllDay: bIsAllDay,
				reminder: jsonOptions.reminder ? jsonOptions.reminder : null,
				reminders: jsonOptions.reminders ? jsonOptions.reminders : [{
					id: ObjectID(),
					trigger: 'TRIGGER:PT0S'
				}],
				repeatFlag: jsonOptions.repeatFlag ? jsonOptions.repeatFlag : null,
				priority: jsonOptions.priority ? jsonOptions.priority : 0,
				status: jsonOptions.status ? jsonOptions.status : 0,
				items: jsonOptions.items ? jsonOptions.items : [],
				progress: jsonOptions.progress ? jsonOptions.progress : 0,
				modifiedTime: jsonOptions.modifiedTime ? jsonOptions.modifiedTime : new Date().toISOString().replace('Z', '+0000'), //"2017-08-12T17:04:51.982+0000",
				deleted: jsonOptions.deleted ? jsonOptions.deleted : 0,
				assignee: jsonOptions.assignee ? jsonOptions.assignee : null,
				isDirty: jsonOptions.isDirty ? jsonOptions.isDirty : true,
				local: jsonOptions.local ? jsonOptions.local : true,
				remindTime: jsonOptions.remindTime ? jsonOptions.remindTime : null,
				tags: jsonOptions.tags ? jsonOptions.tags : [],
				childIds: jsonOptions.childIds ? jsonOptions.childIds : [],
				parentId: jsonOptions.parentId ? jsonOptions.parentId : null
			};

			let updatePayload: any;
			updatePayload = {
				add: [],
				addAttachments: [],
				delete: [],
				deleteAttachments: [],
				updateAttachments: [],
				update: [thisTask]
			};
			const url = `${this.apiUrl}/${updateTaskEndPoint}`;
			const response = await this.makeRequest('Update Task', url, 'POST', updatePayload);
			if (response) {
				return response;
			} else {
				return null;
			}
		} catch (e) {
			console.error('Update Task failed: ', e);
			this.setError('Update Task', null, e);
			return null;
		}
	}


	async deleteTask(deleteTaskId: string, deletedTaskprojectId: string): Promise<any> {
		if (!deleteTaskId || !deletedTaskprojectId) {
			throw new Error('Both Task Id and Project ID are required for a delete, otherwise TickTick will fail silently.');
		}
		try {
			const taskToDelete = { taskId: deleteTaskId, projectId: deletedTaskprojectId };

			let deletePayload: any;
			deletePayload = {
				add: [],
				addAttachments: [],
				delete: [taskToDelete],
				deleteAttachments: [],
				updateAttachments: [],
				update: []
			};

			//We're using the updateTaskEndPoint because the delete end point is a permanent delete.
			// This is a move to trash situation
			const url = `${this.apiUrl}/${updateTaskEndPoint}`;
			const response = await this.makeRequest('Delete Task', url, 'POST', deletePayload);
			if (response) {
				this.inboxProperties.sortOrder = response.sortOrder - 1;
				return response;
			} else {
				return null;
			}
		} catch (e) {
			console.error('Delete Task  failed: ', e);
			this.setError('Delete Task Tasks', null, e);
			return null;
		}
	}


	async exportData(): Promise<string | null> {
		try {
			const url = `${this.apiUrl}/${exportData}`;
			const response = await this.makeRequest('Export', url, 'GET', undefined);
			if (response) {
				//What we get back is a string, with escaped characters.
				let body = response;
				//get rid of first and last quote.
				body = body.substring(1);
				body = body.substring(0, body.length - 1);

				//get rid of escaped quotes, and escaped line returns
				body = body.replace(/\\\"/g, '"');
				body = body.replace(/\\n/g, '\n');

				return body;
			} else {
				return null;
			}
		} catch (e) {
			console.error('Export failed: ', e);
			this.setError('Export', null, e);
			return null;
		}
	}


	async projectMove(taskId: string, fromProjectId: string, toProjectId: string): Promise<string | null> {
		try {
			const url = `${this.apiUrl}/${projectMove}`;

			const projectMovePayload = [{
				fromProjectId: fromProjectId,
				toProjectId: toProjectId,
				taskId: taskId,
				sortOrder: this.inboxProperties.sortOrder
			}];

			const response = await this.makeRequest('Project Move', url, 'POST', projectMovePayload);
			if (response) {
				this.inboxProperties.sortOrder = response.sortOrder - 1;
				return response;
			} else {
				return null
			}
		} catch (e) {
			console.error('Project Move failed: ', e);
			this.setError('Project Move', null, e);
			return null;
		}
	}

	async parentMove(taskId: string, newParentId: string, projectId: string): Promise<string | null> {
		try {
			const url = `${this.apiUrl}/${parentMove}`;
			const parentMovePayLoad = [{
				parentId: newParentId, projectId: projectId, taskId: taskId
			}];

			const response = await this.makeRequest('Project Move', url, 'POST', parentMovePayLoad);
			if (response) {
				this.inboxProperties.sortOrder = response.sortOrder - 1;
				return response;
			} else {
				//todo: error handle.
			}
		} catch (e) {
			console.error('Parent Move failed: ', e);
			this.setError('Parent Move', null, e);
			return null;
		}
	}

async makeRequest(operation: string, url: string, method: string, body: any|undefined) {

		let error = '';
		try {
			let requestOptions = {}
			if (operation == "Login" ) {
				requestOptions = this.createLoginRequestOptions(url, body);
			} else {
				requestOptions = this.createRequestOptions(method, url, body);
			}
			const result = await requestUrl(requestOptions);
			//TODO: Assumes that we ALWAYS get a result of some kind. Verify.
			if (result.status != 200) {
				this.setError(operation, result, null );
				return null
			}
			return result.json;
		} catch (exception) {
			this.setError(operation, null, exception);
			console.error(exception);
			return null;
		}

	}
private createLoginRequestOptions(url: string, body: JSON) {
		const 			headers = {
			// 'origin': 'http://ticktick.com',
			'Content-Type': 'application/json',
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',
			'x-device': '{"platform":"web","os":"Windows 10","device":"Firefox 117.0","name":"","version":4576,"id":"64f9effe6edff918986b5f71","channel":"website","campaign":"","websocket":""}'
		};
	const options: RequestUrlParam = {
		method: "POST",
		url: url,
		headers: headers,
		contentType: 'application/json',
		body: body ? JSON.stringify(body) : undefined,
		throw: false
	};
	return options;
}
	private createRequestOptions(method: string, url: string, body: JSON | undefined) {
		let headers = {
				//For the record, the bloody rules keep changin and we might have to the _csrf_token
				'Cookie': `t=${this.token}`,
				't' : `${this.token}`
			};
		const options: RequestUrlParam = {
			method: method,
			url: url,
			headers: headers,
			contentType: 'application/json',
			body: body ? JSON.stringify(body) : undefined,
			throw: false
		};
		return options;
	}

	private setError(operation: string,
					 response: RequestUrlResponse|null,
					 error: string|null) {
		if (response) {
			const statusCode = response.status;
			let errorMessage;
			//When ticktick errors out, it doesn't give us a response body.
			// so far, have only caught 405. Might need to catch others.
			if (!(statusCode == 405)) {
				errorMessage = response.json;
			} else {
				errorMessage = "No Response."
			}
			this._lastError = { operation, statusCode, errorMessage };
		} else {
			let errorMessage;
			let statusCode = 666;

			if (error) {
				errorMessage = error;
			} else {
				errorMessage = 'Unknown Error';
			}
			console.error(operation, errorMessage);
			this._lastError = { operation, statusCode, errorMessage };
		}
	}
}
