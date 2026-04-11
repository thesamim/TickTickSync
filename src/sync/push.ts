import { db } from "@/db/dexie";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import type { Tick } from '@/api';
import type { LocalTask, SyncMeta } from '@/db/schema';
import log from '@/utils/logger';

export async function pushToTickTick(
	ticktickRestApi: TickTickRestAPI,
	meta: SyncMeta & { key: 'sync'; },
	fullSync: boolean) {
	const dirty = await db.tasks
		.where("updatedAt")
		.above(meta.lastDeltaSync)
		.and(t =>
			t.lastModifiedByDeviceId === meta.deviceId
		)
		.toArray();


	//debug only
	log.debug( "last deltasync", new Date(meta.lastDeltaSync));
	log.debug("last fullSync", new Date(meta.lastFullSync));
	dirty.forEach((tick) => {
		log.debug("updated at ",  new Date(tick.updatedAt))
	})

	let pushed = 0;
	const toUpdateInDb: { localId: string, changes: Partial<LocalTask> }[] = [];

	for (const task of dirty) {
		// 1️⃣ Deletion
		if (task.deleted) {
			if (task.taskId) {
				await ticktickRestApi.deleteTask(task.taskId, task.task.projectId);
				log.debug("[TickTickSync] Deleted task", task.taskId);
			}
			pushed++;
			continue;
		}

		// 2️⃣ New task (never pushed before)
		if (!task.taskId) {
			log.debug("[TickTickSync] Creating task (localId=%s)", task.localId);

			const created = await ticktickRestApi.createTask(task.task);

			// 🔁 IMPORTANT: Persist returned ID
			if (created) {
				toUpdateInDb.push({
					localId: task.localId,
					changes: {
						taskId: created.id,
						task: created,
						updatedAt: created.modifiedTime ? new Date(created.modifiedTime).getTime() : Date.now(),
						lastModifiedByDeviceId: meta.deviceId
					}
				});
			}

			pushed++;
			continue;
		}

		// 3️⃣ Existing task update
		log.debug("[TickTickSync] Updating task", task.taskId);

		const updated = await ticktickRestApi.updateTask(task.task);
		if (updated) {
			toUpdateInDb.push({
				localId: task.localId,
				changes: {
					task: updated,
					updatedAt: updated.modifiedTime ? new Date(updated.modifiedTime).getTime() : Date.now(),
					lastModifiedByDeviceId: meta.deviceId
				}
			});
		}

		pushed++;
	}

	if (toUpdateInDb.length > 0) {
		await db.transaction("rw", db.tasks, async () => {
			for (const item of toUpdateInDb) {
				await db.tasks.update(item.localId, item.changes);
			}
		});
	}

	logSyncEvent(meta.deviceId, "push:complete", { pushed });

	return pushed;
}
