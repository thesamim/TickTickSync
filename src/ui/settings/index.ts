import { App, PluginSettingTab } from 'obsidian';
import TickTickSync from '@/main';
import { mount, unmount } from 'svelte';
import SettingsTabs from '@/ui/settings/svelte/SettingsTabs.svelte';
import { settingsLoad } from '@/ui/settings/settingsstore';

export class TickTickSyncSettingTab extends PluginSettingTab {
	private readonly plugin: TickTickSync;
	private view: Record<string, unknown> | null = null;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
		settingsLoad(plugin);
	}

	display(): void {
		this.containerEl.empty();
		this.view = mount(SettingsTabs, {
			target: this.containerEl,
			props: {
				app: this.plugin.app,
				plugin: this.plugin,
			},
		}) as Record<string, unknown> | null;
	}

	hide(): void {
		if (this.view) {
			void unmount(this.view);
			this.view = null;
		}
	}

}
