import type { SyncMeta } from "./schema";
import { generateDeviceId, detectDeviceLabel } from "./device";

export async function ensureSyncMeta(meta: SyncMeta): Promise<SyncMeta> {
	let changed = false;

	if (!meta.deviceId) {
		meta.deviceId = generateDeviceId();
		meta.deviceLabel = await detectDeviceLabel();
		changed = true;
	}

	if (!meta.lastFullSync ) {
		meta.lastFullSync = 0;
		changed = true;
	}

	if (!meta.lastDeltaSync) {
		meta.lastDeltaSync = 0;
		changed = true;
	}

	return meta;
}
