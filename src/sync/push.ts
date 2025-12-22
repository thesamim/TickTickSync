import { db } from "@/db/dexie";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import type { Tick } from '@/api';
import type { SyncMeta } from '@/db/schema';
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

	let pushed = 0;

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
			await db.tasks.update(task.localId, {
				taskId: created.id,
				task: created,
				updatedAt: created.updatedAt
			});

			pushed++;
			continue;
		}

		// 3️⃣ Existing task update
		log.debug("[TickTickSync] Updating task", task.taskId);

		await ticktickRestApi.updateTask(task.task);

		pushed++;
	}

	logSyncEvent(meta.deviceId, "push:complete", { pushed });

	return pushed;
}
