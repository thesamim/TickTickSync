import { db } from "./dexie";
import type { ITask } from '@/api/types/Task';
import type { LocalTask } from '@/db/schema';


export async function upsertLocalTask(
	task: ITask,
	options: {
		file?: string;
		source: "obsidian" | "ticktick";
		deviceId: string;
	}
) {
	const now = Date.now();
	const modifiedTime = task.modifiedTime? new Date(task.modifiedTime).getTime() : undefined ;

	const localId = task.id
		? `tt:${task.id}`
		: crypto.randomUUID();

	const localTask: LocalTask = {
		localId: localId,
		taskId: task.id,
		task,

		updatedAt: modifiedTime  ?? now,
		lastModifiedByDeviceId: options.deviceId,

		deleted: false,
		file: options.file ?? "",
		source: options.source
	};

	await db.tasks.put(localTask);
}

export async function markTaskDeleted(taskId: string, deviceId: string) {
	await db.tasks.update(taskId, {
		deleted: true,
		updatedAt: Date.now(),
		lastModifiedByDeviceId: deviceId
	});
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
