import { db } from "./dexie";
import type { ITask } from '@/api/types/Task';
import type { LocalTask } from '@/db/schema';
import log from '@/utils/logger';


export async function loadTasksFromCache() {
	try {
		const lts = await db.tasks.toArray();
		return lts.map(lt => lt.task);
	} catch (error) {
		log.error(`Error loading tasks from Cache: ${error}`);
		return [];
	}
}

export async function upsertLocalTask(
	task: ITask,
	options: {
		file?: string;
		source: "obsidian" | "ticktick";
		lastVaultSync?: number;
	}
) {
	const now = Date.now();
	const modifiedTime = task.modifiedTime? new Date(task.modifiedTime).getTime() : undefined ;

	const localId = task.id
		? `tt:${task.id}`
		: crypto.randomUUID();

	const existing = await db.tasks.get(localId);

	const localTask: LocalTask = {
		localId: localId,
		taskId: task.id,
		task,

		updatedAt: modifiedTime  ?? now,
		lastVaultSync: options.lastVaultSync ?? existing?.lastVaultSync,

		deleted: false,
		file: options.file ?? existing?.file ?? "",
		source: options.source
	};

	await db.tasks.put(localTask);
}

export async function markTaskDeleted(taskId: string) {
	const localId = `tt:${taskId}`;
	const existing = await db.tasks.get(localId);
	if (existing) {
		await db.tasks.update(localId, {
			deleted: true,
			updatedAt: Date.now()
		});
	}
}

export async function getDirtyTasks(since: number) {
	return db.tasks
		.where("updatedAt")
		.above(since)
		.toArray();
}

export async function getTasksByLabel(label: string) {
	const searchLabel = label.startsWith('#') ? label.substring(1).toLowerCase() : label.toLowerCase();
	return db.tasks
		.filter(task => {
			const hasLabel = task.task.tags?.some(tag => tag.toLowerCase() === searchLabel);
			return !task.deleted && !!hasLabel;
		})
		.toArray();
}
