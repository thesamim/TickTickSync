import {App, Notice, PluginSettingTab, SearchComponent, Setting, TFolder} from "obsidian";
import {TickTickRestAPI} from "@/TicktickRestAPI";
import {ConfirmFullSyncModal} from "@/modals/ConfirmFullSyncModal";
import {FolderSuggest} from "@/utils/FolderSuggester";
import TickTickSync from "@/main";
import {getSettings, updateSettings} from "@/settings";

const PROVIDER_OPTIONS: Record<string, string> = {"ticktick.com": "TickTick", "dida365.com": "Dida365"} as const;
const TAGS_BEHAVIOR: Record<number, string> = {1: "AND", 2: "OR"} as const;

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

		this.addSyncBlock(containerEl);

		this.addManualBlock(containerEl);

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Debug operations'});

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('After enabling this option, all log information will be output to the console, which can help check for errors.')
			.addToggle(component =>
				component
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value) => {
						this.plugin.settings.debugMode = value
						await this.plugin.saveSettings()
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

	private addAuthBlock(containerEl: HTMLElement) {

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Access Control'});
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
				.setValue(getSettings().username || "")
				.onChange(async (value) => {
					updateSettings({username: value});
					await this.saveSettings();
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

		new Setting(containerEl)
			.setName("Login")
			.setDesc(getSettings().token ? "You are logged in. You can re-login here." : "Please login here.")
			.addButton(loginBtn => {
				loginBtn.setClass('ts_login_button');
				loginBtn.setButtonText("Login");
				loginBtn.setTooltip("Click To Login")
				loginBtn.onClick( async () => {
					await this.loginHandler(getSettings().baseURL, getSettings().username, userPassword)
				})
			})
	}

	private addSyncBlock(containerEl: HTMLElement) {
		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Sync control'});

		//let projectsLoaded: boolean = this.plugin.settings.apiInitialized && this.plugin.settings.TickTickTasksData?.projects;

		const projects = this.plugin.settings.TickTickTasksData?.projects || [];
		const myProjectsOptions: Record<string, string> = projects.reduce((obj, item) => {
			try {
				obj[item.id] = item.name;
			} catch {
				console.error("Failed to Load", item.name);
			}
			return obj;
		}, {} as Record<string, string>);

		this.addSyncDefaultFolderPath();

		new Setting(containerEl)
			.setName('Default project')
			.setDesc('New tasks are automatically synced to the default project. You can modify the project here.')
			.addDropdown(component =>
				component
					.addOption(this.plugin.settings.defaultProjectId, this.plugin.settings.defaultProjectName)
					.addOptions(myProjectsOptions)
					.onChange(async (value) => {
						this.plugin.settings.defaultProjectId = value
						this.plugin.settings.defaultProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(value)
						const defaultProjectFileName = this.plugin.settings.defaultProjectName + ".md"
						//make sure the file exists.
						const defaultProjectFile = await this.plugin.fileOperation?.getOrCreateDefaultFile(defaultProjectFileName);
						if (defaultProjectFile) {
							this.plugin.cacheOperation?.setDefaultProjectIdForFilepath(defaultProjectFile.path, this.plugin.settings.defaultProjectId)
						} else {
							new Notice("Unable to create file for selected default project " + this.plugin.settings.defaultProjectName)
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
					.setValue(this.plugin.settings.SyncProject)
					.onChange(async (value) => {
						this.plugin.settings.SyncProject = value;
						const fileMetaData = this.plugin.settings.fileMetadata;
						const defaultProjectFileEntry = Object.values(fileMetaData).find(obj => obj.defaultProjectId === this.plugin.settings.SyncProject);
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
					.setValue(String(this.plugin.settings.tagAndOr))
					.onChange(async (value) => {
						this.plugin.settings.tagAndOr = parseInt(value);
						await this.plugin.saveSettings();
						await this.display();
					}))

		let saveSettingsTimeout: ReturnType<typeof setTimeout>;
		new Setting(containerEl)
			.setName('Tag')
			.setDesc('Tag value, no "#"')
			.addText(text => text
				.setValue(this.plugin.settings.SyncTag)
				.onChange(async (value) => {
					clearTimeout(saveSettingsTimeout);
					saveSettingsTimeout = setTimeout(async () => {
						if (value.startsWith("#")) {
							value = value.substring(1);
						}
						this.plugin.settings.SyncTag = value;
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
					.setValue(this.plugin.settings.enableFullVaultSync)
					.onChange(async (value) => {

						if (!this.plugin.settings.enableFullVaultSync) {
							const bConfirmation = await this.confirmFullSync()
							if (bConfirmation) {
								this.plugin.settings.enableFullVaultSync = true
								await this.plugin.saveSettings()
								new Notice("Full vault sync is enabled.")
							} else {
								this.plugin.settings.enableFullVaultSync = false;
								await this.plugin.saveSettings()
								new Notice("Full vault sync not enabled.")
							}
							//TODO: if we don't do this, things get farckled.
							await this.display();
						} else {
							this.plugin.settings.enableFullVaultSync = value
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
					.setValue(this.plugin.settings.TickTickTasksFilePath)
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
					if (this.plugin.settings.debugMode) {
						console.log('updated folder: ', updatedFolder);
					}
					if (updatedFolder) {
						folderSearch?.setValue(updatedFolder)
						this.plugin.settings.TickTickTasksFilePath = updatedFolder
						await this.plugin.saveSettings();
					}

					await this.display();
				});
			});
	}

	private addManualBlock(containerEl: HTMLElement) {
		if (!this.plugin.settings.apiInitialized)
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
					if (!this.plugin.settings.apiInitialized) {
						new Notice(`Please log in from settings first`)
						return
					}
					try {
						await this.plugin.scheduledSynchronization()
						await this.plugin.unlockSynclock();
						new Notice(`Sync completed..`)
					} catch (error) {
						new Notice(`An error occurred while syncing.:${error}`)
						await this.plugin.unlockSynclock();
					}

				})
			);


		new Setting(containerEl)
			.setName('Check database')
			.setDesc('Check for possible issues: sync error, file renaming not updated, or missed tasks not synchronized.')
			.addButton(button => button
				.setButtonText('Check Database')
				.onClick(async () => {
					await this.checkDataBase();
				})
			);

		new Setting(containerEl)
			.setName('Backup TickTick data')
			.setDesc('Click to backup TickTick data, The backed-up files will be stored in the root directory of the Obsidian vault.')
			.addButton(button => button
				.setButtonText('Backup')
				.onClick(() => {
					// Add code here to handle exporting TickTick data
					if (!this.plugin.settings.apiInitialized) {
						new Notice(`Please log in from settings first`)
						return
					}
					this.plugin.tickTickSync?.backupTickTickAllResources()
				})
			);
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

		updateSettings({
			token: info.token,
			inboxID: info.inboxId,
		});

		this.plugin.settings.apiInitialized = true;
		updateSettings({checkPoint: 0});
		this.plugin.tickTickRestAPI = new TickTickRestAPI(this.app, this.plugin, null);
		this.plugin.tickTickRestAPI.token = info.token;

		//TODO: load projects and tags
		// //it's first login right? Cache the projects for to get the rest of set up done.
		// new Notice('Logged in! Fetching projects', 5);
		// await this.plugin.cacheOperation?.saveProjectsToCache();
		// new Notice('Project Fetch complete.', 5);
		await this.saveSettings(true);
	}

	private getProjectTagText(myProjectsOptions: Record<string, string>) {
		const project = myProjectsOptions[this.plugin.settings.SyncProject];
		const tag = this.plugin.settings.SyncTag;
		const taskAndOr = this.plugin.settings.tagAndOr;

		if (!project && !tag) {
			return "No limitation."
		}
		if (project && !tag) {
			return "Only Tasks in <b>" + project + "</b> will be synchronized"
		}
		if (!project && tag) {
			return "Only Tasks tagged with <b>#" + tag + "</b> tag will be synchronized"
		}
		if (taskAndOr == 1) {
			return "Only tasks in <b>" + project + "</b> AND tagged with <b>#" + tag + "</b> tag will be synchronized"
		}
		return "All tasks in <b>" + project + "</b> will be synchronized. All tasks tagged with <b>#" + tag + "</b> tag will be synchronized";
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

	//TODO: move to service
	private async checkDataBase() {
		// Add code here to handle exporting TickTick data
		if (!this.plugin.settings.apiInitialized) {
			new Notice(`Please log in from settings first`)
			return
		}

		//reinstall plugin

		//check file metadata
		console.log('checking file metadata')

		const fileNum = await this.plugin.cacheOperation?.checkFileMetadata()
		console.log("Number of files: ", fileNum)
		if (!fileNum || fileNum < 1){ //nothing? really?
			console.log("File Metadata rebuild.");
			const allMDFiles = this.app.vault.getMarkdownFiles();
			allMDFiles.forEach(file => {
				// console.log("File: ", file);
				this.plugin.tickTickSync?.fullTextModifiedTaskCheck(file.path)
			});
		}
		await this.plugin.saveSettings()

		const metadatas = await this.plugin.cacheOperation?.getFileMetadatas()

		if (!await this.plugin.checkAndHandleSyncLock()) return;

		console.log('checking deleted tasks')
		//check empty task
		for (const key in metadatas) {
			// console.log("Key: ", key)
			const value = metadatas[key];
			//console.log(value)
			for (const taskDetails of value.TickTickTasks) {

				//console.log(`${taskId}`)
				let taskObject

				try {
					taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetails.taskId)
				} catch (error) {
					console.error(`An error occurred while loading task cache: ${error.message}`);
				}

				if (!taskObject) {
					// console.log(`The task data of the ${taskId} is empty.`)
					//get from TickTick
					try {
						taskObject = await this.plugin.tickTickRestAPI?.getTaskById(taskDetails.taskId);
						if (taskObject && taskObject.deleted === 1) {
							await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskDetails.taskId)
						}
					} catch (error) {
						if (error.message.includes('404')) {
							// console.log(`Task ${taskId} seems to not exist.`);
							await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskDetails.taskId)
							continue
						} else {
							console.error(error);
							continue
						}
					}

				}
			}
			;

		}
		await this.plugin.saveSettings()


		console.log('checking renamed files -- This operation takes a while, please be patient.')
		try {
			//check renamed files
			for (const key in metadatas) {
				console.log("Checking Renamed: ", key);
				const value = metadatas[key];
				//console.log(value)
				const obsidianURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(key)
				for (const taskDetail of value.TickTickTasks) {
					//console.log(`${taskId}`)
					let taskObject
					try {
						taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetail.taskId)
					} catch (error) {
						console.error(`An error occurred while loading task ${taskDetail.taskId} from cache: ${error.message}`);
					}
					if (!taskObject) {
						console.error(`Task ${taskDetail.id}: ${taskDetail.title} is not found.`)
						continue
					}
					const oldTitle = taskObject?.title ?? '';
					if (!oldTitle.includes(obsidianURL)) {
						// console.log('Preparing to update description.')
						// console.log(oldContent)
						// console.log(newContent)
						try {
							await this.plugin.tickTickSync?.updateTaskContent(key)
						} catch (error) {
							console.error(`An error occurred while updating task description: ${error.message}`);
						}
					}
				}
			}
			console.log("Done File Rename check.");

			try {
				console.log('checking unsynced tasks');
				const files = this.app.vault.getFiles();
				for (const v of files) {

					const i = files.indexOf(v);
					if (v.extension == 'md') {
						console.log("Now looking at: ", v);
						try {
							console.log(`Scanning file ${v.path}`)
							await this.plugin.fileOperation?.addTickTickLinkToFile(v.path);
							if (this.plugin.settings.enableFullVaultSync) {
								await this.plugin.fileOperation?.addTickTickTagToFile(v.path);
							}
						} catch (error) {
							console.error(`An error occurred while check new tasks in the file: ${v.path}, ${error.message}`);
						}

					}
				}
				await this.plugin.unlockSynclock();
			} catch (Error) {
				console.error(`An error occurred while checking for unsynced tasks.:${Error}`)
				await this.plugin.unlockSynclock();
				return;
			}


			new Notice(`All files have been scanned.`)


		} catch (error) {
			console.error(`An error occurred while scanning the vault.:${error}`)
			await this.plugin.unlockSynclock();
		}
	}
}
