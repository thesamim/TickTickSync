import Dexie from "dexie";
import type { Table } from "dexie";
import type { LocalTask, SyncMeta, DBData } from "./schema";
import type { TaskFileMapping, LocalProject, LocalProjectGroup, LocalFile, JournalEntry } from "./schema";

import { defaultDBData } from "./schema";
import { ensureSyncMeta } from "./meta";
import { migrateDB, migrateFromDataJson } from "./migrations";
import { getSettings } from '@/settings';

type MetaRow = SyncMeta & { key: "sync" };

class TickTickDB extends Dexie {
	tasks!: Table<LocalTask, string>;
	meta!: Table<MetaRow, "sync">;
	mappings!: Table<TaskFileMapping, string>;
	projects!: Table<LocalProject, string>;
	projectGroups!: Table<LocalProjectGroup, string>;
	files!: Table<LocalFile, string>;
	journal!: Table<JournalEntry, number>;

	constructor(vaultName: string) {
		super(vaultName + "TickTickSync");

		this.version(4).stores({
			tasks: "localId, taskId, updatedAt, lastVaultSync, file, deleted",
			meta: "key",
			mappings: "id, taskId, file",
			projects: "id",
			projectGroups: "id",
			files: "path"
		});

		this.version(5).stores({
			tasks: "localId, taskId, updatedAt, lastVaultSync, file, deleted",
			meta: "key",
			mappings: "id, taskId, file",
			projects: "id",
			projectGroups: "id",
			files: "path",
			journal: "++id, timestamp, deviceId, action"
		});
	}
}

export let db: TickTickDB;

export async function initDB() {
	if (!db) {
		db = new TickTickDB(getSettings().vaultName);
	}

	let rawMeta = await db.meta.get("sync");
	const settings = getSettings();

	if (!rawMeta) {
		const preMigrated = (settings as any).__migratedDBData as DBData | undefined;

		if (preMigrated) {
			// Use data already transformed by migrateFromDataJson (called from migrateData)
			const meta = await ensureSyncMeta(preMigrated.meta);
			await db.meta.put({ ...meta, key: "sync" });
			if (preMigrated.tasks.length > 0) await db.tasks.bulkPut(preMigrated.tasks);
			if (preMigrated.projects.length > 0) await db.projects.bulkPut(preMigrated.projects);
			if (preMigrated.projectGroups.length > 0) await db.projectGroups.bulkPut(preMigrated.projectGroups);
			if (preMigrated.files.length > 0) await db.files.bulkPut(preMigrated.files);
		} else {
			// No DB meta exists, create new one
			const meta = await ensureSyncMeta(structuredClone(defaultDBData.meta));
			await db.meta.put({ ...meta, key: "sync" });
			
			// Fallback: inline migration from old settings-based data
			const oldTasks = (settings as any).TickTickTasksData?.tasks;
			const fileMetadata = (settings as any).fileMetadata;
			
			if (oldTasks && oldTasks.length > 0) {
				const tasksToPut: LocalTask[] = oldTasks.map(t => {
					let filePath = "";
					for (const [path, detail] of Object.entries(fileMetadata || {})) {
						if (detail.TickTickTasks?.some((dt: any) => dt.taskId === t.id)) {
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
						source: "ticktick"
					};
				});

				await db.tasks.bulkPut(tasksToPut);
			}

			// Migration for version 4 (Projects, ProjectGroups, Files)
			const oldProjects = (settings as any).TickTickTasksData?.projects;
			if (oldProjects && oldProjects.length > 0) {
				await db.projects.bulkPut(oldProjects.map((p: any) => ({ id: p.id, project: p })));
			}

			const oldGroups = (settings as any).TickTickTasksData?.projectGroups;
			if (oldGroups && oldGroups.length > 0) {
				await db.projectGroups.bulkPut(oldGroups.map((g: any) => ({ id: g.id, group: g })));
			}

			if (fileMetadata) {
				const filesToPut: LocalFile[] = Object.entries(fileMetadata).map(([path, detail]: [string, any]) => ({
					path: path,
					defaultProjectId: detail.defaultProjectId
				}));
				if (filesToPut.length > 0) {
					await db.files.bulkPut(filesToPut);
				}
			}
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
