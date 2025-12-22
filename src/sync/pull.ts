import { db } from "@/db/dexie";
import { resolveTaskConflict } from "./conflicts";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import type { LocalTask } from "@/db/schema";

export async function pullFromTickTick(
	ticktickRestApi: TickTickRestAPI,
	meta,
	fullSync = true
) {

	const { update, delete: deletedIds } = await ticktickRestApi.getUpdatedTasks(
		fullSync ? meta.lastFullSync : meta.lastDeltaSync
	);

	let applied = 0;

	for (const rt of update) {
		// Ignore our own echoes
		if (rt.lastModifiedBy === meta.deviceId) continue;

		const local = await db.tasks.where("taskId").equals(rt.id).first();

		const remoteLocalTask: LocalTask = {
			localId: local?.localId ?? `tt:${rt.id}`,
			taskId: rt.id,
			task: rt,
			updatedAt: rt.updatedAt,
			lastModifiedByDeviceId: rt.lastModifiedBy ?? "ticktick",
			file: local?.file ?? "",
			source: "ticktick",
			deleted: rt.deleted
		};

		const resolved = resolveTaskConflict(local, remoteLocalTask);

		await db.tasks.put(resolved);
		applied++;
	}

	for (const id of deletedIds) {
		const local = await db.tasks.where("taskId").equals(id).first();
		if (local && !local.deleted) {
			await db.tasks.update(local.localId, {
				deleted: true,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: "ticktick"
			});
			applied++;
		}
	}
	if (fullSync) {
		await db.meta.update("sync", {
			lastFullSync: ticktickRestApi.checkpoint
		});
	} else {
		await db.meta.update("sync", {
			lastDeltaSync: ticktickRestApi.checkpoint
		});
	}
	logSyncEvent(meta.deviceId, "pull:complete", { applied });

	return applied;
}
