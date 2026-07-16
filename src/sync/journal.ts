import { db } from '@/db/dexie';
import type { JournalEntry } from '@/db/schema';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

const PRUNE_INTERVAL = 10;

let writeCount = 0;

export function logSyncEvent(
	deviceId: string,
	action: string,
	details?: unknown
) {
	void persistEntry({ timestamp: Date.now(), deviceId, action, details });
}

async function persistEntry(entry: Omit<JournalEntry, "id">) {
	if (!db?.journal) return;
	try {
		await db.journal.add(entry);
		writeCount++;
		if (writeCount % PRUNE_INTERVAL === 0) {
			await pruneOldEntries();
		}
	} catch (e) {
		log.warn("[TickTickSync] Failed to persist journal entry", e);
	}
}

async function pruneOldEntries() {
	try {
		const days = getSettings().journalRetentionDays;
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		await db.journal.where("timestamp").below(cutoff).delete();
	} catch (e) {
		log.warn("[TickTickSync] Failed to prune journal entries", e);
	}
}

export async function getSyncJournal(): Promise<JournalEntry[]> {
	if (!db?.journal) return [];
	return db.journal.orderBy("id").reverse().toArray();
}

export async function clearJournal(): Promise<void> {
	if (!db?.journal) return;
	await db.journal.clear();
}
