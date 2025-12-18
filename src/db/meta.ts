import type { SyncMeta } from "./schema";
import { generateDeviceId, detectDeviceLabel } from "./device";

export function ensureSyncMeta(meta: SyncMeta): SyncMeta {
	let changed = false;

	if (!meta.deviceId) {
		meta.deviceId = generateDeviceId();
		meta.deviceLabel = detectDeviceLabel();
		changed = true;
	}

	if (typeof meta.lastFullSync !== "number") {
		meta.lastFullSync = 0;
		changed = true;
	}

	if (typeof meta.lastDeltaSync !== "number") {
		meta.lastDeltaSync = 0;
		changed = true;
	}

	return meta;
}
