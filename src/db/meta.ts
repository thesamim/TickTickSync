import type { SyncMeta } from "./schema";
import { generateDeviceId, detectDeviceLabel } from "./device";
import { getSettings } from '@/settings';

export async function ensureSyncMeta(meta: SyncMeta, preferred?: Partial<SyncMeta>): Promise<SyncMeta> {
	let changed = false;

	if (!meta.deviceId) {
		const newLabel = preferred?.deviceLabel || await detectDeviceLabel();
		meta.deviceLabel = newLabel;

		if (preferred?.deviceId) {
			meta.deviceId = preferred.deviceId;
		} else {
			const existing = getSettings().devices.find(d => d.deviceLabel === newLabel);
			meta.deviceId = existing ? existing.deviceId : generateDeviceId();
		}
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
