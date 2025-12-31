import { db } from "@/db/dexie";
import { pullFromTickTick } from "./pull";
import { pushToTickTick } from "./push";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import log from '@/utils/logger';

let syncing = false;

export async function syncTickTickWithDexie(ticktickRestApi: TickTickRestAPI, fullSync: boolean = false) {
	if (syncing) return;
	syncing = true;

	try {
		log.debug("[TickTickSync] sync started");
		const meta = await db.meta.get("sync");
		if (!meta) return;
log.debug("[TickTickSync] meta", meta);
		logSyncEvent(meta.deviceId, "sync:start");

		const pulled = await pullFromTickTick(
			ticktickRestApi,
			meta,
			fullSync
		);
log.debug("[TickTickSync] pulled", pulled);
		const pushed = await pushToTickTick(
			ticktickRestApi,
			meta,
			fullSync
		);
log.debug("[TickTickSync] pushed", pushed);


		logSyncEvent(meta.deviceId, "sync:end", {
			pulled,
			pushed
		});
	} catch (err) {
		log.error("[TickTickSync] sync failed", err);
		logSyncEvent("unknown", "sync:error", {
			message: err.message
		});
	} finally {
		syncing = false;
	}
}
