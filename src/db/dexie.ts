import Dexie, { Table } from "dexie";
import type { LocalTask, SyncMeta } from "./schema";
import type { TaskFileMapping } from "./schema";

import { defaultDBData } from "./schema";
import { ensureSyncMeta } from "./meta";
import { migrateDB } from "./migrations";
import { getTasks, getSettings } from "@/settings";

type MetaRow = SyncMeta & { key: "sync" };

class TickTickDB extends Dexie {
	tasks!: Table<LocalTask, string>;
	meta!: Table<MetaRow, "sync">;
	mappings!: Table<TaskFileMapping, string>;

	constructor() {
		super("TickTickSync");

		this.version(2).stores({
			tasks: "localId, taskId, updatedAt, file, deleted",
			meta: "key",
			mappings: "id, taskId, file"
		});
	}
}

export const db = new TickTickDB();

export async function initDB() {
	let rawMeta = await db.meta.get("sync");

	if (!rawMeta) {
		const meta = await ensureSyncMeta(structuredClone(defaultDBData.meta));
		await db.meta.put({ ...meta, key: "sync" });
		
		// Initial migration from old settings-based tasks
		const oldTasks = getTasks();
		const fileMetadata = getSettings().fileMetadata;
		
		if (oldTasks && oldTasks.length > 0) {
			const tasksToPut: LocalTask[] = oldTasks.map(t => {
				// Find file mapping
				let filePath = "";
				for (const [path, detail] of Object.entries(fileMetadata)) {
					if (detail.TickTickTasks.some(dt => dt.taskId === t.id)) {
						filePath = path;
						break;
					}
				}

				return {
					localId: `tt:${t.id}`,
					taskId: t.id,
					task: t,
					updatedAt: t.modifiedTime ? new Date(t.modifiedTime).getTime() : Date.now(),
					lastModifiedByDeviceId: meta.deviceId || "unknown",
					deleted: t.deleted === 1,
					file: filePath,
					source: "ticktick"
				};
			});

			await db.tasks.bulkPut(tasksToPut);
		}
		
		rawMeta = await db.meta.get("sync");
	}

	if (!rawMeta) return;

	const migrated = migrateDB({
		meta: rawMeta,
		tasks: await db.tasks.toArray()
	});

	await db.transaction("rw", db.tasks, db.meta, async () => {
		await db.tasks.bulkPut(migrated.tasks);
		const finalizedMeta = await ensureSyncMeta(migrated.meta);
		await db.meta.put({ ...finalizedMeta, key: "sync" });

	});
}
