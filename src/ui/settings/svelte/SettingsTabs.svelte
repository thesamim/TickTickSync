<script lang="ts">
	import { App } from 'obsidian';
	import type TickTickSync from '@/main';
	import './SettingsStyles.css';
	import AccessControlLogin from './AccessControlLogin.svelte';
	import ManualSyncOperations from './ManualSyncOperations.svelte';
	import DebugOptionsSettings from './DebugOptionsSettings.svelte';
	import NotesSettings from './NotesSettings.svelte';
	import SyncControlSettings from './sections/SyncControlSettings.svelte';
	import TasksSettings from './TasksSettings.svelte';
	import { getSettings } from '@/settings';


	export let app: App;
	export let plugin: TickTickSync;

	const vaultName = app.vault.getName();
	const version = getSettings().version;

	let activeTab = 'access';

	const tabs = {
		access: 'Access Control',
		sync: 'Sync Control',
		manual: 'Manual Operations',
		debug: 'Debug Options',
		tasks: 'Task Links',
		notes: 'Notes',
	};
</script>
<div class="ticktick-settings">
	{vaultName} -- {version}
</div>

<div class="ticktick-settings">
	<nav class="settings-tabs">
		{#each Object.entries(tabs) as [id, label]}
			<button
				class="tab-button {activeTab === id ? 'active' : ''}"
				on:click={() => activeTab = id}>
				{label}
			</button>
		{/each}
	</nav>


	<div class="tab-content">
		{#if activeTab === 'access'}
			<AccessControlLogin {plugin} />
		{:else if activeTab === 'sync'}
			<SyncControlSettings {plugin} {app} />
		{:else if activeTab === 'manual'}
			<ManualSyncOperations {plugin} />
		{:else if activeTab === 'debug'}
			<DebugOptionsSettings {plugin} />
		{:else if activeTab === 'notes'}
			<NotesSettings {plugin} />
		{:else if activeTab === 'tasks'}
			<TasksSettings {plugin} />
		{/if}
	</div>
</div>
