import Dexie from "dexie";
import type { Table } from "dexie";
import type { LocalTask, SyncMeta, DBData, DeviceInfo } from "./schema";
import type { TaskFileMapping, LocalProject, LocalProjectGroup, LocalFile, JournalEntry, LocalTag } from "./schema";

import { defaultDBData } from "./schema";
import { ensureSyncMeta } from "./meta";
import { migrateDB } from "./migrations";
import { getSettings, updateSettings } from '@/settings';
import { setCurrentDeviceInfo } from './device';

type MetaRow = SyncMeta & { key: "sync" };

/**
 * Track a device in the settings devices array if not already present.
 * Ensures at most one entry per deviceLabel to prevent duplicates when
 * IndexedDB is lost and a new deviceId is generated for the same device.
 * Also persists the updated list to the DB meta table.
 */
async function trackDeviceInSettings(deviceId: string, deviceLabel: string): Promise<void> {
	const settings = getSettings();
	const existing = settings.devices.find(d => d.deviceId === deviceId);

	let updatedDevices: DeviceInfo[];

	if (!existing) {
		const labelMatch = settings.devices.find(d => d.deviceLabel === deviceLabel);
		if (labelMatch) {
			updatedDevices = settings.devices.map(d =>
				d.deviceLabel === deviceLabel
					? { deviceId, deviceLabel }
					: d
			);
		} else {
			updatedDevices = [...settings.devices, { deviceId, deviceLabel }];
		}
	} else if (existing.deviceLabel !== deviceLabel) {
		updatedDevices = settings.devices.map(d =>
			d.deviceId === deviceId ? { deviceId, deviceLabel } : d
		);
	} else {
		return;
	}

	updateSettings({ devices: updatedDevices });

	// Persist device list to DB meta
	await db.meta.update("sync", { devices: updatedDevices });
}

class TickTickDB extends Dexie {
	tasks!: Table<LocalTask, string>;
	meta!: Table<MetaRow, "sync">;
	mappings!: Table<TaskFileMapping, string>;
	projects!: Table<LocalProject, string>;
	projectGroups!: Table<LocalProjectGroup, string>;
	files!: Table<LocalFile, string>;
	tags!: Table<LocalTag, string>;
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
			tags: "name",
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
		const legacySettings = settings as unknown as {
			__migratedDBData?: DBData;
			TickTickTasksData?: {
				tasks?: Array<{ id: string; modifiedTime?: string; deleted?: number }>;
				projects?: Array<{ id: string }>;
				projectGroups?: Array<{ id: string }>;
			};
			fileMetadata?: Record<string, { TickTickTasks?: Array<{ taskId: string }>; defaultProjectId?: string }>;
		};
		const preMigrated = legacySettings.__migratedDBData;

		if (preMigrated) {
			// Use data already transformed by migrateFromDataJson (called from migrateData)
			const meta = await ensureSyncMeta(preMigrated.meta);
			await db.meta.put({ ...meta, key: "sync" });
			if (preMigrated.tasks.length > 0) await db.tasks.bulkPut(preMigrated.tasks);
			if (preMigrated.projects.length > 0) await db.projects.bulkPut(preMigrated.projects);
			if (preMigrated.projectGroups.length > 0) await db.projectGroups.bulkPut(preMigrated.projectGroups);
			if (preMigrated.files.length > 0) await db.files.bulkPut(preMigrated.files);

			setCurrentDeviceInfo({ deviceId: meta.deviceId, deviceLabel: meta.deviceLabel || '' });
			await trackDeviceInSettings(meta.deviceId, meta.deviceLabel || '');
		} else {
			// No DB meta exists, create new one
			const meta = await ensureSyncMeta(structuredClone(defaultDBData.meta));
			await db.meta.put({ ...meta, key: "sync" });

			setCurrentDeviceInfo({ deviceId: meta.deviceId, deviceLabel: meta.deviceLabel || '' });
			await trackDeviceInSettings(meta.deviceId, meta.deviceLabel || '');
			
			// Fallback: inline migration from old settings-based data
			const oldTasks = legacySettings.TickTickTasksData?.tasks;
			const fileMetadata = legacySettings.fileMetadata;
			
			if (oldTasks && oldTasks.length > 0) {
				const tasksToPut: LocalTask[] = oldTasks.map((t) => {
					let filePath = "";
					for (const [path, detail] of Object.entries(fileMetadata || {})) {
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
						source: "ticktick"
					};
				});

				await db.tasks.bulkPut(tasksToPut);
			}

			// Migration for version 4 (Projects, ProjectGroups, Files)
			const oldProjects = legacySettings.TickTickTasksData?.projects;
			if (oldProjects && oldProjects.length > 0) {
				await db.projects.bulkPut(oldProjects.map((p) => ({ id: p.id, project: p as unknown as LocalProject["project"] })));
			}

			const oldGroups = legacySettings.TickTickTasksData?.projectGroups;
			if (oldGroups && oldGroups.length > 0) {
				await db.projectGroups.bulkPut(oldGroups.map((g) => ({ id: g.id, group: g as unknown as LocalProjectGroup["group"] })));
			}

			if (fileMetadata) {
				const filesToPut: LocalFile[] = Object.entries(fileMetadata).map(([path, detail]) => ({
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

	// Reload meta after migration and ensure device is tracked
	rawMeta = await db.meta.get("sync");
	if (rawMeta) {
		setCurrentDeviceInfo({ deviceId: rawMeta.deviceId, deviceLabel: rawMeta.deviceLabel || '' });
		await trackDeviceInSettings(rawMeta.deviceId, rawMeta.deviceLabel || '');
	}
}
