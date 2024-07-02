'use strict';
import { apiVersion, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
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
	checkPoint?: number;
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

//Dear Future me: the check is a checkpoint based thing. As in: give me everything after a certain checkpoint
//                0 behavior has become non-deterministic. It appears that checkpoint is a epoch number.
//                I **think** it indicates the time of last fetch. This could be useful.
//TODO: in the fullness of time, figure out checkpoint processing to reduce traffic.
	private _checkpoint: number;

	constructor({ username, password, baseUrl, token, checkPoint }: IoptionsProps) {
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
		if (checkPoint == 0) {
			//TickTick was launched in 2013. Hoping this catches all the task for everyone.
			let dtDate = new Date("2013-01-01T00:00:00.000+0000")
			console.log("Starting Checkpoint date: ", dtDate, "Checkpoint", dtDate.getTime())
			this._checkpoint = dtDate.getTime();
		} else {
			this._checkpoint = checkPoint;
		}
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
	get checkpoint(): number {
		return this._checkpoint;
	}

	set checkpoint(value: number) {
		this._checkpoint = value;
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
			console.log("Signed in Response: ", response)
			if (response) {
				this.token = response.token
				this.inboxProperties.id = response.inboxId;
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

			for (let i = 0; i < 10; i++) {
				const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
				// console.log("url ", url)
				// @ts-ignore
				let response = await this.makeRequest('Get Inbox Properties', url, 'GET');
				if (response) {
					response['syncTaskBean'].update.forEach((task: any) => {
						if (task.projectId == this.inboxProperties.id && task.sortOrder < this.inboxProperties.sortOrder) {
							this.inboxProperties.sortOrder = task.sortOrder;
						}
					});
					this.inboxProperties.sortOrder--;
					return true;
				} else {
					if (i < 10) {
						this._checkpoint = this.getNextCheckPoint();
					} else {
						return false;
					}
				}
			}
		} catch (e) {
			console.error('Get Inbox Properties failed: ', e);
			this.setError('Get Inbox Properties', null, e);
			return false;
		}
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
			const url = `${this.apiUrl}/${allTasksEndPoint}`   + this._checkpoint;
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
			const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
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
			const url = `${this.apiUrl}/${allTasksEndPoint}` + this._checkpoint;
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
			const url = `${this.apiUrl}/${allTasksEndPoint}`  + this._checkpoint;;
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
		this.lastError = undefined;
		try {
			let requestOptions = {}
			if (operation == "Login" ) {
				requestOptions = this.createLoginRequestOptions(url, body);
			} else {
				requestOptions = this.createRequestOptions(method, url, body);
			}
			console.log(requestOptions)
			const result = await requestUrl(requestOptions);
			//console.log(operation, result)
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
			'x-device': '{"platform":"web","os":"Windows 10","device":"Firefox 117.0","name":"","version":4576,"id":"64f9effe6edff918986b5f71","channel":"website","campaign":"","websocket":""}',
			'Cookie': 't='+`${this.token}`+'; AWSALB=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL; AWSALBCORS=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL'
		};
	// const myHeaders = new Headers();
	// myHeaders.append("t", "154BB8FE9144678312B4902C7DAE506978F514D9A843DDEE10D2F3AB30342E7FEAE9646FA1A476BB047AF870E99BC87E8AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2D1D389B366B6AE98DFB9A84218D07E63C82BEE463B1431075BC4DD36207DCA5A81D389B366B6AE98D8379F4A2E4EC1143D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83");
	// myHeaders.append("Cookie", "t=154BB8FE9144678312B4902C7DAE506978F514D9A843DDEE10D2F3AB30342E7FEAE9646FA1A476BB047AF870E99BC87E8AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2D1D389B366B6AE98DFB9A84218D07E63C82BEE463B1431075BC4DD36207DCA5A81D389B366B6AE98D8379F4A2E4EC1143D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83; AWSALB=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL; AWSALBCORS=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL");


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
			'Content-Type': 'application/json',
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',
			'x-device': '{"platform":"web","os":"Windows 10","device":"Firefox 117.0","name":"","version":4576,"id":"64f9effe6edff918986b5f71","channel":"website","campaign":"","websocket":""}',
			'Cookie': 't='+`${this.token}`+'; AWSALB=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL; AWSALBCORS=pSOIrwzvoncz4ZewmeDJ7PMpbA5nOrji5o1tcb1yXSzeEDKmqlk/maPqPiqTGaXJLQk0yokDm0WtcoxmwemccVHh+sFbA59Mx1MBjBFVV9vACQO5HGpv8eO5pXYL',
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
			//When ticktick errors out, sometimes we get a JSON response, sometimes we get
			// a HTML response. Sometimes we get no response. Try to accommodate everything.
			try {
				errorMessage = response.json
			} catch (e) {
				console.log("Bad JSON response");
				console.log("Trying Text.");
				try {
					errorMessage = this.extractTitleContent(response.text)
					console.error("Error: ", errorMessage)
				} catch (e) {
					console.log("Bad text response");
					console.log("No error message.");
					errorMessage = "No Error message received.";
				}
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

	//For now: we're not doing the checkpoint bump stuff. If we have more issues...
	private getNextCheckPoint() {
		let dtDate = new Date(this._checkpoint)
		console.log("Date: ", dtDate)
		dtDate.setDate(dtDate.getDate() + 15);
		console.log("Date: ", dtDate)
		console.log("Attempted Checkpoint: ", dtDate.getTime())
		this._checkpoint = dtDate.getTime();
		console.warn("Check point has been changed.", this._checkpoint);
		return this._checkpoint
	}
	private extractTitleContent(inputString) {
		const startTag = '<title>';
		const endTag = '</title>';
		const startIndex = inputString.indexOf(startTag) + startTag.length;
		const endIndex = inputString.indexOf(endTag);

		return inputString.substring(startIndex, endIndex);
	}
}
