import type { LocalTask } from "@/db/schema";

export function resolveTaskConflict(
	local: LocalTask | undefined,
	remote: LocalTask
): LocalTask {
	if (!local) return remote;

	if (local.updatedAt > remote.updatedAt) {
		return local;
	}

	if (remote.updatedAt > local.updatedAt) {
		return remote;
	}

	// Tie-breaker: prefer local device
	return local.lastModifiedByDeviceId === remote.lastModifiedByDeviceId
		? local
		: remote;
}
