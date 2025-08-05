import { App, PluginSettingTab } from 'obsidian';
import TickTickSync from '@/main';
import { getSettings } from '@/settings';
import { mount, type SvelteComponent, unmount } from 'svelte';
import SettingsTabs from '@/ui/settings/svelte/SettingsTabs.svelte';
import { settingsLoad } from '@/ui/settings/settingsstore';


export class TickTickSyncSettingTab extends PluginSettingTab {
	private readonly plugin: TickTickSync;
	private view: SvelteComponent;
	private settingsComponent: any;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
		settingsLoad(plugin);
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();
		this.settingsComponent = mount(SettingsTabs, {
			target: containerEl,
			props: {
				app: this.app,
				plugin: this.plugin
			}
		});
	}

	async hide() {
		super.hide();
		await unmount(this.settingsComponent);
	}

	/*

	 */


	private getProjectTagText(myProjectsOptions: Record<string, string>) {
		const project = myProjectsOptions[getSettings().SyncProject];
		const tag = getSettings().SyncTag;
		const taskAndOr = getSettings().tagAndOr;

		if (!project && !tag) {
			return 'No limitation.';
		}
		if (project && !tag) {
			return `Only Tasks in <b>${project}</b> will be synchronized`;
		}
		if (!project && tag) {
			return `Only Tasks tagged with <b>#${tag}</b> tag will be synchronized`;
		}
		if (taskAndOr == 1) {
			return `Only tasks in <b>${project}</b> AND tagged with <b>#${tag}</b> tag will be synchronized`;
		}
		return `All tasks in <b>${project}</b> will be synchronized. All tasks tagged with <b>#${tag}</b> tag will be synchronized`;
	}

	private async confirmFullSync() {
		const myModal = new ConfirmFullSyncModal(this.app, () => {
		});
		return await myModal.showModal();
	}

}
