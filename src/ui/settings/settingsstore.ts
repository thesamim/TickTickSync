import type TickTickSync from '@/main';
import { type Writable, writable } from 'svelte/store';
import { type ITickTickSyncSettings, setSettings, settings, updateSettings } from '@/settings';

// New: keep a reference to the plugin instance
let currentPlugin: TickTickSync | null = null;

export let settingsStore: Writable<ITickTickSyncSettings>;

// Call from plugin setup (done in settingsLoad)
export function settingsLoad(plugin: TickTickSync) {
	if (settingsStore) {
		return;
	}
	currentPlugin = plugin; // Set the plugin ref for later store updates

	const { subscribe, set: svelteSet, update: svelteUpdate } = writable(settings);

	// Helper to update settings/module/plugin objects
	function syncAll(newSettings: ITickTickSyncSettings) {
		// Update the module-level variable
		Object.assign(settings, newSettings);
		// Also update the plugin instance if available
		if (currentPlugin) {
			setSettings(settings);
		}
	}

	settingsStore = {
		subscribe,
		update: (updater) => {
			svelteUpdate(current => {
				const updated = updater(current);
				syncAll(updated);
				return updated;
			});
		},
		set: async (value: ITickTickSyncSettings) => {
			svelteSet(value);
			syncAll(value);
			await currentPlugin?.saveSettings();
		},
	};
}
