import type { LocalTask } from "@/db/schema";

export type ConflictResult = {
	resolved: LocalTask;
	conflictDetected: boolean;
	winner: "local" | "remote";
};

export function resolveTaskConflict(
	local: LocalTask | undefined,
	remote: LocalTask
): ConflictResult {
	if (!local) return { resolved: remote, conflictDetected: false, winner: "remote" };

	if (local.updatedAt >= remote.updatedAt) {
		return { resolved: local, conflictDetected: true, winner: "local" };
	}

	return { resolved: remote, conflictDetected: true, winner: "remote" };
}
