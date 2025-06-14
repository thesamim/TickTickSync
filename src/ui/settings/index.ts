import { App, Notice, Plugin, PluginSettingTab, SearchComponent, Setting, TFolder } from 'obsidian';
import TickTickSync from '@/main';
import { getSettings, updateSettings } from '@/settings';
import log from '@/utils/logger';
import { init } from '@/ui/settings/settingsstore';
import { mount, type SvelteComponent, unmount } from 'svelte';
import SettingsTab from '@/ui/settings/svelte/SettingsTab.svelte';


export class TickTickSyncSettingTab extends PluginSettingTab {
	private readonly plugin: TickTickSync;
	private view: SvelteComponent;
	private settingsComponent: any;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
		init(this.plugin);
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();
		this.settingsComponent = mount(SettingsTab, {
			target: containerEl,
			props: {
				app: this.app,
				plugin: this.plugin,
			}
		});
	}
	async hide() {
		super.hide();
		unmount(this.settingsComponent);
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

	async validateNewFolder(newFolder: string) {
		//remove leading slash if it exists.
		if (newFolder && (newFolder.length > 1) && (/^[/\\]/.test(newFolder))) {
			newFolder = newFolder.substring(1);
		}
		let newFolderFile = this.app.vault.getAbstractFileByPath(newFolder);
		if (!newFolderFile) {
			//it doesn't exist, create it and return its path.
			try {
				newFolderFile = await this.app.vault.createFolder(newFolder);
				new Notice(`New folder ${newFolderFile.path} created.`);
			} catch (error) {
				new Notice(`Folder ${newFolder} creation failed: ${error}. Please correct and try again.`, 5000);
				return null;
			}
		}
		if (newFolderFile instanceof TFolder) {
			//they picked right, and the folder exists.
			//new Notice(`Default folder is now ${newFolderFile.path}.`)
			return newFolderFile.path;
		}
		return null;
	}

}
