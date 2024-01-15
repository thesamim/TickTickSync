import {App, Notice, PluginSettingTab, SearchComponent, Setting, TAbstractFile, TFolder} from 'obsidian';
import TickTickSync from "../main";
import {ConfirmFullSyncModal} from "./ConfirmFullSyncModal"
import {BrowserWindow, session} from "@electron/remote";
import {FolderSuggest} from "./FolderSuggester";


export interface TickTickSyncSettings {
	SyncProject: any;
	SyncTag: any;
	baseURL: string;
	initialized: boolean;
	apiInitialized: boolean;
	defaultProjectName: string;
	defaultProjectId: string;
	TickTickTasksFilePath: string;
	automaticSynchronizationInterval: Number;
	TickTickTasksData: any;
	fileMetadata: any;
	enableFullVaultSync: boolean;
	statistics: any;
	debugMode: boolean;
	token:string;
}


export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	initialized: false,
	apiInitialized: false,
	defaultProjectName: "Inbox",
	automaticSynchronizationInterval: 300, //default aync interval 300s
	TickTickTasksData: {"projects": [], "tasks": []},
	fileMetadata: {},
	enableFullVaultSync: false,
	statistics: {},
	debugMode: false,
	TickTickTasksFilePath: "/"

}


export class TickTickSyncSettingTab extends PluginSettingTab {
	plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings'});

		const myProjectsOptions: Record<string, string> | undefined = this.plugin.settings.TickTickTasksData?.projects?.reduce((obj, item) => {
			try {
				obj[(item.id).toString()] = item.name;
				return obj;
			} catch {
				obj[0] = "load fail"
				return obj;
			}
		}, {});
		const providerOptions: Record<string, string> = {"1": "ticktick.com", "2": "dida365.com"}
		const currentVal = Object.keys(providerOptions).find(key => providerOptions[key] === this.plugin.settings.baseURL)

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Access Control'});


		new Setting(containerEl)
			.setName("TickTick/Dida")
			.setDesc("Select home server")
			.setHeading()
			.addDropdown(component =>
				component
					.addOptions(providerOptions)
					.setValue(currentVal)
					.onChange(async (value: string) => {
						this.plugin.settings.baseURL = providerOptions[value]
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Login")
			.setDesc("Please login here.")
			.setHeading()
			.addButton(loginBtn => {
				loginBtn.setClass('ts_login_button');
				loginBtn.setButtonText("Login");
				loginBtn.setTooltip("Click To Login")
				loginBtn.onClick(() => {
					const url = `https://${this.plugin.settings.baseURL}/signin`;

					this.loadLoginWindow(url).then(async (token: string) => {
						if (token) {
							console.log("Going to Initialize")
							this.plugin.settings.token = token;
							await this.plugin.initializePlugin()
						}
					});
					this.display()

				});
			});

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: 'Sync control'});
		this.add_default_folder_path();

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
						await this.plugin.saveSettings()


					})
			)
		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'Limit synchronization'});
		new Setting(containerEl)
			.setDesc("To limit the tasks TickTickSync will synchronize from TickTick to " +
				"Obsidian select a tag or project(list) below. If a tag is entered, only tasks with that tag will be " +
				"synchronized. If a project(list) is selected, only tasks in that project will be synchronized. If " +
				"both are chosen on tasks with that tag in that project will be synchronized.")

		new Setting(containerEl)
			.setName('Project')
			.setDesc('Only tasks in this project will be synchronized.')
			.addDropdown(component =>
				component
					.addOption("", "")
					.addOptions(myProjectsOptions)
					.setValue(this.plugin.settings.SyncProject)
					.onChange(async (value) => {
						console.log("chose: " ,value)
						this.plugin.settings.SyncProject = value;
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Tag')
			.setDesc('Tag value, no "#"')
			.addText(text => text
				.setValue(this.plugin.settings.SyncTag)
				.onChange(async (value) => {
					this.plugin.settings.SyncTag = value;
					await this.plugin.saveSettings();
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
						this.plugin.saveSettings()
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
						new Notice(`Please set the TickTick api first`)
						return
					}
					try {
						await this.plugin.scheduledSynchronization()
						this.plugin.syncLock = false
						new Notice(`Sync completed..`)
					} catch (error) {
						new Notice(`An error occurred while syncing.:${error}`)
						this.plugin.syncLock = false
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
			.setName('Debug mode')
			.setDesc('After enabling this option, all log information will be output to the console, which can help check for errors.')
			.addToggle(component =>
				component
					.setValue(this.plugin.settings.debugMode)
					.onChange((value) => {
						this.plugin.settings.debugMode = value
						this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Backup TickTick data')
			.setDesc('Click to backup TickTick data, The backed-up files will be stored in the root directory of the Obsidian vault.')
			.addButton(button => button
				.setButtonText('Backup')
				.onClick(() => {
					// Add code here to handle exporting TickTick data
					if (!this.plugin.settings.apiInitialized) {
						new Notice(`Please set the TickTick api first`)
						return
					}
					this.plugin.tickTickSync.backupTickTickAllResources()
				})
			);
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
			new Notice(`Please set the TickTick credentials first`)
			return
		}

		//reinstall plugin


		//check file metadata
		// console.log('checking file metadata')
		let fileNum = await this.plugin.cacheOperation?.checkFileMetadata()
		// console.log("Number of files: ", fileNum)

		if (fileNum < 1) //nothing? really?
		{
			const allMDFiles = this.app.vault.getMarkdownFiles();
			allMDFiles.forEach(file => {
				// console.log("File: ", file);
				this.plugin.tickTickSync?.fullTextModifiedTaskCheck(file.path)
			});
		}
		this.plugin.saveSettings()
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


		// console.log('checking renamed files')
		try {
			//check renamed files
			for (const key in metadatas) {
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
						console.log(`Task ${taskDetail.id}: ${taskDetail.title} is not found.`)
						continue
					}
					const oldTitle = taskObject?.title ?? '';
					if (!oldTitle.includes(obsidianURL)) {
						// console.log('Preparing to update description.')
						// console.log(oldContent)
						// console.log(newContent)
						try {
							await this.plugin.tickTickSync.updateTaskContent(key)
						} catch (error) {
							console.error(`An error occurred while updating task discription: ${error.message}`);
						}

					}

				}
				;

			}

			//check empty file metadata

			//check calendar format


			//check omitted tasks
			console.log('checking unsynced tasks')
			const files = this.app.vault.getFiles()
			for (const v of files) {
				const i = files.indexOf(v);
				if (v.extension == "md") {
					try {
						//console.log(`Scanning file ${v.path}`)
						await this.plugin.fileOperation.addTickTickLinkToFile(v.path)
						if (this.plugin.settings.enableFullVaultSync) {
							await this.plugin.fileOperation.addTickTickTagToFile(v.path)
						}


					} catch (error) {
						console.error(`An error occurred while check new tasks in the file: ${v.path}, ${error.message}`);

					}

				}
			}
			this.plugin.syncLock = false
			new Notice(`All files have been scanned.`)
		} catch (error) {
			console.error(`An error occurred while scanning the vault.:${error}`)
			this.plugin.syncLock = false
		}
	}

	private async loadLoginWindow(url: string) {

		return new Promise((resolve) => {
			//Get a cookie!
			const window = new BrowserWindow({ show: false,
				width: 600,
				height: 800,
				webPreferences: {
					nodeIntegration: false, // We recommend disabling nodeIntegration for security.
					contextIsolation: true, // We recommend enabling contextIsolation for security.
					// see https://github.com/electron/electron/blob/master/docs/tutorial/security.md
				},
			});
			window.loadURL(url);
			window.once('ready-to-show', () => {
				window.show()
			})

			let token = "";
			window.on('closed', () => {
				const domain = "." + this.plugin.settings.baseURL
				session.defaultSession.cookies.get({domain: domain, name: "t"})
					.then((cookies) => {
						token = cookies[0].value
						console.log(domain, token)
						window.destroy();
						resolve(token);
					}).catch((error) => {
					console.error(error)
				})

			});
		});

	}


	add_default_folder_path(): void {
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
					let new_folder = folderSearch?.getValue();
					const updatedFolder = await  this.validateNewFolder(new_folder);
					if (new_folder) {
						folderSearch?.setValue(new_folder)
						this.plugin.settings.TickTickTasksFilePath = new_folder
						await this.plugin.saveSettings();
					}

					this.display();
				});
			});;
	}

	private async validateNewFolder(new_folder: string | undefined) {
		if (new_folder && (new_folder.length > 1) && (/^[/\\]/.test(new_folder))) {
			new_folder = new_folder.substring(1);
		}
		let newFolderFile = this.app.vault.getAbstractFileByPath(new_folder);
		if (!newFolderFile) {
			//it doesn't exist, create it and return it's path.
			try {
				newFolderFile = await this.app.vault.createFolder(new_folder);
				new Notice(`New folder ${newFolderFile.path} created.`)
				return newFolderFile?.path;
			} catch (error) {
				new Notice(`Folder ${new_folder} creation failed: ${error}. Please correct and try again.`, 0)
				return null;
			}
		} else {
			console.log(typeof newFolderFile)
			if (newFolderFile instanceof TFolder) {
				//they picked right, and the folder exists.
				new Notice(`Default folder is now ${newFolderFile.path}.`)
				return newFolderFile.path
			}
		}


	}
}

