'use strict';
import { Platform, requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
import { UAParser } from 'ua-parser-js';
import ObjectID from 'bson-objectid';
import type { IProjectGroup } from './types/ProjectGroup';
import type { IProject, ISections } from './types/Project';
// import { ITag } from './types/Tag';
// import { ITag } from './types/Tag';
import type { ITask } from './types/Task';
// import { IFilter } from './types/Filter';
// import { IHabit } from './types/Habit';
import { API_ENDPOINTS } from './utils/get-api-endpoints';
import log from 'loglevel';
import { getSettings, updateSettings } from '@/settings';

const {
	TaskEndPoint,
	updateTaskEndPoint,
	allTagsEndPoint,
	allHabitsEndPoint,
	allProjectGroupsEndPoint,
	allProjectsEndPoint,
	allTasksEndPoint,
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
	projectGroups: any[];
	projectProfiles: any[];
	syncTaskBean: any;
	tags: any[];
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
	cookies: string[];
	cookieHeader: string;
	private originUrl: string;

	ticktickServer: string = 'ticktick.com';
	protocol: string = 'https://';
	apiProtocol: string = 'https://api.';
	apiVersion: string = '/api/v2';


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
			this.apiUrl = `${(this.apiProtocol)}${baseUrl}${(this.apiVersion)}`;
			this.loginUrl = `${(this.protocol)}${baseUrl}${(this.apiVersion)}`;
			this.originUrl = `${(this.protocol)}${baseUrl}`;
		} else {
			this.apiUrl = `${(this.apiProtocol)}${(this.ticktickServer)}${(this.apiVersion)}`;
			this.loginUrl = `${(this.protocol)}${(this.ticktickServer)}${(this.apiVersion)}`;
			this.originUrl = `${(this.protocol)}${(this.ticktickServer)}`;
		}

		if (checkPoint != undefined) {
			this._checkpoint = checkPoint;
		} else {
			//Checkpoint back end processing has changed again. Let's get a new one.
			this.getPreviousCheckPoint();
		}

	}

	private _checkpoint: number;

	get checkpoint(): number {
		return this._checkpoint;
	}

	set checkpoint(value: number) {
		this._checkpoint = value;
	}

	get inboxId(): string {
		return this.inboxProperties.id;
	}

	private _lastError: any;

	get lastError(): any {
		return this._lastError;
	}

	set lastError(value: any) {
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
			if (response && response.token) {
				//Force reset checkpoint so they'll get ALL tasks.
				this._checkpoint = 0;
				//token userId userCode username teamPro proEndDate needSubscribe inboxId teamUser activeTeamUser freeTrial pro ds
				return {
					token: response.token,
					inboxId: response.inboxId
				};
			}
		} catch (error) {
			this.setError('Login', null, error);
			log.error(error);
		}
		return null;
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
			log.error('Get Inbox Properties failed: ', e);
			this.setError('Get Inbox Properties', null, e);
			return null;
		}
	}

	async getUserStatus(): Promise<RequestUrlResponse | null> {
		try {

			const url = `${this.apiUrl}/${userStatus}`;
			const response = await this.makeRequest('Get User status', url, 'GET', undefined);
			if (response) {
				return {
					token: this.token,
					inboxId: response.inboxId,
					userID: response.username
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

	async  	getInboxProperties(): Promise<boolean> {
		try {
			for (let i = 0; i < 10; i++) {
				if (i !== 0) this.reset();
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				// log.debug("url ", url)
				const response = await this.makeRequest('Get Inbox Properties', url, 'GET');
				if (!response) continue;

				response['syncTaskBean'].update.forEach((task: any) => {
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

	// TODO: if Tags required, they come from allTagsEndPoint

	// HABITS ====================================================================

	//TODO: if Habits required, they come from allHabitsEndPoint

	// PROJECTS ==================================================================

	async getProjectGroups(): Promise<IProjectGroup[]> {
		try {
			const url = `${this.apiUrl}/${allProjectGroupsEndPoint}`;
			const response = await this.makeRequest('Get Project Groups', url, 'GET', undefined);
			if (response) {
				return response;
			}
		} catch (e) {
			log.error('Get Project Groups failed: ', e);
			this.setError('Get Project Groups', null, e);
		}
		return [];
	}

	async getProjects(): Promise<IProject[]> {
		try {
			const url = `${this.apiUrl}/${allProjectsEndPoint}`;
			const response = await this.makeRequest('Get Projects', url, 'GET', undefined);
			if (response) {
				return response;
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
				return response;
			} else {
				return [];
			}
		} catch (e) {
			log.error('Get Project Sections failed: ', e);
			this.setError('Get Project Sections', null, e);
			return [];
		}
	}

	// RESOURCES =================================================================
	async getAllResources(): Promise<IBatch | null> {
		try {
			let retry = 10; //TODO: really need to do this better. MB move to makeRequest and add delay?
			while (retry > 0) {
				const checkpointDate = new Date(this._checkpoint);
				log.debug('Get All Resources', this._checkpoint? "as of: " + checkpointDate.toISOString() : 'from the beginning of time. ');
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				const response = await this.makeRequest('Get All Resources', url, 'GET', undefined);
				if (response) {
					return response;
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
					const numReturns = response['syncTaskBean'].update.length;
					// log.debug('Got: ', numReturns);
					if (numReturns > 0) {
						//checkpoint, may have changed. Save it if it has.
						if (getSettings().checkPoint != response.checkPoint) {
							this._checkpoint = response.checkPoint;
							getSettings().checkPoint = <number>this._checkpoint;
							updateSettings({ checkPoint: this._checkpoint});
						}
						return response['syncTaskBean'];
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
					log.debug('Got: ', response['syncTaskBean'].update.length);
					return response['syncTaskBean'].update;
				} else {
					if (retry > 0) {
						this.getPreviousCheckPoint();
						retry = retry - 1;
					} else {
						return [];
					}
				}
			}
		} catch (e) {
			log.error('Get Tasks failed: ', e);
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
				return response['syncTaskBean'].update;
			} else {
				return [];
			}
		} catch (e) {
			log.error('Get All Completed Items failed: ', e);
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
				desc: jsonOptions.desc ? jsonOptions.desc : '',
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
			log.error('Add Task failed: ', e);
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
				desc: jsonOptions.desc ? jsonOptions.desc : '',
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
			log.error('Update Task failed: ', e);
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
			log.error('Delete Task  failed: ', e);
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
				this.inboxProperties.sortOrder = response.sortOrder - 1;
				return response;
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
				this.inboxProperties.sortOrder = response.sortOrder - 1;
				return response;
			} else {
				//todo: error handle.
			}
		} catch (e) {
			log.error('Parent Move failed: ', e);
			this.setError('Parent Move', null, e);
			return null;
		}
	}

	async makeRequest(operation: string, url: string, method: string, body: any | undefined = undefined) {

		let error = '';
		this.lastError = undefined;
		try {
			let requestOptions = {};
			if (operation == 'Login') {
				requestOptions = this.createLoginRequestOptions(url, body);
			} else {
				if (!this.cookieHeader) {
					this.cookieHeader = localStorage.getItem('TTS_Cookies');
				}
				requestOptions = this.createRequestOptions(method, url, body);
			}
			// log.debug(requestOptions)
			const result = await requestUrl(requestOptions);
			//log.debug(operation, result)
			if (result.status != 200) {
				this.setError(operation, result, null);
				return null;
			}
			// if (operation == 'Login') {
			this.cookies =
				(result.headers['set-cookie'] as unknown as string[]) ?? [];
			this.cookieHeader = this.cookies.join('; ') + ';';
			localStorage.setItem('TTS_Cookies', this.cookieHeader);
			// }
			return result.json;
		} catch (error) {
			this.setError(operation, null, error);
			log.error(error);
			return null;
		}

	}

	private createLoginRequestOptions(url: string, body: JSON) {
		const headers = {
			// 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
			'Accept': '*/*',
			// 'Accept-Language': 'en-US,en;q=0.5',
			// 'Accept-Encoding': 'gzip, deflate, br, zstd',
			// 'X-Csrftoken': '',
			'x-device': this.deviceAgent,
			//"x-device": "{\"platform\":\"web\",\"os\":\"Windows 10\",\"device\":\"Firefox 117.0\",\"name\":\"\",\"version\":124.0.6367.243,\"id\":\"124.0.6367.243\",\"channel\":\"website\",\"campaign\":\"\",\"websocket\":\"\"}",
			'Content-Type': 'application/json',
			'X-Requested-With': 'XMLHttpRequest'
			// 'Cookie' : this.cookieHeader
		};

		// log.debug('Login headers', headers);

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

	private createRequestOptions(method: string, url: string, body: JSON | undefined) {
		let headers = {
			//For the record, the bloody rules keep changin and we might have to the _csrf_token
			'Content-Type': 'application/json',
			'User-Agent': `${this.userAgent}`,
			'x-device': `${this.deviceAgent}`,
			// 'Cookie': 't=' + `${this.token}` + '; AWSALB=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL; AWSALBCORS=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL',
			'Cookie': 't=' + `${this.token}` + ';' + this.cookieHeader,
			't': `${this.token}`
		};
		// log.debug("Regular headers\n", method, "\n", url, "\n", headers);
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
					 error: string | null) {
		if (response) {
			const statusCode = response.status;
			let errorMessage;
			if (statusCode == 429) { //Too many requests and we don't get anything else.
				errorMessage = 'Error: ' + statusCode + ' TickTick reporting too many requests.';
				this._lastError = { operation, statusCode, errorMessage };
			} else {
				//When ticktick errors out, sometimes we get a JSON response, sometimes we get
				// a HTML response. Sometimes we get no response. Try to accommodate everything.
				try {
					errorMessage = response.json;
				} catch (e) {
					log.debug('Bad JSON response');
					log.debug('Trying Text.');
					try {
						errorMessage = this.extractTitleContent(response.text);
						log.error('Error: ', errorMessage);
					} catch (e) {
						log.debug('Bad text response');
						log.debug('No error message.');
						errorMessage = 'No Error message received.';
					}
				}
				this._lastError = { operation, statusCode, errorMessage };
			}
		} else {
			let errorMessage;
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

	//Checkpoint processing is fraught.
	//Assumption: Checkpoint tells TickTick how far back to get last updated tasks.
	//Empirical evidence: If we have a checkpoint from two weeks ago, it gives us pretty much everything. (which
	//                    doesn't match with the assumption.
	//TODO: The full solution would be to ask the user when they started using TickTick, then start from there.
	//      Then update Checkpoint on every fetch so we only fetch updated Tasks. But I'm not confident that this
	//      is actually going to work.
	private getPreviousCheckPoint() {
		let dtDate = new Date();
		// log.debug("Date: ", dtDate)
		dtDate.setDate(dtDate.getDate() - 15);
		// log.debug("Date: ", dtDate)
		this._checkpoint = dtDate.getTime();
		log.debug('Checkpoint has been changed.', this._checkpoint);
		return this._checkpoint;
	}

	private extractTitleContent(inputString) {
		const startTag = '<title>';
		const endTag = '</title>';
		const startIndex = inputString.indexOf(startTag) + startTag.length;
		const endIndex = inputString.indexOf(endTag);

		return inputString.substring(startIndex, endIndex);
	}

	private getUserAgent() {
		// log.debug("Agent: ", navigator.userAgent);
		// log.debug("Navigator Platform: ", navigator.platform);
		// log.debug("Platform: ", Platform);
		// log.debug("ua Parser: ", UAParser(navigator.userAgent));
		return navigator.userAgent;
	}

	private getXDevice() {
		// log.debug('\'generatedID\': ', this.generateRandomID());
		const randomID = this.generateRandomID();
		//TickTick wants a version number equal to or greater than 6070. I thought it was random. It's not.
		const randomVersion = 6070;
		const uaObject = UAParser(navigator.userAgent);

		let xDeviceObject = {
			//TickTick won't take anything but web
			platform: 'web',//`${this.getPlatform()}`,
			//TickTick won't take anything but a Windows variant apparently.
			os: 'Windows 10', //`${uaObject.os.name} ${uaObject.os.version}`,
			//TickTick doesn't care about the device name.
			device: 'Firefox 117.0', //`${uaObject.browser.name} ${uaObject.browser.version}`,
			name: '', //"${uaObject.engine.name}",
			version: randomVersion,
			id: randomID,
			channel: 'website',
			campaign: '',
			websocket: ''
		};

		return JSON.stringify(xDeviceObject);
	}

	private getPlatform() {
		let thisThing = Platform;
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

		let result = localStorage.getItem('TTS_UniqueID');

		//leftover from one of the old iterations.
		if (result) {
			if (result.includes('-')) {
				localStorage.removeItem('TTS_UniqueID');
				result = null;
			}
		}

		if (!result) {
			const prefix = '66';
			const length = 24; // Total length of the string
			const characters = '0123456789abcdef'; // Allowed characters (hexadecimal)

			result = prefix; // Start with '66'

			// Calculate the number of characters needed after the prefix
			const remainingLength = length - prefix.length;

			for (let i = 0; i < remainingLength; i++) {
				const randomIndex = Math.floor(Math.random() * characters.length);
				result += characters[randomIndex]; // Append a random character
			}
			localStorage.setItem('TTS_UniqueID', result);
		}

		return result;
	}

	private generateRandomVersion() {
		let number;
		do {
			number = Math.floor(Math.random() * 4000) + 6000; // Generates a number between 6000 and 9999
		} while (number < 6000 || number > 9999);
		return number;
	}
}
