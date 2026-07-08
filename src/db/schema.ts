import type { ITask } from "@/api/types/Task";
import type { IProject } from "@/api/types/Project";
import type { IProjectGroup } from "@/api/types/ProjectGroup";

export interface DeviceInfo {
	deviceId: string;
	deviceLabel: string;
}

export type SyncMeta = {
	lastFullSync: number;
	lastDeltaSync: number;

	deviceId: string;
	deviceLabel?: string;
	devices: DeviceInfo[];

	schemaVersion: number;
};

export type LocalTask = {
	localId: string;             // ALWAYS present (UUID)
	taskId: string;              // TickTick ID (optional until synced)
	task: ITask;

	updatedAt: number;
	lastVaultSync?: number;
	lastModifiedByDeviceId?: string;

	deleted?: boolean;
	file: string;

	source: "ticktick" | "obsidian";
};

export type LocalProject = {
	id: string;
	project: IProject;
};

export type LocalProjectGroup = {
	id: string;
	group: IProjectGroup;
};

export type LocalFile = {
	path: string;
	defaultProjectId?: string;
	managedByPlugin?: boolean; // true = plugin manages location, false/undefined = user manages
};

export type JournalEntry = {
	id?: number;
	timestamp: number;
	deviceId: string;
	action: string;
	details?: unknown;
};

export type TaskFileMapping = {
	id: string;            // `${localId}:${file}`
	localId: string;
	taskId?: string;
	file: string;
	section?: string;
	createdAt: number;
};


export type DBData = {
	tasks: LocalTask[];
	projects: LocalProject[];
	projectGroups: LocalProjectGroup[];
	files: LocalFile[];
	meta: SyncMeta;
};

export const defaultDBData: DBData = {
	tasks: [],
	projects: [],
	projectGroups: [],
	files: [],
	meta: {
		lastFullSync: 0,
		lastDeltaSync: 0,
		deviceId: "",
		deviceLabel: undefined,
		devices: [],
		schemaVersion: 2,
	}
};
