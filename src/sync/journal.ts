import { db } from '@/db/dexie';
import type { JournalEntry } from '@/db/schema';
import log from '@/utils/logger';

const MAX_ENTRIES = 1000;
const PRUNE_INTERVAL = 50;

let writeCount = 0;

export function logSyncEvent(
	deviceId: string,
	action: string,
	details?: unknown
) {
	log.debug("[TickTickSync]", action, details ?? "");
	persistEntry({ timestamp: Date.now(), deviceId, action, details });
}

async function persistEntry(entry: Omit<JournalEntry, "id">) {
	if (!db?.journal) return;
	try {
		await db.journal.add(entry);
		writeCount++;
		if (writeCount % PRUNE_INTERVAL === 0) {
			const count = await db.journal.count();
			if (count > MAX_ENTRIES) {
				await db.journal
					.orderBy("id")
					.limit(count - MAX_ENTRIES)
					.delete();
			}
		}
	} catch (e) {
		log.warn("[TickTickSync] Failed to persist journal entry", e);
	}
}

export async function getSyncJournal(): Promise<JournalEntry[]> {
	if (!db?.journal) return [];
	return db.journal.orderBy("id").reverse().limit(MAX_ENTRIES).toArray();
}

export async function clearJournal(): Promise<void> {
	if (!db?.journal) return;
	await db.journal.clear();
}
