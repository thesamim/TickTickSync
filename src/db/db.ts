import { type DBData, type LocalTask, defaultDBData } from './schema';

import { Plugin } from "obsidian";
import log from '@/utils/logger';

export async function createDB(plugin: Plugin) {

	const rootPath = plugin.app.vault.adapter.basePath;
	log.debug('Creating DB', rootPath);
	const dbPath = `${rootPath}/${plugin.manifest.dir}/ticktick-sync.json`;

	const db = await JSONFilePreset(dbPath,defaultDBData)

	await db.read();

	db.data ||= defaultDBData;

	await db.write();

	return db;
}

export function upsertTask(db: Low, task: LocalTask) {
	const existing = db.data.tasks.find(t => t.task.id === task.task.id);

	if (!existing) {
		db.data.tasks.push(task);
	} else if (task.task.modifiedTime > existing.task.modifiedTime) {
		Object.assign(existing, task);
	}
}

export function markDeleted(db: LowSync<DBData>, id: string) {
	const task = db.data!.tasks.find(t => t.id === id);
	if (task) {
		task.deleted = true;
		task.updatedAt = Date.now();
	}
}

export function getDirtyTasks(db: LowSync<DBData>, since: number) {
	return db.data!.tasks.filter(t => t.updatedAt > since);
}
