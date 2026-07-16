import { db } from "./dexie";
import type { LocalFile } from './schema';

export async function upsertFile(path: string, defaultProjectId?: string) {
	const existing = await db.files.get(path);
	await db.files.put({
		...existing,
		path,
		defaultProjectId
	});
}

export async function getFile(path: string): Promise<LocalFile | undefined> {
	return db.files.get(path);
}

export async function getAllFiles(): Promise<LocalFile[]> {
	return db.files.toArray();
}

export async function deleteFile(path: string) {
	await db.files.delete(path);
}

export async function updateFilePath(oldPath: string, newPath: string) {
	const file = await db.files.get(oldPath);
	if (file) {
		await db.files.delete(oldPath);
		await db.files.put({
			...file,
			path: newPath
		});
	}
}
