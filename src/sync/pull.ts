import { db } from "@/db/dexie";
import { resolveTaskConflict } from "./conflicts";
import { logSyncEvent } from "./journal";

export async function pullFromTickTick(
	ticktickApi,
	meta
) {
	const remoteTasks = await ticktickApi.getUpdatedTasks(
		meta.lastDeltaSync
	);

	let applied = 0;

	for (const rt of remoteTasks) {
		// Ignore our own echoes
		if (rt.lastModifiedBy === meta.deviceId) continue;

		const remoteLocalTask = {
			taskId: rt.id,
			task: rt,
			updatedAt: rt.updatedAt,
			lastModifiedByDeviceId: rt.lastModifiedBy ?? "ticktick",
			file: "",
			source: "ticktick",
			deleted: rt.deleted
		};

		const local = await db.tasks.get(rt.id);
		const resolved = resolveTaskConflict(local, remoteLocalTask);

		await db.tasks.put(resolved);
		applied++;
	}

	logSyncEvent(meta.deviceId, "pull:complete", { applied });

	return applied;
}
