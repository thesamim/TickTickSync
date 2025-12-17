import type { ITask } from '@/api/types/Task';
import type { IProject } from '@/api/types/Project';
import type { IProjectGroup } from '@/api/types/ProjectGroup';
import type { FileMetadata } from '@/services/cacheOperation';
import { settingsStore } from '@/ui/settings/settingsstore';

export interface ITickTickSyncSettings {

	baseURL: string;
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
	keepProjectFolders: boolean;
	syncNotes: boolean;
	noteDelimiter: string;
	fileLinksInTickTick: string;
	taskLinksInObsidian: string;
	bkupFolder: string;

	// Tracking task and device identification
	trackingListId?: string; // TickTick list to host the tracking task
	trackingListName?: string; // TickTick list to host the tracking task
	trackingTaskName?: string; // Name of the tracking task
	deviceNameOverride?: string; // Optional override for device name
	preferredDeviceId?: string; // Optional user-preferred stable device id


	debugMode: boolean;
	logLevel: string;
	skipBackup?: boolean;

	//TODO look like one cache object
	inboxID: string;
	inboxName: string;
	checkPoint: number;


	fileMetadata: FileMetadata;
	TickTickTasksData: {
		projects: IProject[];
		projectGroups: IProjectGroup[];
		tasks: ITask[];
	};
	//statistics: any;

	// Conflict resolution tuning
	deleteGraceSeconds?: number;
}

export const DEFAULT_SETTINGS: ITickTickSyncSettings = {
	baseURL: 'ticktick.com',
	automaticSynchronizationInterval: 300, //default sync interval 300s
	enableFullVaultSync: false,
	tagAndOr: 1,
	debugMode: false,
	logLevel: 'info',
	SyncProject: '',
	SyncTag: '',
	defaultProjectId: '',
	defaultProjectName: 'Inbox',
	TickTickTasksFilePath: '/',
	keepProjectFolders: false,
	syncNotes: true,
	noteDelimiter: '-------------------------------------------------------------',
	fileLinksInTickTick: 'taskLink',
	taskLinksInObsidian: 'taskLink',
	bkupFolder: '/',

	// Tracking defaults
	trackingListId: '',
	trackingListName: "TickTickSyncList",
	trackingTaskName: 'Obsidian Tracking',
	deviceNameOverride: '',
	preferredDeviceId: '',

	inboxID: '',
	inboxName: 'Inbox',
	checkPoint: 0,
	skipBackup: false,

	fileMetadata: {},
	TickTickTasksData: {
		projects: [],
		tasks: []
	}
	,

	// Conflict resolution tuning
	deleteGraceSeconds: 30

	//statistics: {}
};

//two places for settings, move all ref from main to here

export let settings: ITickTickSyncSettings = { ...DEFAULT_SETTINGS };

export const getSettings = (): ITickTickSyncSettings => {
	return settings;
};

export const setSettings = (value: ITickTickSyncSettings) => {
	settings = value;
};

export const updateSettings = (newSettings: Partial<ITickTickSyncSettings>): ITickTickSyncSettings => {
	settings = { ...settings, ...newSettings } as const;
	settingsStore.set(settings);
	return getSettings();
};

//TODO move to store

// let projects: IProject[] = [];

export const getProjects = (): IProject[] => {
	return settings.TickTickTasksData.projects;
};

export const updateProjects = (newProjects: IProject[]): IProject[] => {
	settings.TickTickTasksData.projects = newProjects;
	return getProjects();
};

// let tasks: ITask[] = [];

export const getTasks = (): ITask[] => {
	return settings.TickTickTasksData.tasks;
};

export const updateTasks = (newTasks: ITask[]): ITask[] => {
	settings.TickTickTasksData.tasks = newTasks;
	return getTasks();
};

// let projectGroups: IProjectGroup[] = [];

export const getProjectGroups = (): IProjectGroup[] => {
	return settings.TickTickTasksData.projectGroups;
};

export const updateProjectGroups = (newProjectGroups: IProjectGroup[]): IProjectGroup[] => {
	settings.TickTickTasksData.projectGroups = newProjectGroups;
	return getProjectGroups();
};
export const getDefaultFolder = (): string => {
	if (settings.TickTickTasksFilePath === '/') {
		return '';
	} else {
		return settings.TickTickTasksFilePath;
	}
};
