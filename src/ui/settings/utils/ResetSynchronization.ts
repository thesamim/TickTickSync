import { getSettings, updateSettings } from '@/settings';
import type TickTickSync from '@/main';
import log from '@/utils/logger';
import { db } from "@/db/dexie";

async function resetTimeStamp(plugin: TickTickSync, timeStamp: string) {
	await db.transaction("rw", db.tasks, async () => {
		const allLocalTasks = await db.tasks.toArray();
		const ts = new Date(timeStamp).getTime();
		for (const lt of allLocalTasks) {
			lt.task.modifiedTime = timeStamp;
			lt.updatedAt = ts;
		}
		await db.tasks.bulkPut(allLocalTasks);
	});

	if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) {
		plugin.tickTickRestAPI.api.checkpoint = 0;
	}
}

async function hardResetFromOBS(plugin: TickTickSync) {
	await plugin.service.syncFiles(true);
}


export async function resetTasks(plugin: TickTickSync, setIsWorking?: (val: boolean) => void) {
    setIsWorking?.(true);
	updateSettings({ checkPoint: 0 });
	//One Swell Foop update
	log.debug('## reset all tasks');
	await hardResetFromOBS(plugin);
	await plugin.saveSettings();
	await plugin.scheduledSynchronization(true);


	setIsWorking?.(false);
}
