<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import { onMount } from 'svelte';
	import { LINK_BEHAVIOR, NOTE_SEPERATOR } from '@/ui/settings/svelte/constants.svelte.js';
	import './SettingsStyles.css';
	export let plugin: TickTickSync;

	let isWorking: boolean = false;
	let fileLinksInTickTick: string;
	let taskLinksInObsidian: string;
	let syncNotes : boolean;
	let linkBehaviorOptions : Record<string, string> = LINK_BEHAVIOR;


	onMount(async () => {
		fileLinksInTickTick = getSettings().fileLinksInTickTick;
		taskLinksInObsidian = getSettings().taskLinksInObsidian
		syncNotes = getSettings().syncNotes;
		if (!syncNotes) {
			delete linkBehaviorOptions["noteLink"];
		}
	});

	//TODO: if I figure out a safe way to update tasks per settings, it will go here.
	//      this is not it!
	async function resetNotes() {
		isWorking = true;
		const allTasks = getSettings().TickTickTasksData.tasks;
		for (const task of allTasks) {
			task.modifiedTime = '1970-01-01T00:00:00.000Z';
		}
		updateSettings({ TickTickTasksData: { ...getSettings().TickTickTasksData, tasks: allTasks } });
		if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) {
			plugin.tickTickRestAPI!.api!.checkpoint = 0;
		}
		updateSettings({ checkPoint: 0 });
		await plugin.saveSettings();
		await plugin.scheduledSynchronization();
		isWorking = false;
	}

	async function handleObsidianTaskLinkChange(value: string) {
		getSettings().taskLinksInObsidian = value;
		await plugin.saveSettings();
	}
	async function handleTickTickTaskLinkChange(value: string) {
		getSettings().fileLinksInTickTick = value;
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
		<hr>
		<div class="setting-item-info">
			<div class="setting-item-name">Notice:</div>
			<p>Links will be added/removed on the next update of the task from TickTick/Obsidian.</p>
			<hr>
		</div>


	</div>
</div>
