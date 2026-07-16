<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import { getDefaultFolder, getSettings, updateSettings } from '@/settings';
	import { Setting, TFile } from 'obsidian';
	import { FolderSuggest } from '@/utils/FolderSuggester';
	import { validateNewFolder } from '@/utils/FolderUtils';
	import log from 'loglevel';
	import { NewFileMap } from '@/services/NewFileMap';
	import { db } from '@/db/dexie';
	import type TickTickSync from '@/main';

	export let open = false;
	export let plugin: TickTickSync;
	let defaultProjectId = '';
	let currentDefault: string;
	let showUpdateWorldModal = false;
	let showUpdateButton: boolean = false;
	let showCreateText: boolean = false;
	let filesToMove: TFile[] = [];

	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	let projects: Array<{ id: string; name: string }> = [];
	let myProjectsOptions: Record<string, string> = {};

	async function ensureCorrectDefaultPaths() {
		const settings = getSettings();
		const defaultProjectFolder = getDefaultFolder();
		const defaultProject = settings.defaultProjectName;
		log.debug('Changing default Project or Project Folder \nNew default project folder: ', defaultProjectFolder, 'New default project', defaultProject);
		if (defaultProject) {
			const markdownFiles = plugin.app.vault.getMarkdownFiles();
			for (const file of markdownFiles) {
				const isDefault = await isDefaultProjectFile(file.path);
				if (isDefault) {
					let newPath: string;
					if (settings.keepProjectFolders) {
						const projectId = settings.defaultProjectId;
						if (projectId) {
							const folderPath = await plugin.folderSyncService.getFolderPathForProject(projectId);
							newPath = folderPath ? `${folderPath}/${file.name}` : file.name;
						} else {
							newPath = defaultProjectFolder ? `${defaultProjectFolder}/${file.name}` : file.name;
						}
					} else {
						newPath = defaultProjectFolder ? `${defaultProjectFolder}/${file.name}` : file.name;
					}

					if (file.path !== newPath) {
						try {
							const folderPart = newPath.substring(0, newPath.lastIndexOf('/'));
							if (folderPart) {
								await plugin.folderSyncService.ensureFolderExists(folderPart);
							}
							await plugin.app.vault.rename(file, newPath);
						} catch (error) {
							log.error(`File rename failed. ${error}`);
							alert(`File rename failed. ${error}`);
						}
					} else {
						log.debug('default project file already at correct path', newPath);
					}
				}
			}
		}
		currentDefault = getDefaultFolder() + '/' + settings.defaultProjectName;
	}

	function defaultFolder(element: HTMLElement) {
		const setting = new Setting(element)
			.addSearch((search) => {
				search.setPlaceholder('Select or Create folder')
					.setValue(getDefaultFolder());
				new FolderSuggest(search.inputEl, plugin.app);

				// OnChange: Only update the UI, DO NOT create folder here
				search.onChange((value) => {
					// Optionally update UI or hints, but do not create any folder yet
					// Optionally validate and give user feedback
					currentDefault = value + '/' + getSettings().defaultProjectName;
					showCreateText = true;
				});

				// Only create the folder if the user presses Enter
				search.inputEl.addEventListener('keydown', async (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						const value = search.inputEl.value;
						const newFolder = await validateNewFolder(plugin.app, value, 'Default');
						if (newFolder) {
							updateSettings({ TickTickTasksFilePath: newFolder });
							await ensureCorrectDefaultPaths();
							await plugin.saveSettings();
							showUpdateButton = true;
							showCreateText = false;
						}
					}
				});
			});
	}

	function getMyProjectsOptions() {
		return projects.reduce((obj, item) => {
			obj[item.id] = item.name;
			return obj;
		}, {});
	}

	async function handleDefaultProjectChange(value: string) {
		if (!value || value == '') {
			value = getSettings().inboxID;
		}
		if (value && value !== '') {
			updateSettings({ defaultProjectName: (await db.projects.get(value))?.project?.name ?? 'Unknown' });
			updateSettings({ defaultProjectId: value });
			await ensureCorrectDefaultPaths();
			await plugin.saveSettings();
		}
	}

	onMount(async () => {
		projects = await plugin.service.getProjects?.() ?? [];
		myProjectsOptions = getMyProjectsOptions();
		defaultProjectId = getSettings().defaultProjectId ?? '';
		currentDefault = getDefaultFolder() + '/' + getSettings().defaultProjectName;
	});

	async function onUpdateWorldClicked() {
		filesToMove = await getMDWithTasks();
		showUpdateWorldModal = true;
		showUpdateButton = false;
	}

	function closeModal() {
		showUpdateWorldModal = false;
		showUpdateButton = false;
		filesToMove = [];
	}

	async function confirmUpdateWorld() {
		showUpdateWorldModal = false;
		const settings = getSettings();
		log.debug(`[moveFiles] confirmUpdateWorld: keepProjectFolders=${settings.keepProjectFolders}, defaultFolder=${getDefaultFolder()}, filesToMove=${filesToMove.length}`);

		for (const file of filesToMove) {
			try {
				let targetFolder = getDefaultFolder();
				log.debug(`[moveFiles] Processing file: path=${file.path}, name=${file.name}`);

				if (settings.keepProjectFolders) {
					const defaultProjectId = await plugin.fileTaskQueries.getDefaultProjectForFile(file.path);
					log.debug(`[moveFiles] getDefaultProjectForFile('${file.path}') => ${defaultProjectId}`);
					if (defaultProjectId) {
						const folderPath = await plugin.folderSyncService.getFolderPathForProject(defaultProjectId);
						log.debug(`[moveFiles] getFolderPathForProject('${defaultProjectId}') => '${folderPath}'`);
						if (folderPath) {
							targetFolder = folderPath;
							log.debug(`[moveFiles] Using group folder: ${targetFolder}`);
						} else {
							log.debug(`[moveFiles] folderPath is falsy, keeping base targetFolder`);
						}
					} else {
						log.debug(`[moveFiles] No defaultProjectId, keeping base targetFolder`);
					}
				} else {
					log.debug(`[moveFiles] keepProjectFolders is false, using base targetFolder`);
				}

				const newPath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
				log.debug(`[moveFiles] newPath=${newPath}, file.path=${file.path}, willRename=${file.path !== newPath}`);
				if (file.path !== newPath) {
					log.debug(`[moveFiles] Creating folder ${targetFolder}`);
					if (targetFolder) {
						await plugin.folderSyncService.ensureFolderExists(targetFolder);
					}
					log.debug(`[moveFiles] Renaming ${file.path} -> ${newPath}`);
					await plugin.app.vault.rename(file, newPath);
					log.debug(`[moveFiles] Rename complete`);
				} else {
					log.debug(`[moveFiles] File already at target, skipping`);
				}
			} catch (error) {
				log.error(`[moveFiles] File rename failed. ${error}`);
				alert(`File rename failed. ${error}`);
			}
		}
		log.debug(`[moveFiles] Done moving ${filesToMove.length} files`);
		filesToMove = [];
	}

	async function getMDWithTasks(): Promise<TFile[]> {
		const files: TFile[] = [];
		const settings = getSettings();

		// Find plugin-managed files from the database (covers files in the old
		// default folder and any group subfolders)
		const allFileRecords = await db.files.toArray();
		const managedFiles = allFileRecords.filter(f => !!f.defaultProjectId);
		log.debug(`[moveFiles] getMDWithTasks: ${allFileRecords.length} total DB records, ${managedFiles.length} with defaultProjectId`);

		for (const fileRecord of managedFiles) {
			log.debug(`[moveFiles] Checking fileRecord: path=${fileRecord.path}, defaultProjectId=${fileRecord.defaultProjectId}`);

			if (await isDefaultProjectFile(fileRecord.path)) {
				log.debug(`[moveFiles] Skipping default project file: ${fileRecord.path}`);
				continue;
			}

			const file = plugin.app.vault.getAbstractFileByPath(fileRecord.path);
			if (!(file instanceof TFile)) {
				log.debug(`[moveFiles] File not found in vault: ${fileRecord.path}`);
				continue;
			}

			try {
				const fileMap = new NewFileMap(plugin.app, plugin, file);
				await fileMap.init();

				if (fileMap.hasTasks(settings.enableFullVaultSync)) {
					files.push(file);
					log.debug(`[moveFiles] Added to move list: ${file.path}`);
				} else {
					log.debug(`[moveFiles] No tasks in file: ${file.path}`);
				}
			} catch (e) {
				log.error(`Failed to process file ${fileRecord.path}`, e);
			}
		}
		log.debug(`[moveFiles] getMDWithTasks returning ${files.length} files to move`);
		return files;
	}

	export const isDefaultProjectFile = async (path: string): Promise<boolean> => {
		const settings = getSettings();
		const defaultFolder = getDefaultFolder();
		const fileName = `${settings.defaultProjectName}.md`;
		const expectedPath = defaultFolder ? `${defaultFolder}/${fileName}` : fileName;

		// Direct match at root of default folder
		if (path === expectedPath) {
			return true;
		}

		// When keepProjectFolders is enabled, the default project file may be
		// in a group subfolder. Check by matching the default project ID.
		if (settings.keepProjectFolders && settings.defaultProjectId) {
			try {
				const fileRecord = await db.files.get(path);
				return fileRecord?.defaultProjectId === settings.defaultProjectId;
			} catch {
				return false;
			}
		}

		return false;
	};

</script>

<CollapsibleSection
	title="Defaults"
	shortDesc="Default Folder and Project settings"
	open={open}
	on:headerClick={handleHeaderClick}
>
	<div class="sync-control">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Default Project</div>
				<div class="setting-item-description">
					<div>Tasks are added to the default project associated with a file.</div>
					<div>If tasks are added to a file with no default project association
					</div>
					<div>they will be added to the <span
						class="setting-item-name"> {getSettings().defaultProjectName}</span> project.
					</div>
				</div>
			</div>
			<div class="setting-item-control">
				<select
					class="dropdown"
					id="sync-project"
					bind:value={defaultProjectId}
					on:change={(e: Event) => handleDefaultProjectChange((e.target as HTMLSelectElement).value)}
				>
					<option value="">(none)</option>
					{#each Object.entries(myProjectsOptions) as [id, name]}
						<option value={id}>{name}</option>
					{/each}
				</select>
			</div>
		</div>


		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Default folder location</div>
				<div class="setting-item-description">
					<div>Folder where TickTick tasks are stored.</div>
					Default Project File <span class="setting-item-name"> {currentDefault}.md</span>
					{#if showCreateText}
						will be created <strong><span class="setting-item-name"> after you hit  ENTER </span></strong>
					{/if}
				</div>
			</div>
			<div class="setting-item-control flex-container">
				<div
					class="local-modal-form remove-padding remove-border fix-suggest"
					use:defaultFolder
				>
				</div>
			</div>

		</div>
	</div>

	<div style="margin-top: 2em; text-align: right;">
		<button class="mod-cta" on:click={onUpdateWorldClicked} disabled={!showUpdateButton}>
			Move Existing Files.
		</button>
	</div>

	<!-- MODAL DIALOG: simple conditional rendering -->
	{#if showUpdateWorldModal}
		<div class="local-modal-backdrop" role="button" tabindex="0" on:click={closeModal} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeModal(); } }} aria-label="Close"></div>
		<div class="local-modal-dialog">
			<div class="local-modal-content">
				<h2>Update the World</h2>
				{#if filesToMove.length > 0}
					<p>The following files contain tasks and will be moved to <strong>/{getDefaultFolder()}</strong>{getSettings().keepProjectFolders ? ' (organized by project groups)' : ''}:
					</p>
					<ul class="file-list">
						{#each filesToMove as file}
							<li>{file.path}</li>
						{/each}
					</ul>
					<div class="local-modal-actions">
						<button class="mod-cta" on:click={confirmUpdateWorld}>Yes, move them!</button>
						<button on:click={closeModal} style="margin-left:1em;">No, cancel</button>
					</div>
				{:else}
					<p>No files found containing relevant tasks to move.</p>
					<div class="local-modal-actions">
						<button on:click={closeModal}>Close</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<style>
		/* Modal basic styles */
		.local-modal-backdrop {
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: rgba(0, 0, 0, 0.4);
			z-index: 99;
		}

		.local-modal-dialog {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			z-index: 100;
			background: var(--background-secondary); /* matches settings panel */
			border: 1.5px solid var(--background-modifier-border); /* matches panel border */
			border-radius: 8px;
			box-shadow: 0 2px 24px #0003;
			min-width: 300px;
			max-width: 95vw;
			color: var(--text-normal); /* make text readable in all themes */
			display: inline-flex;
			flex-direction: column;
		}

		.local-modal-content {
			padding: 2em;
			display: inline-flex;
			flex-direction: column;
		}

		.local-modal-content h2 {
			margin: 0 0 1.2em 0;
		}

		.local-modal-content p {
			margin: 0 0 2em 0;
		}

		.file-list {
			max-height: 300px;
			overflow-y: auto;
			margin: 0 0 2em 0;
			padding-left: 1.2em;
			text-align: left;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			padding: 10px;
		}

		.local-modal-actions {
			margin-top: 2.2em;
			display: flex;
			justify-content: flex-end;
		}
	</style>

</CollapsibleSection>
