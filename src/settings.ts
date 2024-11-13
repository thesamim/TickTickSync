import {App, Notice, PluginSettingTab, SearchComponent, Setting, TAbstractFile, TFolder} from 'obsidian';
import TickTickSync from "../main";
import {ConfirmFullSyncModal} from "./modals/ConfirmFullSyncModal"
import {FolderSuggest} from "./utils/FolderSuggester";
import { Tick } from './api';
import { TickTickRestAPI } from './TicktickRestAPI';

const PROVIDER_OPTIONS: Record<string, string> =  {
	ticktick: "ticktick.com",
	dida365: "dida365.com"
} as const;

export interface TickTickSyncSettings {
	inboxName: any;
	inboxID: any;
	SyncProject: any;
	SyncTag: any;
	baseURL: string; //TODO store key
	initialized: boolean;
	apiInitialized: boolean;
	defaultProjectName: string;
	defaultProjectId: string;
	TickTickTasksFilePath: string;
	automaticSynchronizationInterval: number;
	TickTickTasksData: any;
	fileMetadata: any;
	enableFullVaultSync: boolean;
	statistics: any;
	debugMode: boolean;
	token:string;
	syncLock: boolean;
	checkPoint: number;
	version: string;
	tagAndOr: number; // 1 == And ; 2 == Or
	/** If true, use the project folders from TickTick in the vault. Otherwise, keep all in the default folder. */
	keepProjectFolders: boolean;
}


export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	defaultProjectId: "",
	token: "",
	initialized: false,
	apiInitialized: false,
	defaultProjectName: "Inbox",
	baseURL: PROVIDER_OPTIONS.ticktick,
	automaticSynchronizationInterval: 300, //default sync interval 300s
	TickTickTasksData: {"projects": [], "tasks": [], "projectGroups": []},
	fileMetadata: {},
	enableFullVaultSync: false,
	statistics: {},
	debugMode: false,
	TickTickTasksFilePath: "/",
	inboxName: "",
	inboxID: "",
	SyncProject: "",
	SyncTag: "",
	syncLock: false,
	checkPoint: 0,
	tagAndOr: 0,
	version: "",
	keepProjectFolders: false
}


export class TickTickSyncSettingTab extends PluginSettingTab {
	plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let bProjectsLoaded = false;
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings'});

		if (this.plugin.settings.TickTickTasksData?.projects) {
			bProjectsLoaded = true;
		}
		const myProjectsOptions: Record<string, string> | undefined = this.plugin.settings.TickTickTasksData?.projects?.reduce((obj, item) => {
			try {
				obj[(item.id).toString()] = item.name;
				return obj;
			} catch {
				console.error("Failed to Load", item.name);
			}
		}, {});
		const currentVal = Object.keys(PROVIDER_OPTIONS).find(key => PROVIDER_OPTIONS[key] === this.plugin.settings.baseURL) || PROVIDER_OPTIONS.ticktick
		const tagAndOr: Record<number, string> = {1: "AND", 2: "OR"}

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Access Control'});
		let userName: string;
		let userPassword: string;
		let bDisplayLogin = (!userName) && (!userPassword)

		new Setting(containerEl)
			.setName("TickTick/Dida")
			.setDesc("Select home server")
			.setHeading()
			.addDropdown(component =>
				component
					.addOptions(PROVIDER_OPTIONS)
					.setValue(currentVal)
					.onChange(async (value: string) => {
						this.plugin.settings.baseURL = PROVIDER_OPTIONS[value]
						await this.plugin.saveSettings();
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
					userName = value;
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
			.setDesc("Please login here.")
			.setHeading()
			.addButton(loginBtn => {
				loginBtn.setClass('ts_login_button');
				loginBtn.setButtonText("Login");
				loginBtn.setTooltip("Click To Login")
				loginBtn.onClick(async () => {

					if ((!userName) || (!userPassword)) {
						new Notice("Please fill in both User Name and Password")
					} else {
						if (this.plugin.tickTickRestAPI) {
							this.plugin.settings.token = "";
							this.plugin.settings.apiInitialized = false;
							this.plugin.settings.initialized = false;
							this.plugin.tickTickRestAPI = null;
							await this.plugin.saveSettings();
							// console.log("Before: ", this.plugin.tickTickRestAPI);
							delete  this.plugin.tickTickRestAPI
							// console.log("After: ", this.plugin.tickTickRestAPI);
						}
						const api = new Tick({
							username: userName,
							password: userPassword,
							baseUrl: this.plugin.settings.baseURL,
							token: "",
							checkPoint: this.plugin.settings.checkPoint
						});
						// console.log("Gonna login: ", api);
						const loggedIn = await api.login();
						if (loggedIn) {
							this.plugin.settings.token = api.token;
							this.plugin.tickTickRestAPI = new TickTickRestAPI(this.app, this.plugin, api);
							this.plugin.tickTickRestAPI.token = this.plugin.settings.token = api.token;
							this.plugin.settings.inboxID = api.inboxId;
							this.plugin.settings.inboxName = 'Inbox';
							this.plugin.settings.apiInitialized = true;
							this.plugin.settings.checkPoint = api.checkpoint;
							await this.plugin.saveSettings();
							//it's first login right? Cache the projects for to get the rest of set up done.
							new Notice('Logged in! Fetching projects', 5);
							await this.plugin.cacheOperation?.saveProjectsToCache();
							new Notice('Project Fetch complete.', 5);
							await this.plugin.saveSettings();
							this.display();
						} else {
							// console.log("we failed!");
							this.plugin.settings.token = "";
							this.plugin.settings.apiInitialized = false;
							this.plugin.settings.initialized = false;
							this.plugin.tickTickRestAPI = null;
							await this.plugin.saveSettings();

							let errMsg = "Login Failed. "
							if (api.lastError) {
								console.log("Last Error: ", api.lastError);
								errMsg = errMsg + JSON.stringify(api.lastError)
								errMsg = errMsg.replace(/{/g, '\n').replace(/}/g, '\n').replace(/,/g, '\n')
							} else {
								errMsg = errMsg + "\nUnknown error occurred.";
							}
							new Notice(errMsg, 0)
						}
					}
				})
			})


		if (this.plugin.settings.apiInitialized && bProjectsLoaded) {
			containerEl.createEl('hr');
			containerEl.createEl('h1', { text: 'Sync control' });

			this.addFolderOptions(containerEl);

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
									new Notice("Unable to create file for selected default project " + this.plugin.settings.defaultProjectName )
								}
								await this.plugin.saveSettings()
							})
					)
			containerEl.createEl('hr');
			containerEl.createEl('h2', { text: 'Limit synchronization' });

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
							const defaultProjectFileEntry = Object.values(fileMetaData).find(obj => obj.defaultProjectId === this.plugin.settings.SyncProject );
							if(!defaultProjectFileEntry) {
								const noticeMsg = "Did not find a default Project File for Project " +
									myProjectsOptions?.[value] +
									". Please create a file and set it's default to this project, or select a file to be the default for this project."
								new Notice(noticeMsg, 0)
							}
							await this.plugin.saveSettings()
							this.display();
						})
				)
		}


		containerEl.createEl('hr');
		//allow set before first sync
		new Setting(containerEl)
			.setName('Tag Behavior')
			.setDesc('Determine how Tags will be handled.')
			.addDropdown(component =>
				component
					.addOptions(tagAndOr)
					.setValue(this.plugin.settings.tagAndOr)
					.onChange((value) => {
						this.plugin.settings.tagAndOr = value;
						this.plugin.saveSettings();
						this.display();
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
						this.display();
						}, 1000);
				})
			)
		const explanationText = containerEl.createEl('p', { text: 'Project/Tag selection result.' });
		explanationText.innerHTML = this.getProjectTagText(myProjectsOptions);

		new Setting(containerEl)
			.setName('Keep project folders')
			.setDesc('Use the TickTick project folders in the Vault. Otherwise, keep everything in the default folder.')
			.addToggle(component =>
				component
					.setValue(this.plugin.settings.keepProjectFolders)
					.onChange(async (value) => {
						this.plugin.settings.keepProjectFolders = value
						await this.plugin.saveSettings()
					})
			)

		containerEl.createEl('hr');
		new Setting(containerEl)
			.setName('Automatic sync interval time')
			.setDesc('Please specify the desired interval time, with seconds as the default unit. The default setting is 300 seconds, which corresponds to syncing once every 5 minutes. You can customize it, but it cannot be lower than 20 seconds.')
			.addText((text) =>
				text
					.setPlaceholder('Sync interval')
					.setValue(this.plugin.settings.automaticSynchronizationInterval.toString())
					.onChange(async (value) => {
						const intervalNum = Number(value)
						if (isNaN(intervalNum)) {
							new Notice(`Wrong type,please enter a number.`)
							return
						}
						if (intervalNum < 20) {
							new Notice(`The synchronization interval time cannot be less than 20 seconds.`)
							return
						}
						if (!Number.isInteger(intervalNum)) {
							new Notice('The synchronization interval must be an integer.');
							return;
						}
						this.plugin.settings.automaticSynchronizationInterval = intervalNum;
						await this.plugin.saveSettings()
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
							this.display();
						} else {
							this.plugin.settings.enableFullVaultSync = value
							await this.plugin.saveSettings()
							new Notice("Full vault sync is disabled.")
						}
					})
			)


		if (this.plugin.settings.apiInitialized) {
			containerEl.createEl('hr');
			containerEl.createEl('h1', { text: 'Manual operations' });

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
		}


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
		if (this.plugin.settings.apiInitialized) {
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
	}

	private async confirmFullSync() {
		const myModal = new ConfirmFullSyncModal(this.app, (result) => {
			this.ret = result;
		});
		const bConfirmation =  await myModal.showModal();

		return bConfirmation;
	}


	private async checkDataBase() {
		// Add code here to handle exporting TickTick data
		if (!this.plugin.settings.apiInitialized) {
			new Notice(`Please log in from settings first`)
			return
		}

		//reinstall plugin


		//check file metadata
		console.log('checking file metadata')

		let fileNum = await this.plugin.cacheOperation?.checkFileMetadata()
		console.log("Number of files: ", fileNum)
		if (fileNum < 1) //nothing? really?
		{
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
						taskObject = await this.plugin.tickTickRestAPI?.getTaskById(taskDetails.taskId, null);
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

	private addFolderOptions(container: HTMLElement): void {
		let folderSearch: SearchComponent | undefined;
		new Setting(container)
			.setName("Default folder location")
			.setDesc("Vault folder to be used for TickTick Tasks.")
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
					const updatedFolder = await  this.validateNewFolder(newFolder);
					if (this.plugin.settings.debugMode)
					{
						console.log('updated folder: ', updatedFolder);
					}
					if (updatedFolder) {
						folderSearch?.setValue(updatedFolder)
						this.plugin.settings.TickTickTasksFilePath = updatedFolder
						await this.plugin.saveSettings();
					}

					this.display();
				});
			});
	}

	private async validateNewFolder(newFolder: string | undefined) {
		if (newFolder && (newFolder.length > 1) && (/^[/\\]/.test(newFolder))) {
			newFolder = newFolder.substring(1);
		}
		let newFolderFile = this.app.vault.getAbstractFileByPath(newFolder);
		if (!newFolderFile) {
			//it doesn't exist, create it and return it's path.
			try {
				newFolderFile = await this.app.vault.createFolder(newFolder);
				new Notice(`New folder ${newFolderFile.path} created.`)
				return newFolderFile?.path;
			} catch (error) {
				new Notice(`Folder ${newFolder} creation failed: ${error}. Please correct and try again.`, 0)
				return null;
			}
		} else {
			if (newFolderFile instanceof TFolder) {
				//they picked right, and the folder exists.
				new Notice(`Default folder is now ${newFolderFile.path}.`)
				return newFolderFile.path
			}
		}


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
		if (taskAndOr == 1 ) {
			return "Only tasks in <b>" + project + "</b> AND tagged with <b>#" + tag + "</b> tag will be synchronized"
		}
		
		return "All tasks in <b>" + project + "</b> will be synchronized. All tasks tagged with <b>#" + tag + "</b> tag will be synchronized"
	}
}

