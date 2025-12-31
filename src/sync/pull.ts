import { db } from "@/db/dexie";
import { resolveTaskConflict } from "./conflicts";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import type { LocalTask, SyncMeta } from "@/db/schema";
import log from 'loglevel';

export async function pullFromTickTick(
	ticktickRestApi: TickTickRestAPI,
	meta: SyncMeta,
	fullSync = true
) {

	const { update, delete: deletedIds } = await ticktickRestApi.getUpdatedTasks(
		fullSync ? meta.lastFullSync : meta.lastDeltaSync
	);

	let applied = 0;

	for (const rt of update) {
		const remoteId = rt.id || (rt as any).taskId;
		if (!remoteId) {
			log.warn("[TickTickSync] Invalid task in update", rt);
			continue;
		}
		// Ignore our own echoes
		if (rt.lastModifiedBy === meta.deviceId) continue;

		const local = await db.tasks.where("taskId").equals(remoteId).first();

		const remoteLocalTask: LocalTask = {
			localId: local?.localId ?? `tt:${remoteId}`,
			taskId: remoteId,
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
	log.debug("[TickTickSync] deletedIds", deletedIds.length);
	for (const taskIdOrObj of deletedIds) {
		if (!taskIdOrObj) continue;

		const id = typeof taskIdOrObj === 'string' ? taskIdOrObj : (taskIdOrObj as any).taskId || (taskIdOrObj as any).id;
		if (!id || typeof id !== 'string') {
			log.warn("[TickTickSync] Invalid taskId in deletedIds", taskIdOrObj);
			continue;
		}

		let local;
		try {
			local = await db.tasks.where("taskId").equals(id).first();
		} catch (err) {
			console.error("Failed to get local task for deleted task", id, err);
			continue;
		}
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
