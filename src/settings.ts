import type { DeviceInfo } from '@/db/schema';
import { settingsStore } from '@/ui/settings/settingsstore';

export interface TaskDisplayModeSettings {
	link: 'show' | 'hide' | 'hover';
	id: boolean;
	tag: boolean;
}

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


	debugMode: boolean;
	logLevel: string;
	journalRetentionDays: number;
	deletedTaskRetentionDays: number;
	skipBackup?: boolean;

	//TODO look like one cache object
	inboxID: string;
	inboxName: string;
	checkPoint: number;

	vaultName: string;

	taskDisplay: {
		reading: TaskDisplayModeSettings;
		editing: TaskDisplayModeSettings;
	};

	devices: DeviceInfo[];

	// statistics: any;
}

export const DEFAULT_SETTINGS: ITickTickSyncSettings = {
	baseURL: 'ticktick.com',
	automaticSynchronizationInterval: 300, //default sync interval 300s
	enableFullVaultSync: false,
	tagAndOr: 1,
	debugMode: false,
	logLevel: 'info',
	journalRetentionDays: 3,
	deletedTaskRetentionDays: 7,
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

	inboxID: '',
	inboxName: 'Inbox',
	checkPoint: 0,
	skipBackup: false,

	vaultName: '',

	taskDisplay: {
		reading: {
			link: 'show',
			id: false,
			tag: true,
		},
		editing: {
			link: 'show',
			id: true,
			tag: true,
		},
	},

	devices: [],

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

/**
 * Merge two device lists, deduplicating by deviceId.
 * `override` entries take precedence for label when IDs match.
 */
export function mergeDeviceLists(base: DeviceInfo[], override: DeviceInfo[]): DeviceInfo[] {
	const map = new Map<string, DeviceInfo>();
	for (const d of base) map.set(d.deviceId, d);
	for (const d of override) map.set(d.deviceId, d);
	return Array.from(map.values());
}

export const getDefaultFolder = (): string => {
	let path = settings.TickTickTasksFilePath;
	if (!path || path === '/') {
		return '';
	}
	// Remove leading slash
	if (path.startsWith('/')) {
		path = path.substring(1);
	}
	// Remove trailing slash
	if (path.endsWith('/')) {
		path = path.substring(0, path.length - 1);
	}
	return path;
};
