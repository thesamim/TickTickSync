<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte'
	import { createEventDispatcher } from 'svelte';
	import { getSettings, updateSettings } from '@/settings';
	import { onMount } from 'svelte';
	import { Notice } from 'obsidian';
	import { TAGS_BEHAVIOR } from '@/ui/settings/constants.svelte';

	export let open = false;
	export let plugin;

	let projects: Array<{ id: string; name: string }> = [];
	let myProjectsOptions: Record<string, string> = {};
	let selectedSyncProject = '';
	let defaultProjectId = '';
	let tagAndOr: number = 1;
	$: tagAndOrString = tagAndOr.toString();
	let syncTag = '';
	let folder = '';
	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		console.log('LimitSyncSection toggle fired');
		dispatch('toggle');
	}

	// New: explanation state as structured data instead of string
	type SyncExplanationData = {
		project?: string,
		tag?: string,
		andOr?: boolean // true = AND, false = OR, undefined = not applicable
	};

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

	let syncExplanationData: SyncExplanationData = {};

	function updateSyncExplanationData(myProjectsOptions: Record<string, string>) {
		const project = myProjectsOptions[getSettings().SyncProject];
		const tag = getSettings().SyncTag;
		// is AND when both set, otherwise irrelevant
		const andOr = (project && tag) ? (getSettings().tagAndOr == 1) : undefined;

		syncExplanationData = { project, tag, andOr };
	}

	$: updateSyncExplanationData(myProjectsOptions);

	function getMyProjectsOptions() {
		return projects.reduce((obj, item) => {
			obj[item.id] = item.name;
			return obj;
		}, {});
	}
	function handleSyncTagChange(value: string) {
		syncTag = value;
		updateSettings({ SyncTag: value });
		clearTimeout(saveSettingsTimeout);
		saveSettingsTimeout = setTimeout(async () => {
			await plugin.saveSettings();
		}, 800);
	}
	onMount(async () => {
		projects = await plugin.service.getProjects?.() ?? [];
		myProjectsOptions = getMyProjectsOptions();
		selectedSyncProject = getSettings().SyncProject ?? '';
		defaultProjectId = getSettings().defaultProjectId ?? '';
		tagAndOr = getSettings().tagAndOr ?? '1';
		syncTag = getSettings().SyncTag ?? '';
		updateSyncExplanationData(myProjectsOptions);
	});
</script>

<CollapsibleSection
	title="Limit synchronization"
	shortDesc="Synchronization settings added for effect"
	open={open}
	on:headerClick={handleHeaderClick}
>
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

</CollapsibleSection>
