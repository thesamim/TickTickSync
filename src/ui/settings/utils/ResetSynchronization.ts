import { getSettings, updateSettings } from '@/settings';
import type TickTickSync from '@/main';
import log from '@/utils/logger';

function resetTimeStamp(plugin: TickTickSync, timeStamp: string) {
	const allTasks = getSettings().TickTickTasksData.tasks;
	for (const task of allTasks) {
		task.modifiedTime = timeStamp;
	}
	updateSettings({ TickTickTasksData: { ...getSettings().TickTickTasksData, tasks: allTasks } });
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
	//update from TT to Obs.
	log.debug('## reset from OBS to TT');
	await hardResetFromOBS(plugin);
	await plugin.saveSettings();
	await plugin.scheduledSynchronization();

	//update from Obs to TT.
	log.debug('## reset from TT to OBS');
	let timeStamp = '1970-01-01T00:00:00.000Z';
	resetTimeStamp(plugin, timeStamp);
	await plugin.saveSettings();
	await plugin.scheduledSynchronization();


	setIsWorking?.(false);
}
