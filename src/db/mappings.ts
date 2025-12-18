import { db } from "./dexie";
import type { TaskFileMapping } from "./schema";

function mappingId(taskId: string, file: string) {
	return `${taskId}:${file}`;
}

/* -----------------------------
   Create mapping
-------------------------------- */
export async function linkTaskToFile(
	taskId: string,
	file: string,
	section?: string
) {
	const id = mappingId(taskId, file);

	await db.mappings.put({
		id,
		taskId,
		file,
		section,
		createdAt: Date.now()
	});
}

/* -----------------------------
   Remove mapping
-------------------------------- */
export async function unlinkTaskFromFile(
	taskId: string,
	file: string
) {
	await db.mappings.delete(mappingId(taskId, file));
}

/* -----------------------------
   Query helpers
-------------------------------- */
export async function getFilesForTask(taskId: string) {
	return db.mappings
		.where("taskId")
		.equals(taskId)
		.toArray();
}

export async function getTasksForFile(file: string) {
	return db.mappings
		.where("file")
		.equals(file)
		.toArray();
}

/* -----------------------------
   Cleanup on delete
-------------------------------- */
export async function cleanupMappingsForTask(taskId: string) {
	await db.mappings
		.where("taskId")
		.equals(taskId)
		.delete();
}
