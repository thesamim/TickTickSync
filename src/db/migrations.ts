import type { DBData, LocalTask, LocalProject, LocalProjectGroup, LocalFile } from "./schema";

interface OldFileEntry {
	TickTickTasks?: Array<{ taskId: string }>;
	defaultProjectId?: string;
}

interface OldDataJson {
	TickTickTasksData?: {
		tasks?: Array<{ id: string; modifiedTime?: string; deleted?: number }>;
		projects?: Array<{ id: string }>;
		projectGroups?: Array<{ id: string }>;
	};
	fileMetadata?: Record<string, OldFileEntry>;
}

export function migrateFromDataJson(data: OldDataJson): DBData {
	const oldTasks: Array<{ id: string; modifiedTime?: string; deleted?: number }> = data.TickTickTasksData?.tasks ?? [];
	const oldProjects: Array<{ id: string }> = data.TickTickTasksData?.projects ?? [];
	const oldGroups: Array<{ id: string }> = data.TickTickTasksData?.projectGroups ?? [];
	const fileMetadata: Record<string, OldFileEntry> = data.fileMetadata ?? {};

	const tasks: LocalTask[] = oldTasks.map((t) => {
		let filePath = "";
		for (const [path, detail] of Object.entries(fileMetadata)) {
			if (detail.TickTickTasks?.some((dt) => dt.taskId === t.id)) {
				filePath = path;
				break;
			}
		}
		return {
			localId: `tt:${t.id}`,
			taskId: t.id,
			task: t as unknown as LocalTask["task"],
			updatedAt: t.modifiedTime ? new Date(t.modifiedTime).getTime() : Date.now(),
			deleted: t.deleted === 1,
			file: filePath,
			source: "ticktick",
		};
	});

	const projects: LocalProject[] = oldProjects.map((p) => ({
		id: p.id,
		project: p as unknown as LocalProject["project"],
	}));

	const projectGroups: LocalProjectGroup[] = oldGroups.map((g) => ({
		id: g.id,
		group: g as unknown as LocalProjectGroup["group"],
	}));

	const files: LocalFile[] = Object.entries(fileMetadata).map(([path, detail]) => ({
		path,
		defaultProjectId: detail.defaultProjectId,
	}));

	return {
		meta: {
			lastFullSync: 0,
			lastDeltaSync: 0,
			deviceId: "",
			devices: [],
			schemaVersion: 1,
		},
		tasks,
		projects,
		projectGroups,
		files,
	};
}

export function migrateDB(data: Pick<DBData, "meta" | "tasks">): DBData {
	return data as unknown as DBData;
}
