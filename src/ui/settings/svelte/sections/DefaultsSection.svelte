<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { onMount } from 'svelte';
	import { getSettings, updateSettings } from '@/settings';
	import { Notice, Setting, TFolder } from 'obsidian';
	import { FolderSuggest } from '@/utils/FolderSuggester';
	import { createEventDispatcher } from 'svelte';

	export let open = false;
	export let plugin;
	let defaultProjectId = '';
	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	let projects: Array<{ id: string; name: string }> = [];
	let myProjectsOptions: Record<string, string> = {};
	let debounceTimeout: ReturnType<typeof setTimeout>;

	function searchFolder(element: HTMLElement) {
		const setting = new Setting(element)
			.addSearch((search) => {
				search.setPlaceholder('Select or Create folder')
					.setValue(getSettings().TickTickTasksFilePath);
				search.setValue(myProjectsOptions);
				new FolderSuggest(search.inputEl, app);
				search.onChange((value) => {
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

	async function validateNewFolder(newFolder: string) {
		//remove leading slash if it exists.
		if (!newFolder) {
			return null;
		}

		if (newFolder && (newFolder.length > 1) && (/^[/\\]/.test(newFolder))) {
			newFolder = newFolder.substring(1);
		}

		let newFolderFile = app.vault.getAbstractFileByPath(newFolder);
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


	async function handleDefaultProjectChange(value: string) {
		getSettings().defaultProjectId = value;
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

	onMount(async () => {
		projects = await plugin.service.getProjects?.() ?? [];
		myProjectsOptions = getMyProjectsOptions();
		defaultProjectId = getSettings().defaultProjectId ?? '';
	});

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
	</div>
</CollapsibleSection>
