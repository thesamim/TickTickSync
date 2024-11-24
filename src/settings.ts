import {IProject} from "@/api/types/Project";

export interface ITickTickSyncSettings {
	baseURL: string;
	token?: string;
	version?: string;
	automaticSynchronizationInterval: number;

	//TODO look like one cache object
	inboxID: string;
	inboxName: string;
	checkPoint: number;
	TickTickTasksData: {"projects": IProject[], "tasks": []};


	SyncProject: any;
	SyncTag: any;
	apiInitialized: boolean;
	defaultProjectName: string;
	defaultProjectId: string;
	TickTickTasksFilePath: string;
	fileMetadata: any;
	enableFullVaultSync: boolean;
	statistics: any;
	debugMode: boolean;
	syncLock: boolean;
	tagAndOr: number; // 1 == And ; 2 == Or
}


export const DEFAULT_SETTINGS: ITickTickSyncSettings = {
	baseURL: 'ticktick.com',
	automaticSynchronizationInterval: 300, //default aync interval 300s

	inboxID: "",
	inboxName: "",
	checkPoint: 0,
	TickTickTasksData: {"projects": [], "tasks": []},


	defaultProjectId: "",
	apiInitialized: false,
	defaultProjectName: "Inbox",
	fileMetadata: {},
	enableFullVaultSync: false,
	statistics: {},
	debugMode: false,
	TickTickTasksFilePath: "/",
	SyncProject: "",
	SyncTag: "",
	syncLock: false
}
