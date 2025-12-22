import Dexie, { Table } from "dexie";
import type { LocalTask, SyncMeta } from "./schema";
import type { TaskFileMapping } from "./schema";

import { defaultDBData } from "./schema";
import { ensureSyncMeta } from "./meta";
import { migrateDB } from "./migrations";

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
	const rawMeta = await db.meta.get("sync");

	if (!rawMeta) {
		const meta = ensureSyncMeta(structuredClone(defaultDBData.meta));
		await db.meta.put({ ...meta, key: "sync" });
		return;
	}

	const migrated = migrateDB({
		meta: rawMeta,
		tasks: await db.tasks.toArray()
	});

	await db.transaction("rw", db.tasks, db.meta, async () => {
		await db.tasks.clear();
		await db.tasks.bulkPut(migrated.tasks);
		await db.meta.put({ ...ensureSyncMeta(migrated.meta), key: "sync" });
	});
}
