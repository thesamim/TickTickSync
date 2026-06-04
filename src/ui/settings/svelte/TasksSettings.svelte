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
	let keepProjectFolders: boolean;
	let linkBehaviorOptions: Record<string, string> = LINK_BEHAVIOR;
	let showKeepFoldersModal = false;
	let modalWorking = false;

	function setIsWorking(value: boolean) {
		isWorking = value;
	}

	let resetTasksText: string = '';
	$: resetTasksText = 'Update Tasks in TickTick and Obsidian?';

	async function confirmKeepFoldersChange() {
		modalWorking = true;
		try {
			await plugin.reorganizeFilesToFolders();
		} catch (error) {
			console.error('Error reorganizing files:', error);
		} finally {
			showKeepFoldersModal = false;
			modalWorking = false;
		}
	}

	function closeKeepFoldersModal() {
		if (!modalWorking) showKeepFoldersModal = false;
	}

	// Use store subscription for values, and mirror them for form controls
	$: fileLinksInTickTick = $settingsStore.fileLinksInTickTick;
	$: taskLinksInObsidian = $settingsStore.taskLinksInObsidian;
	$: syncNotes = $settingsStore.syncNotes;
	$: keepProjectFolders = $settingsStore.keepProjectFolders;

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

	async function handleKeepProjectFoldersChange(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		settingsStore.update((s) => ({ ...s, keepProjectFolders: checked }));
		await plugin.saveSettings();
		
		if (checked) {
			showKeepFoldersModal = true;
		}
	}
</script>
<div class="{isWorking ? 'wait-cursor' : 'default-cursor'}">
	{#if showKeepFoldersModal}
	<div
		class="local-modal-backdrop"
		on:click={modalWorking ? undefined : closeKeepFoldersModal}
		style={modalWorking ? 'cursor: wait;' : ''}
	></div>
	<div
		class="local-modal-dialog"
		role="dialog"
		aria-modal="true"
		style={modalWorking ? 'cursor: wait;' : ''}
	>
		<div class="local-modal-content">
			<h2>Reorganize Files?</h2>
			<p>Would you like to reorganize existing task files into folders now?</p>
			<p>This will move plugin-managed files to match your TickTick folder structure.</p>
			<p style="color:var(--text-warning);"><em>Files without a default project will not be moved.</em></p>
			<div class="local-modal-actions">
				<button class="mod-cta"
					on:click={confirmKeepFoldersChange}
					disabled={modalWorking}>
					{modalWorking ? 'Reorganizing...' : 'Yes, reorganize'}
				</button>
				<button
					style="margin-left:1em;"
					on:click={closeKeepFoldersModal}
					disabled={modalWorking}
				>
					No, cancel
				</button>
			</div>
		</div>
	</div>
{/if}

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
				<div class="setting-item-name">Organize tasks by TickTick folders</div>
				<div class="setting-item-description">
					When enabled, tasks will be organized into Obsidian folders matching your TickTick folder structure.
					Files without a default project will not be moved.
				</div>
			</div>
			<div class="setting-item-control">
				<input
					type="checkbox"
					checked={keepProjectFolders}
					on:change={handleKeepProjectFoldersChange}
				/>
			</div>
		</div>

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
