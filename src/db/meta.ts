import type { SyncMeta } from "./schema";
import { generateDeviceId } from "./device";

export async function ensureSyncMeta(meta: SyncMeta, preferred?: Partial<SyncMeta>): Promise<SyncMeta> {
	let changed = false;

	if (!meta.deviceId) {
		meta.deviceId = preferred?.deviceId || generateDeviceId();
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
