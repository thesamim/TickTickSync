import { db } from "./dexie";

export async function upsertTask(task) {
	await db.tasks.put(task);
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
