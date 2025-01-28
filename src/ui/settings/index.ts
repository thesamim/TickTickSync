import {App, Notice, PluginSettingTab, SearchComponent, Setting, TFolder} from "obsidian";
import {ConfirmFullSyncModal} from "@/modals/ConfirmFullSyncModal";
import {FolderSuggest} from "@/utils/FolderSuggester";
import TickTickSync from "@/main";
import {getSettings, updateSettings} from "@/settings";

const PROVIDER_OPTIONS: Record<string, string> = {"ticktick.com": "TickTick", "dida365.com": "Dida365"} as const;
const TAGS_BEHAVIOR: Record<number, string> = {1: "AND", 2: "OR"} as const;
const LOG_LEVEL: Record<string, string> = {"trace": "trace", "debug": "debug", "info": "info", "warn": "warn", "error": "error"} as const;

export class TickTickSyncSettingTab extends PluginSettingTab {
	private readonly plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h1', {text: 'TickTickSync Settings'});

		this.addAuthBlock(containerEl);

		await this.addSyncBlock(containerEl);

		this.addManualBlock(containerEl);

		this.addDebugBlock(containerEl);
	}

	/*

	 */

	private addAuthBlock(containerEl: HTMLElement) {

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Access Control'});
		let userLogin: string;
		let userPassword: string;

		new Setting(containerEl)
			.setName("TickTick/Dida")
			.setDesc("Select home server")
			.setHeading()
			.addDropdown(component =>
				component
					.addOptions(PROVIDER_OPTIONS)
					.setValue(getSettings().baseURL)
					.onChange(async (value: string) => {
						updateSettings({baseURL: value});
						await this.saveSettings();
					})
			);
		//Re-instate userid, password login because I can't be shagged to figure out putting up a browser window on
		// mobile.
		new Setting(containerEl)
			.setName('Username')
			.setDesc('...')
			.addText(text => text
				.setPlaceholder('User Name')
				.setValue("")
				.onChange(async (value) => {
					userLogin = value;
				})
			);

		new Setting(containerEl)
			.setName('Password')
			.setDesc('...')
			.addText(text => text
				.setPlaceholder('Password')
				.setValue("")
				.onChange(async (value) => {
					userPassword = value;
				})
			)

		//MB add a checkbox (with warning about risk) to give the user the option to save the email address

		new Setting(containerEl)
			.setName("Login")
			.setDesc(getSettings().token ? "You are logged in. You can re-login here." : "Please login here.")
			.addButton(loginBtn => {
				loginBtn.setClass('ts_login_button');
				loginBtn.setButtonText("Login");
				loginBtn.setTooltip("Click To Login")
				loginBtn.onClick( async () => {
					await this.loginHandler(getSettings().baseURL, userLogin, userPassword)
				})
			})
	}

	private async addSyncBlock(containerEl: HTMLElement) {
		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Sync control'});

		const projects = await this.plugin.service.getProjects();
		const myProjectsOptions: Record<string, string> = projects.reduce((obj, item) => {
			obj[item.id] = item.name;
			return obj;
		}, {} as Record<string, string>);

		this.addSyncDefaultFolderPath();

		// new Setting(containerEl)
		// 	.setName('Keep project folders')
		// 	.setDesc('Use the TickTick project folders in the Vault. Otherwise, keep everything in the default folder.')
		// 	.addToggle(component =>
		// 		component
		// 			.setValue(getSettings().keepProjectFolders)
		// 			.onChange(async (value) => {
		// 				updateSettings({keepProjectFolders: value});
		// 				await this.plugin.saveSettings()
		// 			})
		// 	)

		new Setting(containerEl)
			.setName('Default project')
			.setDesc('New tasks are automatically synced to the default project. You can modify the project here.')
			.addDropdown(component =>
				component
					.addOption(getSettings().defaultProjectId, getSettings().defaultProjectName)
					.addOptions(myProjectsOptions)
					.onChange(async (value) => {
						getSettings().defaultProjectId = value
						updateSettings({defaultProjectName: await this.plugin.cacheOperation?.getProjectNameByIdFromCache(value)})
						const defaultProjectFileName = getSettings().defaultProjectName + ".md"
						//make sure the file exists.
						const defaultProjectFile = await this.plugin.fileOperation?.getOrCreateDefaultFile(defaultProjectFileName);
						if (defaultProjectFile) {
							this.plugin.cacheOperation?.setDefaultProjectIdForFilepath(defaultProjectFile.path, getSettings().defaultProjectId)
						} else {
							new Notice("Unable to create file for selected default project " + getSettings().defaultProjectName)
						}
						await this.plugin.saveSettings()
					})
			)
		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'Limit synchronization'});
		new Setting(containerEl)
			.setDesc("To limit the tasks TickTickSync will synchronize from TickTick to " +
				"Obsidian select a tag and/or project(list) below. If a tag is entered, only tasks with that tag will be " +
				"synchronized. If a project(list) is selected, only tasks in that project will be synchronized. If " +
				"both are chosen the behavior will be determined by your settings. See result below.")

		new Setting(containerEl)
			.setName('Project')
			.setDesc('Only tasks in this project will be synchronized.')
			.addDropdown(component =>
				component
					.addOption("", "")
					.addOptions(myProjectsOptions)
					.setValue(getSettings().SyncProject)
					.onChange(async (value) => {
						updateSettings({SyncProject: value});
						const fileMetaData = getSettings().fileMetadata;
						const defaultProjectFileEntry = Object.values(fileMetaData).find(obj => obj.defaultProjectId === getSettings().SyncProject);
						if (!defaultProjectFileEntry) {
							const noticeMsg = "Did not find a default Project File for Project " +
								myProjectsOptions?.[value] +
								". Please create a file and set it's default to this project, or select a file to be the default for this project."
							new Notice(noticeMsg, 0)
						}
						await this.plugin.saveSettings()
						await this.display();
					})
			)

		new Setting(containerEl)
			.setName('Tag Behavior')
			.setDesc('Determine how Tags will be handled.')
			.addDropdown(component =>
				component
					.addOptions(TAGS_BEHAVIOR)
					.setValue(String(getSettings().tagAndOr))
					.onChange(async (value) => {
						updateSettings({tagAndOr: parseInt(value)});
						await this.plugin.saveSettings();
						await this.display();
					}))

		let saveSettingsTimeout: ReturnType<typeof setTimeout>;
		new Setting(containerEl)
			.setName('Tag')
			.setDesc('Tag value, no "#"')
			.addText(text => text
				.setValue(getSettings().SyncTag)
				.onChange(async (value) => {
					clearTimeout(saveSettingsTimeout);
					saveSettingsTimeout = setTimeout(async () => {
						if (value.startsWith("#")) {
							value = value.substring(1);
						}
						updateSettings({SyncTag: value});
						await this.plugin.saveSettings();
						explanationText.innerHTML = this.getProjectTagText(myProjectsOptions);
					}, 1000);
				})
			)
		const explanationText = containerEl.createEl('p', {text: 'Project/Tag selection result.'});
		explanationText.innerHTML = this.getProjectTagText(myProjectsOptions);

		containerEl.createEl('hr');
		new Setting(containerEl)
			.setName('Automatic sync interval time')
			.setDesc('Please specify the desired interval time, with seconds as the default unit. 0 for manual sync. The default setting is 300 seconds, which corresponds to syncing once every 5 minutes. You can customize it, but it cannot be lower than 20 seconds.')
			.addText((text) =>
				text
					.setPlaceholder('Sync interval')
					.setValue(getSettings().automaticSynchronizationInterval.toString())
					.onChange(async (value) => {
						const intervalNum = Number(value)
						if (isNaN(intervalNum) || !Number.isInteger(intervalNum)) {
							new Notice(`Wrong type, please enter a integer.`)
							return
						}
						if (intervalNum !== 0 && intervalNum < 20) {
							new Notice(`The synchronization interval time cannot be less than 20 seconds.`)
							return
						}
						updateSettings({automaticSynchronizationInterval: intervalNum});
						await this.saveSettings()
						this.plugin.reloadInterval();
						new Notice('Settings have been updated.');
						//
					})
			)


		new Setting(containerEl)
			.setName('Full vault sync')
			.setDesc('By default, only tasks marked with #TickTick are synchronized. If this option is turned on, all tasks in the vault will be synchronized.' +
				'**NOTE: This includes all tasks that are currently Items of a task.**')
			.addToggle(component =>
				component
					.setValue(getSettings().enableFullVaultSync)
					.onChange(async (value) => {

						if (!getSettings().enableFullVaultSync) {
							const bConfirmation = await this.confirmFullSync()
							if (bConfirmation) {
								updateSettings({enableFullVaultSync: true})
								await this.plugin.saveSettings()
								new Notice("Full vault sync is enabled.")
							} else {
								updateSettings({enableFullVaultSync: false});
								await this.plugin.saveSettings()
								new Notice("Full vault sync not enabled.")
							}
							//TODO: if we don't do this, things get farckled.
							await this.display();
						} else {
							updateSettings({enableFullVaultSync: value});
							await this.plugin.saveSettings()
							new Notice("Full vault sync is disabled.")
						}
					})
			)
	}

	private addSyncDefaultFolderPath(): void {
		let folderSearch: SearchComponent | undefined;
		new Setting(this.containerEl)
			.setName("Default folder location")
			.setDesc("Folder to be used for TickTick Tasks.")
			.addSearch((cb) => {
				folderSearch = cb;
				new FolderSuggest(cb.inputEl);
				cb.setPlaceholder("Example: folder1/folder2")
					.setValue(getSettings().TickTickTasksFilePath)
				// @ts-ignore
				// maybe someday we'll style it.
				// cb.containerEl.addClass("def-folder");
			})
			.addButton((cb) => {
				cb.setIcon('plus');
				cb.setTooltip('Add folder');
				cb.onClick(async () => {
					const newFolder = folderSearch?.getValue();
					if (!newFolder) { //TODO add message
						return;
					}
					const updatedFolder = await this.validateNewFolder(newFolder);
					if (getSettings().debugMode) {
						console.log('updated folder: ', updatedFolder);
					}
					if (updatedFolder) {
						folderSearch?.setValue(updatedFolder)
						getSettings().TickTickTasksFilePath = updatedFolder
						await this.plugin.saveSettings();
					}

					await this.display();
				});
			});
	}

	private addManualBlock(containerEl: HTMLElement) {
		if (!getSettings().token)
			return;

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Manual operations'});

		new Setting(containerEl)
			.setName('Manual sync')
			.setDesc('Manually perform a synchronization task.')
			.addButton(button => button
				.setButtonText('Sync')
				.onClick(async () => {
					// Add code here to handle exporting TickTick data
					if (!getSettings().token) {
						new Notice(`Please log in from settings first`)
						return
					}
					try {
						await this.plugin.scheduledSynchronization()
						new Notice(`Sync completed..`)
					} catch (error) {
						new Notice(`An error occurred while syncing.:${error}`)
					}

				})
			);


		new Setting(containerEl)
			.setName('Check database')
			.setDesc('Check for possible issues: sync error, file renaming not updated, or missed tasks not synchronized.')
			.addButton(button => button
				.setButtonText('Check Database')
				.onClick(async () => {
					if (!getSettings().token) {
						new Notice(`Please log in from settings first`)
						return
					}

					await this.plugin.service.checkDataBase();
				})
			);

		new Setting(containerEl)
			.setName('Backup TickTick data')
			.setDesc('Click to backup TickTick data, The backed-up files will be stored in the root directory of the Obsidian vault.')
			.addButton(button => button
				.setButtonText('Backup')
				.onClick(() => {
					// Add code here to handle exporting TickTick data
					if (!getSettings().token) {
						new Notice(`Please log in from settings first`)
						return
					}
					this.plugin.service.backup()
				})
			);
	}

	private addDebugBlock(containerEl: HTMLElement) {
		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Debug options'});

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Allow access to developer settings.')
			.addToggle(component =>
				component
					.setValue(getSettings().debugMode)
					.onChange(async (value) => {
						updateSettings({debugMode: value});
						await this.saveSettings(true);
					})
			)

		if (!getSettings().debugMode) return;

		new Setting(containerEl)
			.setName('Log Level')
			.setDesc('Determine log level.')
			.addDropdown(component =>
				component
					.addOptions(LOG_LEVEL)
					.setValue(getSettings().logLevel)
					.onChange(async (value) => {
						updateSettings({logLevel: value});
						await this.saveSettings(true);
						this.plugin.reloadLogging();
					}))

		new Setting(containerEl)
			.setName('Skip backup')
			.setDesc('Skip backup on startup.')
			.addToggle(component =>
				component
					.setValue(!!getSettings().skipBackup)
					.onChange(async (value) => {
						updateSettings({skipBackup: value});
						await this.saveSettings();
					})
			)
	}

	/*

	 */

	private async saveSettings(update?: boolean): Promise<void> {
		await this.plugin.saveSettings();
		if (update) {
			await this.display();
		}
	}

	/*
	
	 */
	
	private async loginHandler(baseUrl?: string, username?: string, password?: string) {
		if (!baseUrl || !username || !password ||
			baseUrl.length < 1 || username.length < 1 || password.length < 1) {
			new Notice("Please fill in both Username and Password")
			return;
		}

		const info = await this.plugin.service.login(baseUrl, username, password);
		if (!info) {
			new Notice("Login Failed. ")
			return;
		}

		const oldInboxId = getSettings().inboxID;
		if (oldInboxId.length > 0 &&  oldInboxId != info.inboxId) {
			//they've logged in with a different user id ask user about it.
			new Notice("You are logged in with a different user ID.")
		}
		//if oldInboxId same as info.inboxId ask user about full re-syncing. set checkPoint to 0 to force full sync.

		updateSettings({
			token: info.token,
			inboxID: info.inboxId,
		});
		await this.plugin.saveProjectsToCache();
		await this.saveSettings(true);
	}

	private getProjectTagText(myProjectsOptions: Record<string, string>) {
		const project = myProjectsOptions[getSettings().SyncProject];
		const tag = getSettings().SyncTag;
		const taskAndOr = getSettings().tagAndOr;

		if (!project && !tag) {
			return "No limitation.";
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
		const myModal = new ConfirmFullSyncModal(this.app, () => {});
		return await myModal.showModal();
	}

	private async validateNewFolder(newFolder: string) {
		//remove leading slash if it exists.
		if (newFolder && (newFolder.length > 1) && (/^[/\\]/.test(newFolder))) {
			newFolder = newFolder.substring(1);
		}
		let newFolderFile = this.app.vault.getAbstractFileByPath(newFolder);
		if (!newFolderFile) {
			//it doesn't exist, create it and return its path.
			try {
				newFolderFile = await this.app.vault.createFolder(newFolder);
				new Notice(`New folder ${newFolderFile.path} created.`)
			} catch (error) {
				new Notice(`Folder ${newFolder} creation failed: ${error}. Please correct and try again.`, 0)
				return null;
			}
		}
		if (newFolderFile instanceof TFolder) {
			//they picked right, and the folder exists.
			//new Notice(`Default folder is now ${newFolderFile.path}.`)
			return newFolderFile.path
		}
		return null;
	}

}
