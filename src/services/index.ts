import TickTickSync from "@/main";
import {Tick} from "@/api";
import {getSettings} from "@/settings";
import {doWithLock} from "@/utils/locks";
import {SyncMan} from "@/syncModule";
import {Notice} from "obsidian";
import {CacheOperation} from "@/cacheOperation";
import {FileOperation} from "@/fileOperation";

const LOCK_TASKS = 'LOCK_TASKS';

//TODO: encapsulate all api and cache
export class TickTickService {

	initialized: boolean = false;
	plugin: TickTickSync;
	tickTickSync?: SyncMan;
	api?: Tick;
	cacheOperation?: CacheOperation;
	fileOperation?: FileOperation;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	initialize(): boolean {
		try {
			const token = getSettings().token;
			if (!token) {
				console.log("Please login from settings.");
				return false;
			}
			this.api = new Tick({
				baseUrl: getSettings().baseURL,
				token: token,
				checkPoint: getSettings().checkPoint
			});
			//initialize data read and write object
			this.cacheOperation = new CacheOperation(this.plugin.app, this.plugin);
			//initialize file operation
			this.fileOperation = new FileOperation(this.plugin.app, this.plugin);
			this.tickTickSync = new SyncMan(this.plugin.app, this.plugin);
			this.initialized = true;
			return true;
		} catch (error) {
			console.info('Error on initialization:', error);
		}
		return false;
	}

	//MB can be static
	async login(baseUrl: string, username: string, password: string):
		Promise<{ inboxId: string; token: string } | null> {
		try {
			const api = new Tick({
				username: username,
				password: password,
				baseUrl: baseUrl,
				token: "",
				checkPoint: 0
			});
			//try login
			return await api.login();
		} catch (error) {
			console.error(error);
		}
		return null;
	}

	async synchronization() {
		try {
			await doWithLock(LOCK_TASKS, async () => {
				await this.syncTickTickToObsidian();
			});
			await this.syncFiles();
		} catch (error) {
			console.info('Error on synchronization:', error);
		}
	}

	private async syncTickTickToObsidian(){
		const result = await this.tickTickSync?.syncTickTickToObsidian();
		if (!result) { //MB find other way to check for success.
			throw new Error("syncTickTickToObsidian failed");
		}
	}

	private async syncFiles(){
		const filesToSync = this.plugin.settings.fileMetadata;
		let newFilesToSync = filesToSync;
		//If one project is to be synced, don't look at it's other files.

		if (this.plugin.settings.SyncProject) {
			newFilesToSync = Object.fromEntries(Object.entries(filesToSync).filter(([key, value]) =>
				value.defaultProjectId == this.plugin.settings.SyncProject));
		}

		//Check for duplicates before we do anything
		try {
			const result = this.cacheOperation?.checkForDuplicates(newFilesToSync);
			if (result?.duplicates && (JSON.stringify(result.duplicates) != "{}")) {
				let dupText = '';
				for (let duplicatesKey in result.duplicates) {
					dupText += "Task: " + duplicatesKey + '\nin files: \n';
					result.duplicates[duplicatesKey].forEach(file => {
						dupText += file + "\n"
					})
				}
				const msg =
					"Found duplicates in MetaData.\n\n" +
					`${dupText}` +
					"\nPlease fix manually. This causes unpredictable results" +
					"\nPlease open an issue in the TickTickSync repository if you continue to see this issue." +
					"\n\nTo prevent data corruption. Sync is aborted."
				console.log("Metadata Duplicates: ", result.duplicates);
				new Notice(msg, 0);
				return;
			}


			const duplicateTasksInFiles = await this.fileOperation?.checkForDuplicates(filesToSync, result?.taskIds)
			if (duplicateTasksInFiles && (JSON.stringify(duplicateTasksInFiles) != "{}")) {
				let dupText = ""
				for (let duplicateTasksInFilesKey in duplicateTasksInFiles) {
					dupText += "Task: " + duplicateTasksInFilesKey + "\nFound in Files: \n"
					duplicateTasksInFiles[duplicateTasksInFilesKey].forEach(file => {
						dupText += file + "\n"
					})
				}
				const msg =
					"Found duplicates in Files.\n\n" +
					`${dupText}` +
					"\nPlease fix manually. This causes unpredictable results" +
					"\nPlease open an issue in the TickTickSync repository if you continue to see this issue." +
					"\n\nTo prevent data corruption. Sync is aborted."
				new Notice(msg, 0)
				return;
			}
		} catch (Error) {
			console.error(Error)
			new Notice(`Duplicate check failed:  ${Error}`, 0)
			return
		}


		//let's see if any files got killed while we weren't watching
		for (const fileKey in newFilesToSync) {
			const file = this.plugin.app.vault.getAbstractFileByPath(fileKey);
			if (!file) {
				console.log("File ", fileKey, " was deleted before last sync.");
				await this.cacheOperation?.deleteFilepathFromMetadata(fileKey);
				const toDelete = newFilesToSync.findIndex(fileKey)
				newFilesToSync.splice(toDelete, 1)
			}
		}

		//Now do the task checking.
		for (const fileKey in newFilesToSync) {
			if (this.plugin.settings.debugMode) {
				console.log(fileKey);
			}

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.fullTextNewTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in fullTextNewTaskCheck:', error);
				}
			});

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.fullTextModifiedTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in fullTextModifiedTaskCheck:', error);
				}
			});

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.deletedTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in deletedTaskCheck:', error);
				}
			});
		}
	}
}
