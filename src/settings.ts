export interface TickTickSyncSettings {
	password?: string;
	username?: string;
	inboxName: any;
	inboxID: any;
	SyncProject: any;
	SyncTag: any;
	baseURL: string;
	initialized: boolean;
	apiInitialized: boolean;
	defaultProjectName: string;
	defaultProjectId: string;
	TickTickTasksFilePath: string;
	automaticSynchronizationInterval: number;
	TickTickTasksData: any;
	fileMetadata: any;
	enableFullVaultSync: boolean;
	statistics: any;
	debugMode: boolean;
	token:string;
	syncLock: boolean;
	checkPoint: number;
	version: string;
	tagAndOr: number; // 1 == And ; 2 == Or
}


export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	defaultProjectId: "",
	token: "",
	initialized: false,
	apiInitialized: false,
	defaultProjectName: "Inbox",
	baseURL: 'ticktick.com',
	automaticSynchronizationInterval: 300, //default aync interval 300s
	TickTickTasksData: {"projects": [], "tasks": []},
	fileMetadata: {},
	enableFullVaultSync: false,
	statistics: {},
	debugMode: false,
	TickTickTasksFilePath: "/",
	inboxName: "",
	inboxID: "",
	SyncProject: "",
	SyncTag: "",
	syncLock: false,
	checkPoint: 0
}
