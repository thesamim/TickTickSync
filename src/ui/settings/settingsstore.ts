import type TickTickSync from '@/main';
import { type Writable, writable } from 'svelte/store';
import { type ITickTickSyncSettings, settings } from '@/settings';

import TickTickSyncSettings from '@/ui/settings/TickTickSyncSettings.svelte';


export let settingsStore: Writable<ITickTickSyncSettings>;

export function init(plugin: TickTickSync) {
	if (settingsStore) {
		return;
	}
	const { subscribe, set, update } = writable(settings);
	settingsStore = {
		subscribe,
		update,
		// save the plugin values when setting the store
		set: (value: TickTickSyncSettings) => {
			set(value);
			plugin.saveSettings();
		},
	};
}
