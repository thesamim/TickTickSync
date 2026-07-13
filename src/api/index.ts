'use strict';
import { Platform, requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
import ObjectID from 'bson-objectid';
import type { IProjectGroup } from './types/ProjectGroup';
import type { IProject, ISections } from './types/Project';
import type { ITask, ITaskItem } from './types/Task';
import type { ITag } from './types/Tag';
import { API_ENDPOINTS } from './utils/get-api-endpoints';
import log from '@/utils/logger';
import { getSettings, updateSettings } from '@/settings';

const _userAgent = window['navigator']['userAgent'];

const {
	TaskEndPoint,
	updateTaskEndPoint,
	allProjectGroupsEndPoint,
	allProjectsEndPoint,
	updateProjectEndPoint,
	allTasksEndPoint,
	allTagsEndPoint,
	batchTagEndPoint,
	signInEndPoint,
	userPreferencesEndPoint,
	getSections,
	getAllCompletedItems,
	exportData,
	projectMove,
	parentMove,
	userStatus
} = API_ENDPOINTS;


interface IoptionsProps {
	token: string;
	username?: string;
	password?: string;
	baseUrl?: string;
	checkPoint?: number;
}

export interface IBatch {
	checkPoint: number;
	inboxId: string;
	projectGroups: unknown[];
	projectProfiles: unknown[];
	syncTaskBean: unknown;
	tags: unknown[];
}

interface UpdatePayload {
	add: unknown[];
	addAttachments: unknown[];
	delete: unknown[];
	deleteAttachments: unknown[];
	updateAttachments: unknown[];
	update: unknown[];
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
	cookies: string[] = [];
	cookieHeader: string = '';
	ticktickServer: string = 'ticktick.com';
	protocol: string = 'https://';
	apiProtocol: string = 'https://api.';
	apiVersion: string = '/api/v2';
	private originUrl: string;
	private userAgent: string;
	private deviceAgent: string;

	constructor({ username, password, baseUrl, token, checkPoint }: IoptionsProps) {
		this.username = username;
		this.password = password;
		this.token = token;
		this.inboxProperties = {
			id: '', sortOrder: 0
		};
		this.userAgent = this.getUserAgent();
		this.deviceAgent = this.getXDevice();

		if (baseUrl) {
			this.apiUrl = `${this.apiProtocol}${baseUrl}${this.apiVersion}`;
			this.loginUrl = `${this.protocol}${baseUrl}${this.apiVersion}`;
			this.originUrl = `${this.protocol}${baseUrl}`;
		} else {
			this.apiUrl = `${this.apiProtocol}${this.ticktickServer}${this.apiVersion}`;
			this.loginUrl = `${this.protocol}${this.ticktickServer}${this.apiVersion}`;
			this.originUrl = `${this.protocol}${this.ticktickServer}`;
		}

		if (checkPoint != undefined) {
			this._checkpoint = checkPoint;
		} else {
			this.getPreviousCheckPoint();
		}

	}

	private _checkpoint: number = 0;

	get checkpoint(): number {
		return this._checkpoint;
	}

	set checkpoint(value: number) {
		this._checkpoint = value;
	}

	get inboxId(): string {
		return this.inboxProperties.id;
	}

	private _lastError: unknown;

	get lastError(): unknown {
		return this._lastError;
	}

	set lastError(value: unknown) {
		this._lastError = value;
	}

	// USER ======================================================================
	async login(): Promise<{ inboxId: string; token: string } | null> {
		try {
			const url = `${this.loginUrl}/${signInEndPoint}`;
			const body = {
				username: this.username,
				password: this.password
			};
			const response = await this.makeRequest('Login', url, 'POST', body);
			log.debug('Signed in Response: ', response);
			if (response) {
				const r = response as { token: string; inboxId: string };
				this._checkpoint = 0;
				return {
					token: r.token,
					inboxId: r.inboxId
				};
			}
		} catch (error) {
			this.setError('Login', null, error);
			log.error(error);
		}
		return null;
	}

	async getUserSettings(): Promise<Record<string, unknown>[] | null> {
		try {

			const url = `${this.apiUrl}/${userPreferencesEndPoint}`;

			const response = await this.makeRequest('Get User Settings', url, 'GET', undefined);
			if (response) {
				return response as Record<string, unknown>[];
			} else {
				return null;
			}
		} catch (e) {
			log.error('Get Inbox Properties failed: ', e);
			this.setError('Get Inbox Properties', null, e);
			return null;
		}
	}

	async getUserStatus(): Promise<{ token: string; inboxId: string; userID: string } | null> {
		try {

			const url = `${this.apiUrl}/${userStatus}`;
			const response = await this.makeRequest('Get User status', url, 'GET', undefined);
			if (response) {
				const r = response as { inboxId: string; username: string };
				return {
					token: this.token,
					inboxId: r.inboxId,
					userID: r.username
				};
			} else {
				return null;
			}
		} catch (e) {
			log.error('Get User Status failed: ', e);
			this.setError('Get User Status', null, e);
			return null;
		}
	}

	async getInboxProperties(): Promise<boolean> {
		try {
			for (let i = 0; i < 10; i++) {
				if (i !== 0) this.reset();
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				const response = await this.makeRequest('Get Inbox Properties', url, 'GET');
				if (!response) continue;

				const bean = response as { syncTaskBean: { update: { projectId: string; sortOrder: number }[] } };
				bean.syncTaskBean.update.forEach((task: { projectId: string; sortOrder: number }) => {
					if (task.projectId == this.inboxProperties.id && task.sortOrder < this.inboxProperties.sortOrder) {
						this.inboxProperties.sortOrder = task.sortOrder;
					}
				});
				this.inboxProperties.sortOrder--;
				return true;
			}
		} catch (e) {
			log.error('Get Inbox Properties failed: ', e);
			this.setError('Get Inbox Properties', null, e);
		}
		return false;
	}

	// FILTERS ===================================================================

	// TODO: If Filters required at some point, they come from allTasksEndPoint

	// TAGS ======================================================================

	async getTags(): Promise<ITag[]> {
		try {
			const url = `${this.apiUrl}/${allTagsEndPoint}`;
			const response = await this.makeRequest('Get Tags', url, 'GET', undefined);
			if (response) {
				return response as ITag[];
			}
		} catch (e) {
			log.error('Get Tags failed: ', e);
			this.setError('Get Tags', null, e);
		}
		return [];
	}

	async createTags(tags: { label: string; name: string; parent: string | null }[]): Promise<unknown> {
		try {
			const url = `${this.apiUrl}/${batchTagEndPoint}`;
			const payload = { add: tags };
			const response = await this.makeRequest('Create Tags', url, 'POST', payload);
			return response;
		} catch (e) {
			log.error('Create Tags failed: ', e);
			this.setError('Create Tags', null, e);
			return null;
		}
	}

	// HABITS ====================================================================

	//TODO: if Habits required, they come from allHabitsEndPoint

	// PROJECTS ==================================================================

	//TODO, we could get all the project related information in one swell foop.
	async getProjectGroups(): Promise<IProjectGroup[]> {
		try {
			const url = `${this.apiUrl}/${allProjectGroupsEndPoint}/0`;
			const response = await this.makeRequest('Get Project Groups', url, 'GET', undefined);
			if (response) {
				// API returns wrapped format: { projectGroups: [{ id, group: IProjectGroup }, ...] }
				// We need to unwrap to get the actual IProjectGroup objects
				const raw = (response as { projectGroups: unknown[] }).projectGroups;
				if (Array.isArray(raw)) {
					return raw.map(g => ((g as Record<string, unknown>)?.group ?? g)) as IProjectGroup[];
				}
			}
		} catch (e) {
			log.error('Get ProjectF Groups failed: ', e);
			this.setError('Get Project Groups', null, e);
		}
		return [];
	}

	async getProjects(): Promise<IProject[]> {
		try {
			const url = `${this.apiUrl}/${allProjectsEndPoint}`;
			const response = await this.makeRequest('Get Projects', url, 'GET', undefined);
			if (response) {
				return response as IProject[];
			}
		} catch (e) {
			log.error('Get Projects failed: ', e);
			this.setError('Get Projects', null, e);
		}
		return [];
	}


	async getProjectSections(projectId: string): Promise<ISections[]> {
		try {
			const url = `${this.apiUrl}/${getSections}/${projectId}`;
			const response = await this.makeRequest('Get Project Sections', url, 'GET', undefined);
			if (response) {
				return response as ISections[];
			} else {
				return [];
			}
		} catch (e) {
			log.error('Get Project Sections failed: ', e);
			this.setError('Get Project Sections', null, e);
			return [];
		}
	}

	async updateProject(project: IProject): Promise<unknown> {
		try {
			const updatePayload: UpdatePayload = {
				add: [],
				addAttachments: [],
				delete: [],
				deleteAttachments: [],
				updateAttachments: [],
				update: [project]
			};
			const url = `${this.apiUrl}/${updateProjectEndPoint}`;
			const response = await this.makeRequest('Update project', url, 'POST', updatePayload);
			if (response) {
				return response;
			} else {
				return null;
			}
		} catch (e) {
			log.error('Get Project Sections failed: ', e);
			this.setError('Get Project Sections', null, e);
			return [];
		}
	}

	async getUpdatedTasks(since: number): Promise<{ update: ITask[], delete: string[] }> {
		try {
			log.debug('Get updated tasks', 'Since', since > 0 ? new Date(since).toISOString() : 'from the beginning of time.');
			const url = `${this.apiUrl}/${allTasksEndPoint}` + since;
			const response = await this.makeRequest('Get All Resources', url, 'GET', undefined);
			if (response) {
				const r = response as { checkPoint: number; syncTaskBean: { update: ITask[]; delete: string[] } };
				this._checkpoint = r.checkPoint;
				return {
					update: r.syncTaskBean.update,
					delete: r.syncTaskBean.delete
				};
			}
		} catch (e) {
			log.error('Get Updated Tasks failed: ', e);
			this.setError('Get All Resources', null, e);
		}
		return { update: [], delete: [] };
	}

	// RESOURCES =================================================================
	async getAllResources(): Promise<IBatch | null> {
		try {
			let retry = 10;
			while (retry > 0) {
				const checkpointDate = new Date(this._checkpoint);
				log.debug('Get All Resources', this._checkpoint ? 'as of: ' + checkpointDate.toISOString() : 'from the beginning of time. ');
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				const response = await this.makeRequest('Get All Resources', url, 'GET', undefined);
				if (response) {
					return response as IBatch;
				}
				retry -= 1;
				this.getPreviousCheckPoint();
			}
		} catch (e) {
			log.error('Get All Resources failed: ', e);
			this.setError('Get All Resources', null, e);
		}
		return null;
	}

	// TASKS =====================================================================
	async getTaskDetails(): Promise<ITask[]> {
		try {
			let retry = 10;
			while (retry > 0) {
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				const response = await this.makeRequest('Get Task Details', url, 'GET', undefined);
				if (response) {
					const r = response as { checkPoint: number; syncTaskBean: { update: ITask[] } };
					const numReturns = r.syncTaskBean.update.length;
					if (numReturns > 0) {
						if (getSettings().checkPoint != r.checkPoint) {
							this._checkpoint = r.checkPoint;
							getSettings().checkPoint = this._checkpoint;
							updateSettings({ checkPoint: this._checkpoint });
						}
						return r.syncTaskBean as unknown as ITask[];
					} else {
						retry -= 1;
						this.getPreviousCheckPoint();
					}
				} else {
					retry -= 1;
					this.getPreviousCheckPoint();
				}
			}
			return [];
		} catch (e) {
			log.error('Get Tasks Details failed: ', e);
			this.setError('Get Tasks', null, e);
			return [];
		}
	}


	//TODO: I believe this is a leftover. I further believe it can safely go away. But I don't believe it strongly
	//      enough to actually do the deletion.
	async getTasks(): Promise<ITask[]> {
		try {
			let retry = 3;
			while (retry > 0) {
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				const response = await this.makeRequest('Get Tasks', url, 'GET', undefined);
				if (response) {
					const r = response as { syncTaskBean: { update: ITask[] } };
					return r.syncTaskBean.update;
				} else {
					if (retry > 0) {
						this.getPreviousCheckPoint();
						retry = retry - 1;
					} else {
						return [];
					}
				}
			}
			return [];
		} catch (e) {
			log.error('Get Tasks failed: ', e);
			this.setError('Get Tasks', null, e);
			return [];
		}
	}

	async getTask(taskID: string, projectID: string | undefined | null): Promise<ITask | null> {
		try {
			let url = `${this.apiUrl}/${TaskEndPoint}/${taskID}`;


			if (projectID) {
				const projectParam = `?projectID=${projectID}`;
				url = url + projectParam;
			}
			const response = await this.makeRequest('Get Tasks', url, 'GET', undefined);
			if (response) {
				return response as ITask;
			} else {
				return null;
			}
		} catch (e) {
			log.error('Get Tasks failed: ', e);
			this.setError('Get Tasks', null, e);
			return null;
		}
	}

	async getAllCompletedItems(): Promise<ITask[]> {
		try {
			const url = `${this.apiUrl}/${getAllCompletedItems}`;
			const response = await this.makeRequest('Get All Completed Items', url, 'GET', undefined);
			if (response) {
				return (response as { syncTaskBean: { update: ITask[] } }).syncTaskBean.update;
			} else {
				return [];
			}
		} catch (e) {
			log.error('Get All Completed Items failed: ', e);
			this.setError('Get All Completed Tasks', null, e);
			return [];
		}
	}

	async addTask(task: Record<string, unknown>): Promise<unknown> {
		try {
			let bIsAllDay = true;
			if (task.isAllDay == null) {
				bIsAllDay = true;
			} else {
				bIsAllDay = task.isAllDay as boolean;
			}
			const thisTask = {
				id: task.id ? task.id as string : ObjectID().toHexString(),
				projectId: task.projectId ? task.projectId as string : this.inboxProperties.id,
				sortOrder: task.sortOrder ? task.sortOrder as number : this.inboxProperties.sortOrder,
				title: task.title as string,
				content: task.content ? task.content as string : '',
				desc: task.desc ? task.desc as string : '',
				startDate: task.startDate ? task.startDate as string : null as unknown as string,
				dueDate: task.dueDate ? task.dueDate as string : null as unknown as string,
				timeZone: task.timeZone ? task.timeZone as string : 'America/New_York',
				isAllDay: bIsAllDay,
				reminder: task.reminder ? task.reminder as string : null as unknown as string,
				reminders: task.reminders ? task.reminders as { id: string; trigger: string }[] : [{
					id: ObjectID().toHexString(),
					trigger: 'TRIGGER:PT0S'
				}],
				repeatFlag: task.repeatFlag ? task.repeatFlag as string : null as unknown as string,
				priority: task.priority ? task.priority as number : 0,
				status: task.status ? task.status as number : 0,
				items: task.items ? task.items as ITaskItem[] : [],
				progress: task.progress ? task.progress as number : 0,
				modifiedTime: task.modifiedTime ? task.modifiedTime as string : new Date().toISOString().replace('Z', '+0000'),
				deleted: task.deleted ? task.deleted as number : 0,
				assignee: task.assignee ? task.assignee : null,
				isDirty: task.isDirty ? task.isDirty as boolean : true,
				local: task.local ? task.local as boolean : true,
				remindTime: task.remindTime ? task.remindTime as string : null as unknown as string,
				tags: task.tags ? task.tags as string[] : [],
				childIds: task.childIds ? task.childIds as string[] : [],
				parentId: task.parentId ? task.parentId as string : null as unknown as string
			} as unknown as ITask;

			const url = `${this.apiUrl}/${TaskEndPoint}`;
			const response = await this.makeRequest('Add Task', url, 'POST', thisTask);
			if (response) {
				const r = response as { sortOrder: number };
				let bodySortOrder;
				bodySortOrder = r.sortOrder;
				this.inboxProperties.sortOrder = bodySortOrder - 1;

				return response;
			} else {
				return [];
			}
		} catch (e) {
			log.error('Add Task failed: ', e);
			this.setError('Add Task', null, e);
			return [];
		}

	}

	async updateTask(jsonOptions: Record<string, unknown>): Promise<unknown> {
		try {
			let bIsAllDay = true;
			if (jsonOptions.isAllDay == null) {
				bIsAllDay = true;
			} else {
				bIsAllDay = jsonOptions.isAllDay as boolean;
			}
			const thisTask = {
				id: jsonOptions.id ? jsonOptions.id as string : ObjectID().toHexString(),
				projectId: jsonOptions.projectId ? jsonOptions.projectId as string : this.inboxProperties.id,
				sortOrder: jsonOptions.sortOrder ? jsonOptions.sortOrder as number : this.inboxProperties.sortOrder,
				title: jsonOptions.title as string,
				content: jsonOptions.content ? jsonOptions.content as string : '',
				desc: jsonOptions.desc ? jsonOptions.desc as string : '',
				startDate: jsonOptions.startDate ? jsonOptions.startDate as string : null as unknown as string,
				dueDate: jsonOptions.dueDate ? jsonOptions.dueDate as string : null as unknown as string,
				timeZone: jsonOptions.timeZone ? jsonOptions.timeZone as string : 'America/New_York',
				isAllDay: bIsAllDay,
				reminder: jsonOptions.reminder ? jsonOptions.reminder as string : null as unknown as string,
				reminders: jsonOptions.reminders ? jsonOptions.reminders as { id: string; trigger: string }[] : [],
				repeatFlag: jsonOptions.repeatFlag ? jsonOptions.repeatFlag as string : null as unknown as string,
				priority: jsonOptions.priority ? jsonOptions.priority as number : 0,
				status: jsonOptions.status ? jsonOptions.status as number : 0,
				items: jsonOptions.items ? jsonOptions.items as ITaskItem[] : [],
				progress: jsonOptions.progress ? jsonOptions.progress as number : 0,
				modifiedTime: jsonOptions.modifiedTime ? jsonOptions.modifiedTime as string : new Date().toISOString().replace('Z', '+0000'),
				deleted: jsonOptions.deleted ? jsonOptions.deleted as number : 0,
				assignee: jsonOptions.assignee ? jsonOptions.assignee : null,
				isDirty: jsonOptions.isDirty ? jsonOptions.isDirty as boolean : true,
				local: jsonOptions.local ? jsonOptions.local as boolean : true,
				remindTime: jsonOptions.remindTime ? jsonOptions.remindTime as string : null as unknown as string,
				tags: jsonOptions.tags ? jsonOptions.tags as string[] : [],
				childIds: jsonOptions.childIds ? jsonOptions.childIds as string[] : [],
				parentId: jsonOptions.parentId ? jsonOptions.parentId as string : null as unknown as string
			} as unknown as ITask;

			const updatePayload: UpdatePayload = {
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
			log.error('Update Task failed: ', e);
			this.setError('Update Task', null, e);
			return null;
		}
	}


	async deleteTask(deleteTaskId: string, deletedTaskprojectId: string): Promise<unknown> {
		if (!deleteTaskId || !deletedTaskprojectId) {
			throw new Error('Both Task Id and Project ID are required for a delete, otherwise TickTick will fail silently.');
		}
		try {
			const taskToDelete = { taskId: deleteTaskId, projectId: deletedTaskprojectId };

			const deletePayload: UpdatePayload = {
				add: [],
				addAttachments: [],
				delete: [taskToDelete],
				deleteAttachments: [],
				updateAttachments: [],
				update: []
			};

			const url = `${this.apiUrl}/${updateTaskEndPoint}`;
			const response = await this.makeRequest('Delete Task', url, 'POST', deletePayload);
			if (response) {
				const r = response as { sortOrder: number };
				this.inboxProperties.sortOrder = r.sortOrder - 1;
				return response;
			} else {
				return null;
			}
		} catch (e) {
			log.error('Delete Task  failed: ', e);
			this.setError('Delete Task Tasks', null, e);
			return null;
		}
	}

	async batchUpdate(payload: { add?: unknown[]; update?: unknown[]; delete?: unknown[] }): Promise<unknown> {
		try {
			const updatePayload: UpdatePayload = {
				add: payload.add || [],
				addAttachments: [],
				delete: payload.delete || [],
				deleteAttachments: [],
				updateAttachments: [],
				update: payload.update || []
			};
			const url = `${this.apiUrl}/${updateTaskEndPoint}`;
			const response = await this.makeRequest('Batch Update', url, 'POST', updatePayload);
			return response;
		} catch (e) {
			log.error('Batch Update failed: ', e);
			this.setError('Batch Update', null, e);
			return null;
		}
	}


	async exportData(): Promise<string | null> {
		try {
			const url = `${this.apiUrl}/${exportData}`;
			const response = await this.makeRequest('Export', url, 'GET', undefined);
			if (response) {
				let body = response as string;
				body = body.substring(1);
				body = body.substring(0, body.length - 1);

				body = body.replace(/\\"/g, '"');
				body = body.replace(/\\n/g, '\n');

				return body;
			} else {
				return null;
			}
		} catch (e) {
			log.error('Export failed: ', e);
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
				const r = response as { sortOrder: number };
				this.inboxProperties.sortOrder = r.sortOrder - 1;
				return response as string;
			} else {
				return null;
			}
		} catch (e) {
			log.error('Project Move failed: ', e);
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
				const r = response as { sortOrder: number };
				this.inboxProperties.sortOrder = r.sortOrder - 1;
				return response as string;
			}
			return null;
		} catch (e) {
			log.error('Parent Move failed: ', e);
			this.setError('Parent Move', null, e);
			return null;
		}
	}

	async makeRequest(operation: string, url: string, method: string, body: unknown = undefined): Promise<unknown> {

		this.lastError = undefined;
		try {
			let requestOptions: RequestUrlParam | undefined;
			if (operation == 'Login') {
				requestOptions = this.createLoginRequestOptions(url, body);
			} else {
				if (!this.cookieHeader) {
					this.cookieHeader = window.localStorage.getItem('TTS_Cookies') ?? '';
				}
				requestOptions = this.createRequestOptions(method, url, body);
			}
			const result = await requestUrl(requestOptions);
			if (result.status != 200) {
				this.setError(operation, result, null);
				return null;
			}
			this.cookies =
				(result.headers['set-cookie'] as unknown as string[]) ?? [];
			this.cookieHeader = this.cookies.join('; ') + ';';
			window.localStorage.setItem('TTS_Cookies', this.cookieHeader);
			return result.json;
		} catch (error) {
			this.setError(operation, null, error);
			log.error(error);
			return null;
		}

	}

	private createLoginRequestOptions(url: string, body: unknown) {
		const headers = {
			'Accept': '*/*',
			'x-device': this.deviceAgent,
			'Content-Type': 'application/json',
			'X-Requested-With': 'XMLHttpRequest'
		};

		const options: RequestUrlParam = {
			method: 'POST',
			url: url,
			headers: headers,
			contentType: 'application/json',
			body: body ? JSON.stringify(body) : undefined,
			throw: false
		};
		return options;
	}

	private createRequestOptions(method: string, url: string, body: unknown) {
		let headers = {
			'Content-Type': 'application/json',
			'User-Agent': `${this.userAgent}`,
			'x-device': `${this.deviceAgent}`,
			'Cookie': 't=' + `${this.token}` + ';' + this.cookieHeader,
			't': `${this.token}`
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
					 response: RequestUrlResponse | null,
					 error: unknown) {
		if (response) {
			const statusCode = response.status;
			let errorMessage: unknown;
			if (statusCode == 429) {
				errorMessage = 'Error: ' + statusCode + ' TickTick reporting too many requests.';
				this._lastError = { operation, statusCode, errorMessage };
			} else {
				try {
					errorMessage = response.json;
				} catch {
					log.debug('Bad JSON response');
					log.debug('Trying Text.');
					try {
						errorMessage = this.extractTitleContent(response.text);
						log.error('Error: ', errorMessage);
					} catch {
						log.debug('Bad text response');
						log.debug('No error message.');
						errorMessage = 'No Error message received.';
					}
				}
				this._lastError = { operation, statusCode, errorMessage };
			}
		} else {
			let errorMessage: unknown;
			let statusCode = 666;

			if (error) {
				errorMessage = error;
			} else {
				errorMessage = 'Unknown Error';
			}
			log.error(operation, errorMessage);
			this._lastError = { operation, statusCode, errorMessage };
		}
	}

	private getPreviousCheckPoint() {
		let dtDate = new Date();
		dtDate.setDate(dtDate.getDate() - 15);
		this._checkpoint = dtDate.getTime();
		log.debug('Checkpoint has been changed.', this._checkpoint);
		return this._checkpoint;
	}

	private extractTitleContent(inputString: string) {
		const startTag = '<title>';
		const endTag = '</title>';
		const startIndex = inputString.indexOf(startTag) + startTag.length;
		const endIndex = inputString.indexOf(endTag);

		return inputString.substring(startIndex, endIndex);
	}

	private getUserAgent() {
		return _userAgent;
	}

	private getXDevice() {
		const randomID = this.generateRandomID();
		const randomVersion = 6070;

		let xDeviceObject = {
			platform: 'web',
			os: 'Windows 10',
			device: 'Firefox 117.0',
			name: '',
			version: randomVersion,
			id: randomID,
			channel: 'website',
			campaign: '',
			websocket: ''
		};

		return JSON.stringify(xDeviceObject);
	}

	private getPlatform() {
		if (Platform.isIosApp) {
			return 'ios';
		} else if (Platform.isAndroidApp) {
			return 'android';
		} else if (Platform.isMacOS) {
			return 'macOS';
		} else if (Platform.isWin) {
			return 'windows';
		} else if (Platform.isLinux) {
			return 'linux';
		} else if (Platform.isSafari) {
			return 'safari';
		}
	}

	private reset() {
		this._checkpoint = this.getPreviousCheckPoint();
	}

	private generateRandomID() {

		let result = window.localStorage.getItem('TTS_UniqueID');

		if (result) {
			if (result.includes('-')) {
				window.localStorage.removeItem('TTS_UniqueID');
				result = null;
			}
		}

		if (!result) {
			const prefix = '66';
			const length = 24;
			const characters = '0123456789abcdef';

			result = prefix;

			const remainingLength = length - prefix.length;

			for (let i = 0; i < remainingLength; i++) {
				const randomIndex = Math.floor(Math.random() * characters.length);
				result += characters[randomIndex];
			}
			window.localStorage.setItem('TTS_UniqueID', result);
		}

		return result;
	}

	private generateRandomVersion() {
		let number: number;
		do {
			number = Math.floor(Math.random() * 4000) + 6000;
		} while (number < 6000 || number > 9999);
		return number;
	}
}
