import type { DBData } from "./schema";

export function migrateDB(data: any): DBData {
	if (!data.meta?.schemaVersion) {
		// v1 → v2
		for (const task of data.tasks ?? []) {
			task.lastModifiedByDeviceId ??= "unknown";
		}

		data.meta.schemaVersion = 2;
	}

	return data as DBData;
}
