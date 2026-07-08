import { updateSettings } from '@/settings';
import type TickTickSync from '@/main';
import log from '@/utils/logger';

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
