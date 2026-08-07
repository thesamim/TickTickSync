import { App, PluginSettingTab, SettingPage } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import TickTickSync from '@/main';
import { mount, unmount } from 'svelte';
import SettingsTabs from '@/ui/settings/svelte/SettingsTabs.svelte';
import { settingsLoad } from '@/ui/settings/settingsstore';

type SettingsPageConstructor = new (plugin: TickTickSync) => SettingPage;

let settingsPageClass: SettingsPageConstructor | null = null;

/**
 * Returns a subclass of the real Obsidian `SettingPage`, created lazily so that
 * it is only ever evaluated when `getSettingDefinitions()` is called (Obsidian
 * 1.13.0+). On Obsidian < 1.13.0 the runtime module has no `SettingPage` export,
 * so this must never be touched there; the legacy `display()` path below is used
 * instead. Extending (not merely satisfying) the base class is what gives us the
 * framework-owned `rootEl` / `titlebarEl` / `containerEl` elements.
 */
function getSettingsPageClass(): SettingsPageConstructor {
	if (!settingsPageClass) {
		if (typeof SettingPage !== 'function') {
			throw new Error('SettingPage requires Obsidian 1.13.0+');
		}
		settingsPageClass = class TickTickSyncSettingsPage extends SettingPage {
			containerEl!: HTMLElement;
			rootEl!: HTMLElement;
			titlebarEl!: HTMLElement;
			title = 'TickTickSync';
			private plugin: TickTickSync;
			private view: Record<string, unknown> | null = null;

			constructor(plugin: TickTickSync) {
				super();
				this.plugin = plugin;
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
		};
	}
	return settingsPageClass;
}

export class TickTickSyncSettingTab extends PluginSettingTab {
	private readonly plugin: TickTickSync;
	private view: Record<string, unknown> | null = null;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
		settingsLoad(plugin);
	}

	// Obsidian < 1.13.0 renders this legacy tab; 1.13.0+ renders the
	// definitions from getSettingDefinitions() and skips display().
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

	// Obsidian 1.13.0+ renders settings from these definitions and skips
	// display(). Obsidian < 1.13.0 ignores this method and uses display()
	// above, so minAppVersion can stay at 1.12.7.
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'page',
				name: 'TickTickSync',
				desc: 'Configure TickTick synchronization settings',
				page: (): SettingPage => new (getSettingsPageClass())(this.plugin),
			},
		];
	}
}
