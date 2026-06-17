import type { DBData, LocalTask, LocalProject, LocalProjectGroup, LocalFile } from "./schema";

/**
 * Transform the old data.json structure (settings with TickTickTasksData
 * and fileMetadata) into a structured DBData object ready for Dexie.
 * Returns DBData with schemaVersion = 1 (pre‑migration state).
 */
export function migrateFromDataJson(data: any): DBData {
	const settings = data;
	const oldTasks: any[] = settings.TickTickTasksData?.tasks ?? [];
	const oldProjects: any[] = settings.TickTickTasksData?.projects ?? [];
	const oldGroups: any[] = settings.TickTickTasksData?.projectGroups ?? [];
	const fileMetadata: Record<string, any> = settings.fileMetadata ?? {};

		const tasks: LocalTask[] = oldTasks.map((t: any) => {
		let filePath = "";
		for (const [path, detail] of Object.entries(fileMetadata)) {
			if ((detail as any).TickTickTasks?.some((dt: any) => dt.taskId === t.id)) {
				filePath = path;
				break;
			}
		}
		return {
			localId: `tt:${t.id}`,
			taskId: t.id,
			task: t,
			updatedAt: t.modifiedTime ? new Date(t.modifiedTime).getTime() : Date.now(),
			deleted: t.deleted === 1,
			file: filePath,
			source: "ticktick",
		} as LocalTask;
	});

	const projects: LocalProject[] = oldProjects.map((p: any) => ({
		id: p.id,
		project: p,
	}));

	const projectGroups: LocalProjectGroup[] = oldGroups.map((g: any) => ({
		id: g.id,
		group: g,
	}));

	const files: LocalFile[] = Object.entries(fileMetadata).map(([path, detail]: [string, any]) => ({
		path,
		defaultProjectId: detail.defaultProjectId,
	}));

	return {
		meta: {
			lastFullSync: 0,
			lastDeltaSync: 0,
			deviceId: "",
			schemaVersion: 1,
		},
		tasks,
		projects,
		projectGroups,
		files,
	};
}

export function migrateDB(data: any): DBData {
	return data as DBData;
}
