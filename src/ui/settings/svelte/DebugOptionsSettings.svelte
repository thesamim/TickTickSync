<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import log from '@/utils/logger';
	import { onMount } from 'svelte';
	import { LOG_LEVEL } from '@/ui/settings/svelte/constants.svelte.js';
	import './SettingsStyles.css';

	export let plugin: TickTickSync;

	let debugMode: boolean = false;
	let showDebugInfo = false;
	let debugString = '';
	let copyStatus = '';

	async function handleDebugModeChange(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		debugMode = checked;
		updateSettings({ debugMode: checked });
		await plugin.saveSettings();
	}

	onMount(async () => {
		debugMode = getSettings().debugMode;
	});

	function generateDebugInfoSubset() {
		const settings = getSettings();
		const debugInfo = {
			general: {
				version: settings.version,
				enableFullVaultSync: settings.enableFullVaultSync,
				debugMode: settings.debugMode,
				logLevel: settings.logLevel,
				fileLinksInTickTick: settings.fileLinksInTickTick,
				taskLinksInObsidian: settings.taskLinksInObsidian,
				bkupFolder: settings.bkupFolder,
				skipBackup: settings.skipBackup,
			},
			defaults :
				{
					defaultProjectName: settings.defaultProjectName,
					defaultProjectId: settings.defaultProjectId,
					TickTickTasksFilePath: settings.TickTickTasksFilePath
				},
			syncControl: {
				SyncProject: settings.SyncProject,
				tagAndOr: settings.tagAndOr,
				SyncTag: settings.SyncTag
			},

		};
		return debugInfo;
	}

	async function generateDebug() {
		let debugInfo = generateDebugInfoSubset();
		debugString = "```\n" + JSON.stringify(debugInfo, null, 2) + "\n```";
		showDebugInfo = true;
		console.log(debugString);
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(debugString);
			copyStatus = 'Copied!';
			setTimeout(() => (copyStatus = ''), 1500);
		} catch (e) {
			copyStatus = 'Copy failed';
			setTimeout(() => (copyStatus = ''), 1500);
		}
	}

</script>

<div class="debug-options">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Debug mode</div>
			<div class="setting-item-description">Allow access to developer settings</div>
		</div>
		<div class="setting-item-control">
			<label class="toggle-switch">
				<input
					type="checkbox"
					bind:checked={debugMode}
					on:change={async (e) => {
							const checked = e.target.checked;
							debugMode = checked; // Ensure local state stays in sync
							updateSettings({ debugMode: checked });
							await plugin.saveSettings();
					  }}
				/>
				<span class="slider"></span>
			</label>
		</div>
	</div>

	{#if debugMode}
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Log Level</div>
				<div class="setting-item-description">Determine log level</div>
			</div>
			<div class="setting-item-control">
				<select
					value={getSettings().logLevel}
					on:change={async (e) => {
            updateSettings({ logLevel: e.target.value });
            await plugin.saveSettings(true);
            log.setLevel(e.target.value);
          }}>
					{#each Object.entries(LOG_LEVEL) as [value, label]}
						<option {value}>{label}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Generate Debug Info.</div>
			<div class="setting-item-description">Click to report settings for a bug.</div>
		</div>
		<div class="setting-item-control">
			<button class="mod-cta" on:click={generateDebug}>
				Generate
			</button>
		</div>
	</div>
	{#if showDebugInfo}
		<div style="margin-top: 1em;">
    <textarea
		readonly
		rows="10"
		style="width:100%;"
		bind:value={debugString}
	></textarea>
			<div style="display:flex; align-items:center; gap: 1em; margin-top: 0.5em;">
				<button on:click={copyToClipboard}>Copy to clipboard</button>
				{#if copyStatus}
					<span>{copyStatus}</span>
				{/if}
			</div>
		</div>
	{/if}


</div>



