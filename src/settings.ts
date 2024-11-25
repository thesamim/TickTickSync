import {IProject} from "@/api/types/Project";

export interface ITickTickSyncSettings {
	baseURL: string;
	username?: string;
	token?: string;
	version?: string;
	automaticSynchronizationInterval: number;
	enableFullVaultSync: boolean;
	tagAndOr: number; // 1 == And ; 2 == Or
	debugMode: boolean;
	SyncProject: string;
	SyncTag: string;
	defaultProjectId: string;
	defaultProjectName: string;
	TickTickTasksFilePath: string;

	//TODO look like one cache object
	inboxID: string;
	inboxName: string;
	checkPoint: number;
	TickTickTasksData: {"projects": IProject[], "tasks": []};


	apiInitialized: boolean;
	fileMetadata: any;
	statistics: any;
	syncLock: boolean;
}

export const DEFAULT_SETTINGS: ITickTickSyncSettings = {
	baseURL: 'ticktick.com',
	automaticSynchronizationInterval: 300, //default aync interval 300s
	enableFullVaultSync: false,
	tagAndOr: 1,
	debugMode: false,
	SyncProject: "",
	SyncTag: "",
	defaultProjectId: "",
	defaultProjectName: "Inbox",
	TickTickTasksFilePath: "/",

	inboxID: "",
	inboxName: "",
	checkPoint: 0,
	TickTickTasksData: {"projects": [], "tasks": []},


	apiInitialized: false,
	fileMetadata: {},
	statistics: {},
	syncLock: false
}

//two places for settings, move all ref from main to here

let settings: ITickTickSyncSettings = { ...DEFAULT_SETTINGS };

export const getSettings = (): ITickTickSyncSettings => {
	return settings;
}

export const updateSettings = (newSettings: Partial<ITickTickSyncSettings>): ITickTickSyncSettings => {
	settings = { ...settings, ...newSettings } as const;
	return getSettings();
};
