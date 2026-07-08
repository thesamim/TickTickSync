import { db } from "@/db/dexie";
import { pullFromTickTick } from "./pull";
import { logSyncEvent } from "./journal";
import type { TickTickRestAPI } from '@/services/TicktickRestAPI';
import { getSettings, updateSettings, mergeDeviceLists } from '@/settings';
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

		// Reconcile device lists between data.json (settings) and DB (meta)
		// This ensures devices added by other instances via Obsidian Sync are
		// preserved in both locations. Settings take precedence for label
		// (reflects user edits).
		const settingsDevices = getSettings().devices || [];
		const dbDevices = meta.devices || [];
		const merged = mergeDeviceLists(dbDevices, settingsDevices);
		if (merged.length !== settingsDevices.length ||
			merged.some((d, i) => d.deviceId !== settingsDevices[i]?.deviceId)) {
			updateSettings({ devices: merged });
			await db.meta.update("sync", { devices: merged });
			log.debug("[TickTickSync] reconciled device list", merged);
		}

		logSyncEvent(meta.deviceId, "sync:end", {
			pulled
		});
	} catch (err) {
		log.error("[TickTickSync] sync failed", err);
		logSyncEvent("unknown", "sync:error", {
			message: (err as Error).message
		});
	} finally {
		syncing = false;
	}
}
