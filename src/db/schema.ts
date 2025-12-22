import type { ITask } from "@/api/types/Task";

export type SyncMeta = {
	lastFullSync: number;
	lastDeltaSync: number;

	deviceId: string;
	deviceLabel?: string;

	schemaVersion: 2;
};

export type LocalTask = {
	localId: string;             // ALWAYS present (UUID)
	taskId: string;              // TickTick ID (optional until synced)
	task: ITask;

	updatedAt: number;
	lastModifiedByDeviceId: string;

	deleted?: boolean;
	file: string;

	source: "ticktick" | "obsidian";
};

export type TaskFileMapping = {
	id: string;            // `${localId}:${file}`
	localId: string;
	taskId?: string;
	file: string;
	createdAt: number;
};


export type DBData = {
	tasks: LocalTask[];
	meta: SyncMeta;
};

export const defaultDBData: DBData = {
	tasks: [],
	meta: {
		lastFullSync: 0,
		lastDeltaSync: 0,
		deviceId: "",
		schemaVersion: 2,
	}
};
