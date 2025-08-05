<script lang="ts">
	import { settingsStore } from '@/ui/settings/settingsstore';
	import type TickTickSync from '@/main';
	import { LINK_BEHAVIOR } from '@/ui/settings/svelte/constants.svelte.js';
	import './SettingsStyles.css';
	import ResetTasksControl from '@/ui/settings/svelte/ResetTasksControl.svelte';

	export let plugin: TickTickSync;

	let isWorking: boolean = false;
	let fileLinksInTickTick: string;
	let taskLinksInObsidian: string;
	let syncNotes: boolean;
	let linkBehaviorOptions: Record<string, string> = LINK_BEHAVIOR;

	function setIsWorking(value: boolean) {
		isWorking = value;
	}

	let resetTasksText: string = '';
	$: resetTasksText = 'Update Tasks in TickTick and Obsidian?';

	// Use store subscription for values, and mirror them for form controls
	$: fileLinksInTickTick = $settingsStore.fileLinksInTickTick;
	$: taskLinksInObsidian = $settingsStore.taskLinksInObsidian;
	$: syncNotes = $settingsStore.syncNotes;

	// Remove noteLink from options if needed
	$: if (!syncNotes) {
		const opt = { ...LINK_BEHAVIOR };
		delete opt['noteLink'];
		linkBehaviorOptions = opt;
	} else {
		linkBehaviorOptions = LINK_BEHAVIOR;
	}

	async function handleObsidianTaskLinkChange(value: string) {
		settingsStore.update((s) => ({ ...s, taskLinksInObsidian: value }));
		await plugin.saveSettings();
	}

	async function handleTickTickTaskLinkChange(value: string) {
		settingsStore.update((s) => ({ ...s, fileLinksInTickTick: value }));
		await plugin.saveSettings();
	}
</script>
<div class="{isWorking ? 'wait-cursor' : 'default-cursor'}">
	{#if !syncNotes}
		<div class="setting-item-info">
			<hr>
			<div class="setting-item-name">Notice:</div>
			<p>Note syncing is disabled. Links can only be added to the Task text or not added at all.</p>
			<hr>
		</div>
	{/if}

	<div class="task-settings ">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Task link handling in Obsidian</div>
				<div class="setting-item-description"> Add TickTick task link to Tasks in Obsidian
				</div>
			</div>
			<div class="setting-item-control">
				<select
					class="dropdown"
					id="sync-project"
					bind:value={taskLinksInObsidian}
					on:change={(e: Event) => handleObsidianTaskLinkChange((e.target as HTMLSelectElement).value)}
				>
					{#each Object.entries(linkBehaviorOptions) as [id, name]}
						<option value={id}>{name}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="task-settings ">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Task link handling in TickTick</div>
				<div class="setting-item-description"> Add Obsidian file link to Tasks in TickTick
				</div>
			</div>
			<div class="setting-item-control">
				<select
					class="dropdown"
					id="sync-project"
					bind:value={fileLinksInTickTick}
					on:change={(e: Event) => handleTickTickTaskLinkChange((e.target as HTMLSelectElement).value)}
				>
					{#each Object.entries(linkBehaviorOptions) as [id, name]}
						<option value={id}>{name}</option>
					{/each}
				</select>
			</div>
		</div>

		<br>
		<ResetTasksControl
			{isWorking}
			{resetTasksText}
			{plugin}
			{setIsWorking}
		/>

	</div>
</div>
