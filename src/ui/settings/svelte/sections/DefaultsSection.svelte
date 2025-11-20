<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import { getDefaultFolder, getSettings, updateSettings } from '@/settings';
	import { Setting, TFile } from 'obsidian';
	import { FolderSuggest } from '@/utils/FolderSuggester';
	import { validateNewFolder } from '@/utils/FolderUtils';
	import log from 'loglevel';
	import { FileMap } from '@/services/fileMap';

	export let open = false;
	export let plugin;
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
		const defaultProjectFolder = getDefaultFolder();
		const defaultProject = getSettings().defaultProjectName;
		log.debug('default project folder: ', defaultProjectFolder, 'default project', defaultProject);
		if (defaultProject) {
			const defaultProjectFileName = defaultProject + '.md';
			const markdownFiles = app.vault.getMarkdownFiles();
			for (const file of markdownFiles) {
				log.debug('checking file: ', file.path);
				if (isDefaultProjectFile(file.path)) {
					if (file.path !== defaultProjectFolder + '/' + defaultProjectFileName) {
						try {
							log.debug('renaming file: ', file.path, 'to: ', defaultProjectFolder + '/' + defaultProjectFileName);
							await app.vault.rename(file, defaultProjectFolder + '/' + defaultProjectFileName);
						} catch (error) {
							log.error(`File rename failed. ${error}`);
							alert(`File rename failed. ${error}`);
						}
						log.debug('default project file renamed', defaultProjectFolder + '/' + defaultProjectFileName);
					} else {
						log.debug('default project file NOT renamed', await app.vault.getAbstractFileByPath(defaultProjectFolder + '/' + defaultProjectFileName));
					}
				}
				break;

			}

		}
		currentDefault = getDefaultFolder() + '/' + getSettings().defaultProjectName;
	}

	function defaultFolder(element: HTMLElement) {
		const setting = new Setting(element)
			.addSearch((search) => {
				search.setPlaceholder('Select or Create folder')
					.setValue(getDefaultFolder());
				search.setValue(myProjectsOptions);
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
						const newFolder = await validateNewFolder(value, 'Default');
						log.debug('new folder: ', newFolder);
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
			updateSettings({ defaultProjectName: await plugin.cacheOperation?.getProjectNameByIdFromCache(value) });
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
		const defaultProjectFolder = getDefaultFolder();

		for (const file of filesToMove) {
			//The default project gets moved as soon as they select it.
			try {
				const newPath = defaultProjectFolder + '/' + file.name;
				if (file.path !== newPath) {
					await plugin.app.vault.rename(file, newPath);
					log.debug('File Moved', newPath);
				}
			} catch (error) {
				log.error(`File rename failed. ${error}`);
				alert(`File rename failed. ${error}`);
			}
		}
		filesToMove = [];
	}

	async function getMDWithTasks(): Promise<TFile[]> {
		const markdownFiles = plugin.app.vault.getMarkdownFiles();
		const files: TFile[] = [];
		const settings = getSettings();

		log.debug(`Checking ${markdownFiles.length} files for tasks...`);

		let countForDebug = 0;
		for (const file of markdownFiles) {
			log.debug(`Checking file ${file.path}`);
			if (isDefaultProjectFile(file.path)) {
				continue;
			}
			try {
				countForDebug++;
				const fileMap = new FileMap(plugin.app, plugin, file);
				await fileMap.init();

				if (fileMap.hasTasks(settings.enableFullVaultSync, countForDebug)) {
					files.push(file);
				}
			} catch (e) {
				log.error(`Failed to process file ${file.path}`, e);
			}
		}
		log.debug(`Found ${files.length} files to move.`);
		log.debug(`Files to move: ${files.map(f => f.path).join(', ')}`);
		return files;
	}

	export const isDefaultProjectFile = (path: string): boolean => {
		const defaultFolder = getDefaultFolder();
		const fileName = `${getSettings().defaultProjectName}.md`;
		const expectedPath = defaultFolder ? `${defaultFolder}/${fileName}` : fileName;
		return path === expectedPath;
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
		<div class="local-modal-backdrop" on:click={closeModal}></div>
		<div class="local-modal-dialog">
			<div class="local-modal-content">
				<h2>Update the World</h2>
				{#if filesToMove.length > 0}
					<p>The following files contain tasks and will be moved to <strong>/{getDefaultFolder()}</strong>:
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
