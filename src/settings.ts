import type { ITask } from '@/api/types/Task';
import type { IProject } from '@/api/types/Project';
import type { IProjectGroup } from '@/api/types/ProjectGroup';
import type { FileMetadata } from '@/services/cacheOperation';

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

	inboxID: '',
	inboxName: 'Inbox',
	checkPoint: 0,


	fileMetadata: {},
	TickTickTasksData: {
		projects: [],
		tasks: []
	}

	//statistics: {}
};

//two places for settings, move all ref from main to here

export let settings: ITickTickSyncSettings = { ...DEFAULT_SETTINGS };

export const getSettings = (): ITickTickSyncSettings => {
	return settings;
};

export const updateSettings = (newSettings: Partial<ITickTickSyncSettings>): ITickTickSyncSettings => {
	settings = { ...settings, ...newSettings } as const;
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
