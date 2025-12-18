import { db } from "@/db/dexie";
import { pullFromTickTick } from "./pull";
import { pushToTickTick } from "./push";
import { logSyncEvent } from "./journal";

let syncing = false;

export async function syncAll(ticktickApi) {
	if (syncing) return;
	syncing = true;

	try {
		const meta = await db.meta.get("sync");
		if (!meta) return;

		logSyncEvent(meta.deviceId, "sync:start");

		const pulled = await pullFromTickTick(
			ticktickApi,
			meta
		);

		const pushed = await pushToTickTick(
			ticktickApi,
			meta
		);

		await db.meta.update("sync", {
			lastDeltaSync: Date.now()
		});

		logSyncEvent(meta.deviceId, "sync:end", {
			pulled,
			pushed
		});
	} catch (err) {
		console.error("[TickTickSync] sync failed", err);
		logSyncEvent("unknown", "sync:error", {
			message: err.message
		});
	} finally {
		syncing = false;
	}
}
