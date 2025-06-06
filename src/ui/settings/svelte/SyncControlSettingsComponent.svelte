<script lang="ts">
	import { onMount } from 'svelte';
	import { getSettings, updateSettings } from '@/settings';
	import { Notice, Setting, TFolder } from 'obsidian';
	import { FolderSuggest } from '@/utils/FolderSuggester';
	import { TAGS_BEHAVIOR } from '@/ui/settings/constants.svelte';
	import { ConfirmFullSyncModal } from '@/modals/ConfirmFullSyncModal';
	import CollapsibleSection from '@/ui/settings/svelte/CollapsibleSection.svelte'




	export let plugin: any;
	export let app: any;

	let projects: Array<{ id: string; name: string }> = [];
	let myProjectsOptions: Record<string, string> = {};

	let syncExplanation: string = '';

	let selectedSyncProject = '';
	let defaultProjectId = '';
	let tagAndOr: number = 1;
	$: tagAndOrString = tagAndOr.toString();

	let automaticSynchronizationInterval: number = getSettings().automaticSynchronizationInterval;
	$: automaticSynchronizationIntervalString = automaticSynchronizationInterval.toString();

	let syncTag = '';
	let folder = '';
	let enableFullVaultSync: boolean = false;

	let debounceTimeout: ReturnType<typeof setTimeout>;

	function searchFolder(element: HTMLElement) {
		const setting = new Setting(element)
			.addSearch((search) => {
				search.setPlaceholder('Select or Create folder')
					.setValue(getSettings().TickTickTasksFilePath);
				search.setValue(myProjectsOptions);
				new FolderSuggest(search.inputEl, app);
				search.onChange((value) => {
					folder = value;
					if (debounceTimeout) clearTimeout(debounceTimeout);

					debounceTimeout = setTimeout(async () => {
						const newFolder = await validateNewFolder(value);
						if (newFolder) {
							updateSettings({ TickTickTasksFilePath: newFolder });
							await plugin.saveSettings();
						}
					}, 700);

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
		getSettings().defaultProjectId = value;
		console.log('handleDefaultProjectChange: ', value);
		if (value && value !== '') {
			updateSettings({ defaultProjectName: await plugin.cacheOperation?.getProjectNameByIdFromCache(value) });
			const defaultProjectFileName = getSettings().defaultProjectName + '.md';
			//make sure the file exists.
			const defaultProjectFile = await plugin.fileOperation?.getOrCreateDefaultFile(defaultProjectFileName);
			if (defaultProjectFile) {
				plugin.cacheOperation?.setDefaultProjectIdForFilepath(defaultProjectFile.path, getSettings().defaultProjectId);
			} else {
				new Notice('Unable to create file for selected default project ' + getSettings().defaultProjectName);
			}
		} else {
			updateSettings({ defaultProjectName: '' });
		}
		await plugin.saveSettings();
	}

	async function handleSyncProjectChange(value: string) {
		console.log('handleSyncProjectChange: ', value);
		updateSettings({ SyncProject: value });
		selectedSyncProject = value;

		// Check if we have a fileMetadata entry for this project
		const fileMetaData = getSettings().fileMetadata;
		const defaultProjectFileEntry = Object.values(fileMetaData).find(
			(obj: any) => obj.defaultProjectId === value
		);
		if (!defaultProjectFileEntry) {
			const noticeMsg = `Did not find a default Project File for Project ${
				myProjectsOptions?.[value]
			}. Please create a file and set its default to this project, or select a file to be the default for this project.`;
			new Notice(noticeMsg, 5000);
		}
		await plugin.saveSettings();
	}

	async function handleTagAndOrChange(value: string) {
		updateSettings({ tagAndOr: parseInt(value) });
		tagAndOr = parseInt(value);
		await plugin.saveSettings();
	}

	let saveSettingsTimeout: any;

	function handleSyncTagChange(value: string) {
		syncTag = value;
		updateSettings({ SyncTag: value });
		clearTimeout(saveSettingsTimeout);
		saveSettingsTimeout = setTimeout(async () => {
			await plugin.saveSettings();
		}, 800);
	}

	function updateSyncExplanation(myProjectsOptions: Record<string, string>) {
		const project = myProjectsOptions[getSettings().SyncProject];
		const tag = getSettings().SyncTag;
		const taskAndOr = getSettings().tagAndOr;

		if (!project && !tag) {
			syncExplanation = 'No limitation.';
			return;
		}
		if (project && !tag) {
			syncExplanation = `Only Tasks in <b>${project}</b> will be synchronized`;
			return;
		}
		if (!project && tag) {
			syncExplanation = `Only Tasks tagged with <b>#${tag}</b> tag will be synchronized`;
			return;
		}
		if (taskAndOr == 1) {
			syncExplanation = `Only tasks in <b>${project}</b> AND tagged with <b>#${tag}</b> tag will be synchronized`;
			return;
		}
		syncExplanation = `All tasks in <b>${project}</b> will be synchronized. All tasks tagged with <b>#${tag}</b> tag will be synchronized`;
	}

	onMount(async () => {
		projects = await plugin.service.getProjects?.() ?? [];
		myProjectsOptions = getMyProjectsOptions();
		selectedSyncProject = getSettings().SyncProject ?? '';
		defaultProjectId = getSettings().defaultProjectId ?? '';
		tagAndOr = getSettings().tagAndOr ?? '1';
		syncTag = getSettings().SyncTag ?? '';
		enableFullVaultSync = getSettings().enableFullVaultSync;
		updateSyncExplanationData(myProjectsOptions);
	});

	async function validateNewFolder(newFolder: string) {
		//remove leading slash if it exists.
		if (!newFolder) {
			return null;
		}

		if (newFolder && (newFolder.length > 1) && (/^[/\\]/.test(newFolder))) {
			newFolder = newFolder.substring(1);
		}

		let newFolderFile = app.vault.getAbstractFileByPath(newFolder);
		console.log('result: ', newFolderFile);
		if (!newFolderFile) {
			//it doesn't exist, create it and return its path.
			try {
				newFolderFile = await app.vault.createFolder(newFolder);
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

	let newFolder;

	// New: explanation state as structured data instead of string
	type SyncExplanationData = {
		project?: string,
		tag?: string,
		andOr?: boolean // true = AND, false = OR, undefined = not applicable
	};
	let syncExplanationData: SyncExplanationData = {};

	function updateSyncExplanationData(myProjectsOptions: Record<string, string>) {
		const project = myProjectsOptions[getSettings().SyncProject];
		const tag = getSettings().SyncTag;
		// is AND when both set, otherwise irrelevant
		const andOr = (project && tag) ? (getSettings().tagAndOr == 1) : undefined;

		syncExplanationData = { project, tag, andOr };
	}

	$: updateSyncExplanationData(myProjectsOptions);

	async function handleAutomaticSynchronizationIntervalChange(value: string) {
		console.log('handleAutomaticSynchronizationIntervalChange: ', value);
		const intervalNum = Number(value);
		if (isNaN(intervalNum) || !Number.isInteger(intervalNum)) {
			new Notice(`Wrong type, please enter a integer.`);
			return;
		}
		if (intervalNum !== 0 && intervalNum < 20) {
			new Notice(`The synchronization interval time cannot be less than 20 seconds.`);
			return;
		}
		updateSettings({ automaticSynchronizationInterval: intervalNum });
		await plugin.saveSettings();
		plugin.reloadInterval();
		new Notice('Settings have been updated.');
	}

	async function confirmFullSync() {
		const myModal = new ConfirmFullSyncModal(app, () => {
		});
		return await myModal.showModal();
	}

	async function handleFullVaultSyncChange(value: boolean) {
		let noticeString: string;
		if (!getSettings().enableFullVaultSync) {
			const bConfirmation = await confirmFullSync();
			if (bConfirmation) {
				enableFullVaultSync = true;
				noticeString = 'Full vault sync is enabled.';
			} else {
				enableFullVaultSync = false;
				noticeString = 'Full vault sync not enabled.';
			}
		} else {
			enableFullVaultSync = false;
			noticeString = 'Full vault sync is disabled.';
		}
		updateSettings({ enableFullVaultSync: enableFullVaultSync });
		new Notice(noticeString);
		await plugin.saveSettings();
	}


</script>

<CollapsibleSection title="Defaults" shortDesc="Default Folder and Project settings">
<div class="sync-control">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Default Project</div>
			<div class="setting-item-description">New tasks are automatically synced to the default project. You can
				modify the project here.
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
			<div class="setting-item-description">Folder to be used for TickTick Tasks.</div>
		</div>
		<div class="setting-item-control flex-container">
			<div
				class="modal-form remove-padding remove-border fix-suggest"
				use:searchFolder
			>
			</div>
		</div>

	</div>
</CollapsibleSection>
<CollapsibleSection title="Limit synchronization" shortDesc="Synchronization settings">
	<div class="setting-item-description">
		To limit the tasks TickTickSync will synchronize from TickTick to
		Obsidian select a tag and/or project(list) below. If a tag is entered, only tasks with that tag will be
		synchronized. If a project(list) is selected, only tasks in that project will be synchronized. If
		both are chosen the behavior will be determined by your settings. See result below.
	</div>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Project</div>
			<div class="setting-item-description">Only tasks in this project will be synchronized.</div>
		</div>
		<div class="setting-item-control">
			<select
				class="dropdown"
				id="sync-project"
				bind:value={selectedSyncProject}
				on:change={(e: Event) => {
				handleSyncProjectChange((e.target as HTMLSelectElement).value);
				updateSyncExplanationData(myProjectsOptions);}}
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
			<div class="setting-item-name">Tag Behavior</div>
			<div class="setting-item-description">Determine how Tags will be handled.</div>
		</div>
		<div class="setting-item-control">
			<select
				class="dropdown"
				id="tag-and-or"
				bind:value={tagAndOrString}
				on:change={(e: Event) => {
				handleTagAndOrChange((e.target as HTMLSelectElement).value);
				updateSyncExplanationData(myProjectsOptions);}}
			>
				{#each Object.entries(TAGS_BEHAVIOR) as [num, label]}
					<option value={num}>{label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Tag</div>
			<div class="setting-item-description">Tag value, no "#".</div>
		</div>
		<div class="setting-item-control">
			<input
				id="sync-tag"
				type="text"
				bind:value={syncTag}
				placeholder="Only tasks with this tag will be synced"
				on:input={(e: Event) => {
					handleSyncTagChange((e.target as HTMLInputElement).value);
					updateSyncExplanationData(myProjectsOptions);}}
			/>
		</div>
	</div>
	<!-- In your relevant markup location: -->
	<div class="sync-explanation">
		{#if !syncExplanationData.project && !syncExplanationData.tag}
			<p>No limitation.</p>
		{:else if syncExplanationData.project && !syncExplanationData.tag}
			<p>Only Tasks in <b>{syncExplanationData.project}</b> will be synchronized</p>
		{:else if !syncExplanationData.project && syncExplanationData.tag}
			<p>Only Tasks tagged with <b>#{syncExplanationData.tag}</b> tag will be synchronized</p>
		{:else if syncExplanationData.andOr}
			<p>
				Only tasks in <b>{syncExplanationData.project}</b> AND tagged with <b>#{syncExplanationData.tag}</b> tag
				will be synchronized
			</p>
		{:else}
			<p>
				All tasks in <b>{syncExplanationData.project}</b> will be synchronized. All tasks tagged with
				<b>#{syncExplanationData.tag}</b> tag will be synchronized
			</p>
		{/if}
	</div>
	<hr>
</CollapsibleSection>
<CollapsibleSection title="Automatic sync interval time" shortDesc="Sync interval setting">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Automatic sync interval time</div>
			<div class="setting-item-description">Please specify the desired interval time, with seconds as the default
				unit. 0 for manual sync. The default setting is 300 seconds, which corresponds to syncing once every 5
				minutes. You can customize it, but it cannot be lower than 20 seconds.
			</div>
		</div>
		<div class="setting-item-control">
			<input
				id="sync-tag"
				type="text"
				bind:value={automaticSynchronizationInterval}
				Placeholder="Sync interval"
				on:input={(e: Event) => {
					if (debounceTimeout) clearTimeout(debounceTimeout);
					debounceTimeout = setTimeout(async () => {
						const target = e.target as HTMLInputElement;
						await handleAutomaticSynchronizationIntervalChange(target.value);
						}, 700);
				}}
			/>
		</div>
	</div>
</CollapsibleSection>
<CollapsibleSection title="Full vault sync" shortDesc="Full vault settings">
<div class="Full vault sync">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Full vault sync</div>
			<div class="setting-item-description">
				By default, only tasks marked with #TickTick are synchronized. If this option is turned on, all tasks in
				the vault will be synchronized.
				<p><b>NOTE: This includes all tasks that are currently Items of a task.</b></p></div>
		</div>
		<div class="setting-item-control">
			<label class="toggle-switch">
				<input
					type="checkbox"
					bind:checked={enableFullVaultSync}
					on:change={async (e) => {
							const checked = e.target.checked;
							await handleFullVaultSyncChange(checked)
					  }}
				/>
				<span class="slider"></span>
			</label>
		</div>
	</div>
	</div>
</CollapsibleSection>


<style>
	.flex-container {
		display: flex;
		flex-direction: column;
	}

	.flex-container > div {
		text-align: right;
		justify-content: flex-end;
		align-items: center;
		margin-left: auto;
	}

	.toggle-switch {
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		gap: 0.5em;
	}

	.toggle-switch input[type="checkbox"] {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-switch .slider {
		height: 1.2em;
		width: 2.2em;
		border-radius: 1.1em;
		background: #8884;
		position: relative;
		transition: background 0.2s;
		border: 1px solid var(--background-modifier-border, #ccc);
	}

	.toggle-switch input[type="checkbox"]:checked + .slider {
		background: var(--interactive-accent, #4caf50);
	}

	.toggle-switch .slider::before {
		content: '';
		position: absolute;
		left: 0.2em;
		top: 0.15em;
		width: 0.9em;
		height: 0.9em;
		border-radius: 50%;
		background: var(--background-primary, #fff);
		transition: left 0.2s;
	}

	.toggle-switch input[type="checkbox"]:checked + .slider::before {
		left: 1.1em;
	}
</style>
