import { db } from "@/db/dexie";
import { resolveTaskConflict } from "./conflicts";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import type { LocalTask, SyncMeta } from "@/db/schema";
import log from '@/utils/logger';

/** Resolve a task identifier that may appear as `id` or `taskId`. */
function resolveTaskId(task: { id?: string; taskId?: string }): string | undefined {
	return task.id || task.taskId;
}

/** Resolve a deletion entry that may be a string or an object with `id`/`taskId`. */
function resolveDeletionItem(item: string | { id?: string; taskId?: string }): string | null {
	if (!item) return null;
	return typeof item === 'string' ? item : item.taskId || item.id || null;
}

export async function pullFromTickTick(
	ticktickRestApi: TickTickRestAPI,
	meta: SyncMeta,
	fullSync = true
) {

	const { update, delete: deletedIds } = await ticktickRestApi.getUpdatedTasks(
		fullSync ? 0 : meta.lastDeltaSync
	);

	let applied = 0;

	// 1️⃣ Bulk fetch local tasks for all updates
	const remoteIds = update.map(rt => resolveTaskId(rt as { id?: string; taskId?: string })).filter((id): id is string => !!id);
	const localTasks = await db.tasks.where("taskId").anyOf(remoteIds).toArray();
	const localMap = new Map(localTasks.map(lt => [lt.taskId, lt]));

	const toPut: LocalTask[] = [];

	for (const rt of update) {
		const remoteId = resolveTaskId(rt);
		if (!remoteId) {
			log.warn("[TickTickSync] Invalid task in update", rt);
			continue;
		}

		const local = localMap.get(remoteId);
		const remoteUpdatedAt = rt.modifiedTime ? new Date(rt.modifiedTime).getTime() : Date.now();

		// Echo suppression: skip pulling tasks that this device last modified
		// and that haven't been changed on TickTick since our push.
		if (local && local.lastModifiedByDeviceId === meta.deviceId && local.task.modifiedTime === rt.modifiedTime) {
			// log.debug("[TickTickSync] Skipping echo update for task", remoteId);
			continue;
		}

		// Ensure dateHolder is correctly merged with local task if available
		if (local) {
			ticktickRestApi.plugin.dateMan?.addDateHolderToTask(rt, local.task);
		}

		const remoteLocalTask: LocalTask = {
			localId: local?.localId ?? `tt:${remoteId}`,
			taskId: remoteId,
			task: rt,
			updatedAt: remoteUpdatedAt,
			file: local?.file ?? "",
			source: "ticktick",
			deleted: rt.deleted === 1,
			lastVaultSync: local?.lastVaultSync
		};

		const { resolved, conflictDetected, winner } = resolveTaskConflict(local, remoteLocalTask);
		if (conflictDetected) {
			logSyncEvent(meta.deviceId, "conflict:resolved", {
				taskId: resolved.taskId,
				winner,
				localUpdatedAt: local?.updatedAt ? new Date(local.updatedAt).toLocaleString() : undefined,
				remoteUpdatedAt: new Date(remoteUpdatedAt).toLocaleString()
			});
		}
		toPut.push(resolved);
		applied++;
	}

	if (toPut.length > 0) {
		const unique = Array.from(new Map(toPut.map(t => [t.localId, t])).values());
		if (unique.length !== toPut.length) {
			log.warn(`[TickTickSync] pull: deduplicated ${toPut.length - unique.length} duplicate tasks`);
		}
		await db.tasks.bulkPut(unique);
	}

	// 2️⃣ Handle deletions
	const deletionIds = deletedIds.map(taskIdOrObj => resolveDeletionItem(taskIdOrObj as string | { id?: string; taskId?: string })).filter((id): id is string => !!id && typeof id === 'string');

	if (deletionIds.length > 0) {
		const localToDelete = await db.tasks.where("taskId").anyOf(deletionIds).toArray();
		const toUpdateDeletion: LocalTask[] = [];

		for (const local of localToDelete) {
			if (!local.deleted) {
				local.deleted = true;
				local.updatedAt = Date.now();
				toUpdateDeletion.push(local);
				applied++;
			}
		}

		if (toUpdateDeletion.length > 0) {
			await db.tasks.bulkPut(toUpdateDeletion);
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
