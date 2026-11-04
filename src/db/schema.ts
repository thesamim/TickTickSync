import type { ITask } from "@/api/types/Task";
import type { IProject } from "@/api/types/Project";
import type { IProjectGroup } from "@/api/types/ProjectGroup";
import type { ITag } from "@/api/types/Tag";

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

	// Lifecycle state of the list, derived from TickTick and from the user's
	// choice when they were asked what to do with it.
	archived?: boolean;   // TickTick reports the list as archived (closed)
	deleted?: boolean;    // the list no longer exists in TickTick
	syncPaused?: boolean; // the plugin must not sync this list
	// Original file location before the list file was moved into the
	// "archived lists" folder, so it can be put back when unarchived.
	archivedFromPath?: string;
	// The user chose "skip" when an archived file could not be restored
	// because a file already existed at the target location. While the file
	// stays in the archive folder the plugin must not ask again.
	restoreSkipped?: boolean;
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

export type LocalTag = {
	name: string;
	tag: ITag;
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
