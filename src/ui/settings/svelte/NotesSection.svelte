<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import { onMount } from 'svelte';
	import { NOTE_SEPERATOR } from '@/ui/settings/svelte/constants.svelte.js';

	export let plugin: TickTickSync;

	let isWorking: boolean = false;
	let syncNotes: boolean = false;
	let resetNotesText: string = '';
	$: resetNotesText = syncNotes
		? 'Get all Notes from TickTick?'
		: 'Remove all Notes from Obsidian? (This will not delete Notes in TickTick)';

	let noteSeparatorOptions: Record<string, string> = NOTE_SEPERATOR;

	onMount(async () => {
		syncNotes = getSettings().syncNotes;
	});

	async function resetNotes() {
		isWorking = true;
		const allTasks = getSettings().TickTickTasksData.tasks;
		for (const task of allTasks) {
			task.modifiedTime = '1970-01-01T00:00:00.000Z';
		}
		console.log(allTasks);
		updateSettings({ TickTickTasksData: { ...getSettings().TickTickTasksData, tasks: allTasks } });
		if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) {
			plugin.tickTickRestAPI!.api!.checkpoint = 0;
		}
		updateSettings({ checkPoint: 0 });
		await plugin.saveSettings();
		await plugin.scheduledSynchronization();
		isWorking = false;
	}

	let noteSeparator: string = 'foo';
	let noteSeparatorContent: string = '';

	function handleSeparatorChange(target: EventTarget) {

		let res = '-';
		let separatorId = target;
		noteSeparator = noteSeparatorOptions[separatorId];
		console.log(target, noteSeparator, separatorId, res, res.repeat(61));
		noteSeparatorContent = res.repeat(61);

	}


</script>
<div class="{isWorking ? 'wait-cursor' : 'default-cursor'}">
	<div class="notes-settings ">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Sync Notes</div>
				<div class="setting-item-description">Synchronize Notes</div>
			</div>
			<div class="setting-item-control">
				<label class="toggle-switch">
					<input
						type="checkbox"
						bind:checked={syncNotes}
						on:change={async (e) => {
							const checked = e.target.checked;
							syncNotes = checked; // Ensure local state stays in sync
							updateSettings({ syncNotes: checked });
							await plugin.saveSettings();
					  }}
					/>
					<span class="slider"></span>
				</label>
			</div>
		</div>

		{#if syncNotes}
			<div>Notes will be synchronized.</div>
			<br>
		{:else }
			<div>Notes will be not synchronized.</div>
			<br>
		{/if}
		<div>If you have thoughts about Note formatting, please contribute them in the
			<a href="https://github.com/thesamim/TickTickSync/discussions/255#discussion-8452861"> discussion forum.</a>
		</div>
		<br>
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Reset Notes</div>
				<div class="setting-item-description">Do you want to {resetNotesText} <br> <em> Caution: This may take
					some
					time.</em></div>
			</div>
			<div class="setting-item-control">
				<button disabled={isWorking} class="mod-cta" on:click={resetNotes}>
					Reset Notes.
				</button>
			</div>
		</div>

	</div>
</div>
<style>
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

	.wait-cursor {
		cursor: wait;
	}

	.default-cursor {
		cursor: default;
	}
</style>
