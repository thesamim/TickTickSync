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
			<h2>Changes will only be reflected on update of a task.</h2>
			<p>Changes to the appearance settings of tasks in Obsidian or TickTick will only be reflected in the other app when you update those tasks.</p>
				<p>Tasks are <em>NOT</em> updated automatically.</p>

			<hr>
		</div>


	</div>
</div>

<!--&lt;!&ndash; ...your existing settings markup here... &ndash;&gt;-->

<!--&lt;!&ndash; Add the new button at the bottom. &ndash;&gt;-->
<!--<div style="margin-top: 2em; text-align: right;">-->
<!--	<button class="mod-cta" on:click={onUpdateWorldClicked} disabled={showUpdateButton}>-->
<!--		Update the World-->
<!--	</button>-->
<!--</div>-->

<!--&lt;!&ndash; MODAL DIALOG: simple conditional rendering &ndash;&gt;-->
<!--{#if showUpdateWorldModal}-->
<!--	<div class="modal-backdrop" on:click={closeModal}></div>-->
<!--	<div class="modal-dialog">-->
<!--		<div class="modal-content">-->
<!--			<h2>Update the World</h2>-->
<!--			<p>Do you <strong>REALLY</strong> want to update the world?</p>-->
<!--			<div class="modal-actions">-->
<!--				<button class="mod-cta" on:click={confirmUpdateWorld}>Yes, update it!</button>-->
<!--				<button on:click={closeModal} style="margin-left:1em;">No, cancel</button>-->
<!--			</div>-->
<!--		</div>-->
<!--	</div>-->
<!--{/if}-->

<!--<style>-->
<!--	/* Modal basic styles */-->
<!--	.modal-backdrop {-->
<!--		position: fixed;-->
<!--		top: 0; left: 0;-->
<!--		width: 100vw; height: 100vh;-->
<!--		background: rgba(0,0,0,0.4);-->
<!--		z-index: 99;-->
<!--	}-->
<!--	.modal-dialog {-->
<!--		position: fixed;-->
<!--		top: 50%; left: 50%;-->
<!--		transform: translate(-50%, -50%);-->
<!--		z-index: 100;-->
<!--		background: var(&#45;&#45;background-secondary); /* matches settings panel */-->
<!--		border: 1.5px solid var(&#45;&#45;background-modifier-border); /* matches panel border */-->
<!--		border-radius: 8px;-->
<!--		box-shadow: 0 2px 24px #0003;-->
<!--		min-width: 300px;-->
<!--		max-width: 95vw;-->
<!--		color: var(&#45;&#45;text-normal); /* make text readable in all themes */-->
<!--		display: inline-flex;-->
<!--		flex-direction: column;-->
<!--	}-->
<!--	.modal-content {-->
<!--		padding: 2em;-->
<!--		display: inline-flex;-->
<!--		flex-direction: column;-->
<!--	}-->
<!--	.modal-content h2 {-->
<!--		margin: 0 0 1.2em 0;-->
<!--	}-->

<!--	.modal-content p {-->
<!--		margin: 0 0 2em 0;-->
<!--	}-->

<!--	.modal-actions {-->
<!--		margin-top: 2.2em;-->
<!--		display: flex;-->
<!--		justify-content: flex-end;-->
<!--	}-->
<!--</style>-->
