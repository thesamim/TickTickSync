import type {IProject} from "@/api/types/Project";
import type {FileMetadata} from "@/cacheOperation";

export interface ITickTickSyncSettings {
	baseURL: string;
	username?: string;
	token?: string;
	version?: string;
	automaticSynchronizationInterval: number;
	enableFullVaultSync: boolean;
	tagAndOr: number; // 1 == And ; 2 == Or
	SyncProject: string;
	SyncTag: string;
	defaultProjectId: string;
	defaultProjectName: string;
	TickTickTasksFilePath: string;

	debugMode: boolean;
	logLevel: string;
	skipBackup?: boolean;

	//TODO look like one cache object
	inboxID: string;
	inboxName: string;
	checkPoint: number;
	TickTickTasksData: {"projects": IProject[], "tasks": []};


	fileMetadata: FileMetadata;
	statistics: any;
}

export const DEFAULT_SETTINGS: ITickTickSyncSettings = {
	baseURL: 'ticktick.com',
	automaticSynchronizationInterval: 300, //default sync interval 300s
	enableFullVaultSync: false,
	tagAndOr: 1,
	debugMode: false,
	logLevel: "info",
	SyncProject: "",
	SyncTag: "",
	defaultProjectId: "",
	defaultProjectName: "Inbox",
	TickTickTasksFilePath: "/",

	inboxID: "",
	inboxName: "",
	checkPoint: 0,
	TickTickTasksData: {"projects": [], "tasks": []},


	fileMetadata: {},
	statistics: {}
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
