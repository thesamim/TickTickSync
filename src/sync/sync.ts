import { db } from "@/db/dexie";
import { pullFromTickTick } from "./pull";
import { pushToTickTick } from "./push";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import log from '@/utils/logger';

let syncing = false;

export async function syncAll(ticktickRestApi: TickTickRestAPI, fullSync: boolean = true) {
	if (syncing) return;
	syncing = true;

	try {
		const meta = await db.meta.get("sync");
		if (!meta) return;

		logSyncEvent(meta.deviceId, "sync:start");

		const pulled = await pullFromTickTick(
			ticktickRestApi,
			meta,
			fullSync
		);

		const pushed = await pushToTickTick(
			ticktickRestApi,
			meta,
			fullSync
		);



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
