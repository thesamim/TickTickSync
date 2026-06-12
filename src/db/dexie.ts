import Dexie from "dexie";
import type { Table } from "dexie";
import type { LocalTask, SyncMeta } from "./schema";
import type { TaskFileMapping, LocalProject, LocalProjectGroup, LocalFile } from "./schema";

import { defaultDBData } from "./schema";
import { ensureSyncMeta } from "./meta";
import { migrateDB } from "./migrations";
import { getSettings, updateSettings } from '@/settings';
import { setCurrentDeviceInfo } from './device';
import type { DeviceInfo } from '@/settings';

type MetaRow = SyncMeta & { key: "sync" };

/**
 * Track a device in the settings devices array if not already present.
 * Ensures at most one entry per deviceLabel to prevent duplicates when
 * IndexedDB is lost and a new deviceId is generated for the same device.
 */
function trackDeviceInSettings(deviceId: string, deviceLabel: string): void {
	const settings = getSettings();
	const existing = settings.devices.find(d => d.deviceId === deviceId);

	if (!existing) {
		// No entry with this deviceId. Check if an entry with this label
		// already exists (from a prior deviceId after IndexedDB loss).
		const labelMatch = settings.devices.find(d => d.deviceLabel === deviceLabel);
		if (labelMatch) {
			updateSettings({
				devices: settings.devices.map(d =>
					d.deviceLabel === deviceLabel
						? { deviceId, deviceLabel }
						: d
				)
			});
		} else {
			updateSettings({
				devices: [...settings.devices, { deviceId, deviceLabel }]
			});
		}
	} else if (existing.deviceLabel !== deviceLabel) {
		updateSettings({
			devices: settings.devices.map(d =>
				d.deviceId === deviceId ? { deviceId, deviceLabel } : d
			)
		});
	}
}

class TickTickDB extends Dexie {
	tasks!: Table<LocalTask, string>;
	meta!: Table<MetaRow, "sync">;
	mappings!: Table<TaskFileMapping, string>;
	projects!: Table<LocalProject, string>;
	projectGroups!: Table<LocalProjectGroup, string>;
	files!: Table<LocalFile, string>;

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
		// No DB meta exists, create new one
		const meta = await ensureSyncMeta(structuredClone(defaultDBData.meta));
		await db.meta.put({ ...meta, key: "sync" });

		// Set current device info in memory
		setCurrentDeviceInfo({
			deviceId: meta.deviceId,
			deviceLabel: meta.deviceLabel || ''
		});

		// Track this device in settings
		trackDeviceInSettings(meta.deviceId, meta.deviceLabel || '');
		
		// Initial migration from old settings-based tasks
		const oldTasks = (settings as any).TickTickTasksData?.tasks;
		const fileMetadata = (settings as any).fileMetadata;
		
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

	// Migration for version 4 (Projects, ProjectGroups, Files)
	const projectCount = await db.projects.count();
	if (projectCount === 0) {
		const oldProjects = (settings as any).TickTickTasksData?.projects;
		if (oldProjects && oldProjects.length > 0) {
			await db.projects.bulkPut(oldProjects.map((p: any) => ({ id: p.id, project: p })));
		}
	}

	const groupCount = await db.projectGroups.count();
	if (groupCount === 0) {
		const oldGroups = (settings as any).TickTickTasksData?.projectGroups;
		if (oldGroups && oldGroups.length > 0) {
			await db.projectGroups.bulkPut(oldGroups.map((g: any) => ({ id: g.id, group: g })));
		}
	}

	const fileCount = await db.files.count();
	if (fileCount === 0) {
		const fileMetadata = (settings as any).fileMetadata;
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

	// Load device info from DB into memory (DB is source of truth)
	setCurrentDeviceInfo({
		deviceId: rawMeta.deviceId,
		deviceLabel: rawMeta.deviceLabel || ''
	});

	// Track this device in settings if not already tracked
	trackDeviceInSettings(rawMeta.deviceId, rawMeta.deviceLabel || '');

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
