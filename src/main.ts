import '@/static/index.css';
import '@/static/styles.css';

import { type Editor, type MarkdownFileInfo } from 'obsidian';
import { MarkdownView, Notice, Plugin, TFolder } from 'obsidian';

//settings
import {
	DEFAULT_SETTINGS,
	getSettings,
	updateSettings
} from './settings';

import { TickTickService } from '@/services';
//TickTick api
import { TickTickRestAPI } from '@/services/TicktickRestAPI';
//task parser
import { TaskParser } from './taskParser';
//cache task read and write
//file operation
import { FileOperation } from './fileOperation';

//import modals
import { SetDefaultProjectForFileModal } from './modals/DefaultProjectModal';
import { LatestChangesModal } from './modals/LatestChangesModal';

//import utils
import { isOlder } from './utils/version';
import { TickTickSyncSettingTab } from './ui/settings';
import { MarkdownProcessor } from '@/query/MarkdownProcessor';
import store from '@/store';
import { DateMan } from '@/dateMan';
import { NewFileMap } from '@/services/NewFileMap';

//logging
import log from '@/utils/logger';

//database
import { syncTickTickWithDexie } from '@/sync/sync';
import { initDB } from '@/db/dexie';
import { migrateFromDataJson } from '@/db/migrations';

//tasks
import type { ITask } from '@/api/types/Task';
import { getTasksByLabel, upsertLocalTask } from '@/db/tasks';

//NEW: Repository layer
import { FileMetadataService } from '@/repositories/FileMetadataService';
import { TaskRepository } from '@/repositories/TaskRepository';
import { FileTaskQueries } from '@/repositories/FileTaskQueries';
import { TaskCache } from '@/repositories/TaskCache';
import { ProjectGroupRepository } from '@/repositories/ProjectGroupRepository';

//NEW: Service layer
import { ProjectSyncService } from '@/services/ProjectSyncService';
import { EventHandlerService } from '@/services/EventHandlerService';
import { VaultSyncCoordinator } from '@/services/VaultSyncCoordinator';
import { TaskModificationDetector } from '@/services/TaskModificationDetector';
import { TaskDeletionHandler } from '@/services/TaskDeletionHandler';
import { TaskOperationsService } from '@/services/TaskOperationsService';
import { FolderSyncService } from '@/services/FolderSyncService';
import { FolderMigrationService } from '@/services/FolderMigrationService';

import {getTasksWithChildren} from '@/FuckAboutParse';
import { generateDeviceId } from '@/db/device';


export default class TickTickSync extends Plugin {

	readonly service: TickTickService = new TickTickService(this);
	readonly taskParser: TaskParser = new TaskParser(this.app, this);
	readonly fileOperation: FileOperation = new FileOperation(this.app, this);
	readonly fileMetadataService: FileMetadataService = new FileMetadataService(this.app, this);
	readonly dateMan: DateMan = new DateMan();

	readonly lastLines: Map<string, number> = new Map(); //lastLine object {path:line} is saved in lastLines map

	//NEW: Repository layer
	taskRepository!: TaskRepository;
	fileTaskQueries!: FileTaskQueries;
	taskCache!: TaskCache;
	projectGroupRepository!: ProjectGroupRepository;

	//NEW: Service layer
	projectSyncService!: ProjectSyncService;
	eventHandlerService!: EventHandlerService;
	vaultSyncCoordinator!: VaultSyncCoordinator;
	taskModificationDetector!: TaskModificationDetector;
	taskDeletionHandler!: TaskDeletionHandler;
	taskOperationsService!: TaskOperationsService;
	folderSyncService!: FolderSyncService;
	folderMigrationService!: FolderMigrationService;

	tickTickRestAPI?: TickTickRestAPI;
	statusBar?: HTMLElement;
	private syncIntervalId?: number;
	private logger: any;

	private markdownProcessor?: MarkdownProcessor;

	async onload() {
		//We're doing too much at load time, and it's causing issues. Do it properly!

		this.app.workspace.onLayoutReady(async () => {
			//todo: detect end of sync and/or make sure there's not conflict somehow.
			// log.debug(`TickTickSync onload pausing for 60 seconds to allow for sync to complete!`);
			// await waitFor(60000)
			await this.pluginLoad();
		});

	}

	reloadInterval() {
		if (this.syncIntervalId) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = undefined;
		}
		const timeout = getSettings().automaticSynchronizationInterval * 1000;
		if (timeout === 0) {
			return;
		}
		this.syncIntervalId = window.setInterval(this.scheduledSynchronization.bind(this), timeout);
	}

	// Configure logging.
	// reloadLogging() {
	// 	const options: LogOptions = {
	// 		minLevels: {
	// 			'': getSettings().logLevel,
	// 			ticktick: getSettings().logLevel
	// 		}
	// 	};
	// 	logging.configure(options);
	// }

	async onunload() {
		super.onunload();
		if (this.syncIntervalId) {
			window.clearInterval(this.syncIntervalId);
		}
		//NEW: Cleanup event handler
		this.eventHandlerService?.cleanup();
		//NEW: Clear cache
		this.taskCache?.clear();
		log.debug(`TickTickSync unloaded!`);
	}

	async loadSettings() {
		try {
			let data = await this.loadData();
			try {
				data = await this.migrateData(data);
			} catch (error) {
				log.error('Failed to migrate data:', error);
				return false; // Returning false indicates that the setting loading failed
			}
			if (data?.TickTickTasksData) {
				// Old data migration is handled by initDB
			}
			const settings = Object.assign({}, DEFAULT_SETTINGS, data);
			updateSettings(settings);
		} catch (error) {
			log.error(`Failed to load data:( ${error})`);
			return false; // Returning false indicates that the setting loading failed
		}
		return true; // Returning true indicates that the settings are loaded successfully
	}

	async saveSettings() {
		try {
			const inMemorySettings = getSettings();
			// Verify that the setting exists and is not empty
			if (inMemorySettings && Object.keys(inMemorySettings).length > 0) {
				const settingsToSave = { ...inMemorySettings };
				// Large data is now in Dexie only
				delete (settingsToSave as any).fileMetadata;
				delete (settingsToSave as any).TickTickTasksData;
				delete (settingsToSave as any).__migratedDBData;

				await this.saveData(settingsToSave);
			} else {
				log.warn('Settings are empty or invalid, not saving to avoid data loss.');
			}
		} catch (error) {
			//Print or handle errors
			log.error('Error saving settings:', error);
		}
	}

	// return true of false
	async initializePlugin(): Promise<boolean> {
		if (!getSettings().token) {
			new Notice(`Please login from settings.`);
			return false;
		}

		// Load Dexie first as it's the source of truth
		await initDB();

		//NEW: Initialize repositories
		this.taskRepository = new TaskRepository();
		this.fileTaskQueries = new FileTaskQueries();
		this.taskCache = new TaskCache();
		this.projectGroupRepository = new ProjectGroupRepository();

		//NEW: Initialize services
		this.projectSyncService = new ProjectSyncService(this.app, this);
		this.folderSyncService = new FolderSyncService(this.app, this, this.projectGroupRepository);
		this.folderMigrationService = new FolderMigrationService(this.app, this.folderSyncService);
		this.vaultSyncCoordinator = new VaultSyncCoordinator(this.app, this, this.folderSyncService);
		this.taskModificationDetector = new TaskModificationDetector(this.app, this, this.folderSyncService);
		this.taskDeletionHandler = new TaskDeletionHandler(this.app, this);
		this.taskOperationsService = new TaskOperationsService(this.app, this);

		// Device ID and Label are now managed in the DB and loaded into memory during initDB
		// They are no longer stored in settings to prevent sync conflicts
		const isProjectsSaved = await this.saveProjectsToCache();
		if (!isProjectsSaved) {// invalid token or offline?
			this.tickTickRestAPI = undefined;
			new Notice(`TickTickSync plugin initialization failed, please check userID and password in settings.`);
			return false;
		}

		this.initializeModuleClass();
		//Create a backup folder to back up TickTick data
		try {
			//Back up all data before each startup
			if (!getSettings().skipBackup) {
				this.service.backup();
			}
		} catch (error) {
			log.error('error creating user data folder: ', error);
			new Notice(`error creating user data folder`);
			return false;
		}
		//And now load the DB and sync it.
		await this.service.synchronization(true);

		new Notice('TickTickSync loaded successfully.' + getSettings().skipBackup ? ' Skipping backup.' : 'TickTick data has been backed up.');
		return true;
	}

	initializeModuleClass() {
		// log.debug("initializeModuleClass")
		//initialize TickTick restapi
		if (!this.tickTickRestAPI) {
			// log.debug("API wasn't inited?")
			this.tickTickRestAPI = new TickTickRestAPI(this.app, this, null);
		}
	}

	async lineNumberCheck(): Promise<boolean> {
		const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markDownView) {
			return false;
		}

		const cursor = markDownView?.editor.getCursor();
		const line = cursor?.line;
		//const lineText = view.editor.getLine(line)
		const fileContent = markDownView.data;

		//log.debug(line)
		//const fileName = view.file?.name
		const file = markDownView?.app.workspace.activeEditor?.file;
		const fileName = file?.name;
		const filepath = file?.path;

		if (typeof this.lastLines === 'undefined' || typeof this.lastLines.get(fileName as string) === 'undefined') {
			this.lastLines.set(fileName as string, line as number);
			return false;
		}

		//log.debug(`filename is ${fileName}`)
		if (this.lastLines.has(fileName as string) && line !== this.lastLines.get(fileName as string)) {
			const lastLine = this.lastLines.get(fileName as string);
			// if (this.settings.debugMode) {
			// 	log.debug('Line changed!', `current line is ${line}`, `last line is ${lastLine}`);
			// }

			//Perform the operation you want
			const lastLineText = markDownView.editor.getLine(lastLine as number);
			// log.debug(lastLineText)
			if (!(this.checkModuleClass())) {
				return false;
			}
			this.lastLines.set(fileName as string, line as number);

			return await this.service.lineModifiedTaskCheck(filepath as string, lastLineText, lastLine as number);
		} else {
			//log.debug('Line not changed');
		}
		return false;
	}

	async checkboxEventhandler(evt: MouseEvent, editor: Editor) {
		const target = evt.target as HTMLInputElement;
		const bOpenTask = target.checked;

		if (!target.classList.contains('task-list-item-checkbox')) {
			return;
		}

		if (editor) {
			const mouse = editor.posAtMouse(evt);
			const line = mouse.line; // Line where the click occurred
			const clickedText = editor.getLine(line); // Get the text at the clicked line
			if (this.taskParser.isMarkdownTask(clickedText)) {
				const taskId = this.taskParser.getTickTickId(clickedText);
				if (taskId) {
					if (bOpenTask) {
						await this.service.closeTask(taskId);
					} else {
						await this.service.openTask(taskId);
					}
				} else {
					const itemID = this.taskParser.getLineItemId(clickedText);
					if (itemID) {
						const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
						if (markDownView?.file) {
							const fileMap = new NewFileMap(this.app, this, markDownView.file);
							await fileMap.init();
							await this.service.tickTickSync.handleTaskItem(clickedText, fileMap, line);
						}
					}
				}
			}
		}
	}


	//return true
	checkModuleClass() {
		if (!getSettings().token) {
			new Notice(`Please login from settings.`);
			return false;
		}

		if (!this.service.initialized) {
			this.service.initialize();
		}
		if (this.tickTickRestAPI === undefined) {
			this.initializeModuleClass();
		}
		return true;
	}

	async setStatusBarText() {
		const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markDownView || !markDownView.file) {
			this.statusBar?.setText('');
			return;
		}

		const filepath = markDownView.file.path;
		let defaultProjectName = await this.fileMetadataService.getDefaultProjectNameForFilepath(filepath);
		if (!defaultProjectName) {
			if (filepath.startsWith('Inbox')) {
				defaultProjectName = 'Inbox';
			} else {
				defaultProjectName = 'No default Project';
			}
		}
		this.statusBar?.setText(defaultProjectName);

	}

	async scheduledSynchronization(fullSync: boolean = false) {
		if (!this.checkModuleClass()) {
			return;
		}



		try {
			await this.service.synchronization(fullSync);
		} catch (error) {
			log.error('An error occurred: ', error);
			new Notice(`An error occurred: ${error}`);
		}


	}


	// async oldCheckboxEventhandle(evt: MouseEvent) {
	// 	if (!(this.checkModuleClass())) {
	// 		return;
	// 	}
	//
	//
	// 	const target = evt.target as HTMLInputElement;
	// 	const bOpenTask = target.checked;
	// 	log.debug('Second: Checked: ', bOpenTask);
	//
	// 	//This breaks for subtasks if Tasks is installed. See: https://github.com/obsidian-tasks-group/obsidian-tasks/discussions/2685
	// 	//hence the else.
	// 	const taskElement = target.closest('div');
	// 	if (taskElement) {
	// 		const taskLine = taskElement.textContent;
	// 		const taskId = this.taskParser?.getTickTickId(taskLine);
	// 		if (taskId) {
	// 			// let task = this.taskParser?.convertTextToTickTickTaskObject(tas)
	// 			if (bOpenTask) {
	// 				log.debug('it\'s open, close it.');
	// 				this.tickTickSync?.closeTask(taskId);
	// 			} else {
	// 				log.debug('it\'s closed, open it.');
	// 				this.tickTickSync?.reopenTask(taskId);
	// 			}
	// 		}
	// 	} else {
	// 		log.debug('#### TickTick_id not found -- do it the hard way.');
	// 		//Start full-text search and check status updates
	// 		try {
	// 			log.debug('#### Full text modified??');
	// 			let file = this.app.workspace.getActiveFile();
	// 			let filePath = null;
	// 			if (file instanceof TFile) {
	// 				filePath = file.path;
	// 			}
	//
	// 			if (!await this.checkAndHandleSyncLock()) return;
	// 			await this.tickTickSync?.fullTextModifiedTaskCheck(filePath);
	// 			await this.unlockSynclock();
	// 		} catch (error) {
	// 			log.error(`An error occurred while check modified tasks in the file: ${error}`);
	// 			await this.unlockSynclock();
	//
	// 		}
	// 	}
	// }

	async saveProjectsToCache(): Promise<boolean> {
		if (!this.checkModuleClass()) {
			return false;
		}
		let result = false;
		const startTime = performance.now();
		log.debug(`TickTick saveProjectsToCache started at ${new Date().toLocaleString()}`);
		try {
			result = await this.service.saveProjectsToCache();
		} catch (error) {
			log.error(`An error in saveProjectsToCache occurred:( ${error}`);
			new Notice(`An error in saveProjectsToCache occurred: ${error}`);
		}
		const endTime = performance.now();
		log.debug(`TickTick saveProjectsToCache completed at ${new Date().toLocaleString()}, took ${(endTime - startTime).toFixed(2)} ms`);
		return result;
	}

	private async pluginLoad() {
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TickTickSyncSettingTab(this.app, this));

		const isSettingsLoaded = await this.loadSettings();
		if (!isSettingsLoaded) {
			new Notice('Settings failed to load. Please reload the TickTickSync plugin.');
			return;
		}
		log.setLevel(getSettings().logLevel)
		log.info(`loading plugin "${this.manifest.name}" v${this.manifest.version}`);



		try {
			updateSettings({vaultName: this.app.vault.getName()});
			await this.initializePlugin();
		} catch (error) {
			log.error(`API Initialization Failed.( ${error})`);
		}

		store.service.set(this.service);
		this.markdownProcessor = new MarkdownProcessor(this);
		this.markdownProcessor.activate();


		const ribbonIconEl = this.addRibbonIcon('sync', 'TickTickSync', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			await this.synchronizeNow();
		});

		//Used for testing adhoc code.
		const ribbonIconEl1 = this.addRibbonIcon('check', 'TTS Test', async (evt: MouseEvent) => {
			// Nothing to see here right now.
			const vaultId = this.app.vault.getName();
			log.debug(`Vault ID: ${vaultId}`);
			this.dumpDB();
		});

		//Used for testing adhoc code.
		const ribbonIconEl2 = this.addRibbonIcon('dice', 'TTS Test 2', async (evt: MouseEvent) => {
			// Nothing to see here right now.
			// for (const file of this.app.vault.getMarkdownFiles()) {
			// 	if (file.path.includes("List 1")) {
			// 		const fileMap = new NewFileMap(this.app, this, file);
			// 		await fileMap.init();
			// 		const taskRecord = fileMap.getTaskRecord("6a08733c9086963234d145a5")
			// 		const taskItems = fileMap.getTaskItems("6a08733c9086963234d145a5")
			// 		log.debug("record", taskRecord)
			// 		log.debug("items", taskItems)
			// 	}
			// }
			// Example Usage inside a command or event:
			// const targetFolder = 'Folder 1';
			//
			// // Get every file in the vault and filter by path prefix
			// const allFilesInFolder = this.app.vault.getFiles().filter(file =>
			// 	file.path.startsWith(targetFolder + '/')
			// );
			//
			// for (const file of allFilesInFolder) {
			// 	const activeFile = this.app.vault.getFileByPath(file)
			// 	const tasks = await getTasksWithChildren(activeFile, this.app);
			// 	// const fm = new NewFileMap(this.app, this, activeFile);
			// 	// await fm.init();
			// 	// const tasks = fm.getTasks();
			//
			// 	log.debug("In File: ", file.name, "\nStructured Tasks:\n", JSON.stringify(tasks,null, 4));
			// }
			generateDeviceId();


		});


		this.registerEvents();
		this.reloadInterval();

		// set default project for TickTick task in the current file
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'tts-default-project-for-file',
			name: 'Set default TickTick project for current file',
			editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!view || !view.file) {
					new Notice(`No active file.`);
					return;
				}
				const filepath = view.file.path;
				new SetDefaultProjectForFileModal(this.app, this, filepath);
			}
		});
		this.addCommand({
			id: 'tts-sync',
			name: 'Synchronize',
			callback: async () => {
				await this.synchronizeNow();
			}
		});


		//display default project for the current file on status bar
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBar = this.addStatusBarItem();
	}

	private async synchronizeNow() {
		await this.scheduledSynchronization();
		new Notice(`Sync completed..`);
	}

	private registerEvents() {
		//NEW: Use EventHandlerService to manage all event registration
		this.eventHandlerService = new EventHandlerService(this.app, this);
		this.eventHandlerService.registerAll();
	}

	private async migrateData(data: any) {
		if (!data) return data;

		const notableChanges: string [][] = [];
		//TODO make more clean
		//We're going to handle data structure conversions here.
		// Legacy migration for old fileMetadata structure is no longer needed 
		// as we have moved everything to Dexie.
		
		if ((!data.version) || (isOlder(data.version, '1.0.10'))) {
			//get rid of username and password. we don't need them no more.
			//delete data.username;
			// @ts-ignore
			delete data.username;
			delete data.password;
		}
		if ((!data.version) || (isOlder(data.version, '1.0.36'))) {
			//default to AND because that's what we used to do:
			data.tagAndOr = 1;
			//warn about tag changes.
			notableChanges.push(['New Task Limiting rules', 'Please update your preferences in settings as needed.', 'priorTo1.0.36']);
		}
		if ((!data.version) || (isOlder(data.version, '1.0.40'))) {
			//warn about the date/time foo
			notableChanges.push(['New Date/Time Handling', 'Old date formats will be converted on the next synchronization operation.', 'priorTo1.0.40']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.1'))) {
			//warn about the date/time foo
			notableChanges.push(['Note Synchronization', 'TickTickSync will now synchronize Notes.', 'priorTo1.1.1']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.7'))) {
			notableChanges.push(['Note and Default Project Settings', 'Note and Default Project settings improvements.', 'priorTo1.1.7']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.8'))) {
			notableChanges.push(['Link to Tasks now Configurable', 'Link to Tasks are now Configurable.', 'priorTo1.1.8']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.10'))) {
			notableChanges.push(['Several Changes', 'Tasks stay where they are created.\nBackups now configurable.\nNote delimiter now configurable.', 'priorTo1.1.9']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.15'))) {
			notableChanges.push(['Can now login with SSO/2FA enabled account on Desktop', 'Desktop SSO/2FA login enabled.', 'priorTo1.1.14']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.16'))) {
			notableChanges.push(['Note handling improvements', 'Can now have checklist items and TickTick Task links in notes.', 'priorTo1.1.15']);
		}
		if ((!data.version) || (isOlder(data.version, '1.1.17'))) {
			// Migrate from legacy data.json repository to Dexie-based repository
			const dbData = migrateFromDataJson(data);
			(data as any).__migratedDBData = dbData;
			notableChanges.push(['version 2.0', 'A complete re-architecture to allow better cross-device handling. General performance improvements..', 'priorTo1.1.17']);
		}

		if (notableChanges.length > 0) {
			await this.LatestChangesModal(notableChanges);
		}

		//Update the version number. It will save me headaches later.

		if ((!data.version) || (isOlder(data.version, this.manifest.version))) {
			log.debug('Updating version number to ', this.manifest.version);
			data.version = this.manifest.version;
			await this.saveSettings();
		}

		return data;
	}

	private async LatestChangesModal(notableChanges: string[][]) {
		const myModal = new LatestChangesModal(this.app, notableChanges, (result) => {
			this.ret = result;
		});
		return await myModal.showModal();

	}
	private dumpDB() {
		let dbName = getSettings().vaultName  + "TickTickSync";
		const request = indexedDB.open(dbName);

		request.onsuccess = async (event) => {
			const db = event.target.result;
			const storeNames = Array.from(db.objectStoreNames);
			const exportData = {};

			// Process all stores
			for (const storeName of storeNames) {
				exportData[storeName] = await new Promise((resolve) => {
					const transaction = db.transaction([storeName], "readonly");
					const store = transaction.objectStore(storeName);
					const allItems = store.getAll();

					allItems.onsuccess = () => resolve(allItems.result);
					allItems.onerror = () => resolve([]); // Handle empty/error stores
				});
			}

			// Create and download JSON file
			const jsonString = JSON.stringify(exportData, null, 2);
			const blob = new Blob([jsonString], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");

			a.href = url;
			a.download = `${dbName}_full_dump.json`;
			a.click();

			URL.revokeObjectURL(url);
			log.debug(`Exported ${storeNames.length} stores to ${dbName}_full_dump.json`);
			db.close();
		};

		request.onerror = (e) => console.error("Database failed to open:", e.target.error);

	}


}




