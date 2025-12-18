import { db } from "@/db/dexie";
import { logSyncEvent } from "./journal";

export async function pushToTickTick(
	ticktickApi,
	meta
) {
	const dirty = await db.tasks
		.where("updatedAt")
		.above(meta.lastDeltaSync)
		.and(t =>
			t.lastModifiedByDeviceId === meta.deviceId
		)
		.toArray();

	let pushed = 0;

	for (const task of dirty) {
		if (task.deleted) {
			await ticktickApi.deleteTask(task.taskId);
		} else {
			await ticktickApi.createOrUpdateTask(task.task);
		}
		pushed++;
	}

	logSyncEvent(meta.deviceId, "push:complete", { pushed });

	return pushed;
}
