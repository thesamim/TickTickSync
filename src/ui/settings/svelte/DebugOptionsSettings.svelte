<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import log from '@/utils/logger';
	import { onMount } from 'svelte';
	import { LOG_LEVEL } from '@/ui/settings/svelte/constants.svelte.js';
	import './SettingsStyles.css';
	import { SyncJournalModal } from '@/modals/SyncJournalModal';

	export let plugin: TickTickSync;

	let debugMode: boolean = false;
	let showDebugInfo = false;
	let debugString = '';
	let copyStatus = '';

	onMount(async () => {
		debugMode = getSettings().debugMode;
	});

	async function generateDebugInfoSubset() {
		const settings = getSettings();
		const fileMetaData = await plugin.fileMetadataService?.getAllFileMetadata() ?? {};
		const fmdData = [];
		for (const file in fileMetaData) {
			const numFiles = fileMetaData[file].TickTickTasks ? fileMetaData[file].TickTickTasks.length : 'TickTickTasks not found';
			fmdData.push(`${file}, ${numFiles}`);
		}


		const debugInfo = {
			general: {
				version: settings.version,
				baseURL: settings.baseURL,
				enableFullVaultSync: settings.enableFullVaultSync,
				debugMode: settings.debugMode,
				logLevel: settings.logLevel,
				fileLinksInTickTick: settings.fileLinksInTickTick,
				taskLinksInObsidian: settings.taskLinksInObsidian,
				bkupFolder: settings.bkupFolder,
				skipBackup: settings.skipBackup,
				numProjects: (await plugin.service.getProjects()).length,
				fileTasks: fmdData
			},
			defaults:
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
			noteSetting: {
				syncNotes: settings.syncNotes,
				noteDelimiter: settings.noteDelimiter
			}
		};
		return debugInfo;
	}

	async function generateDebug() {
		let debugInfo = await generateDebugInfoSubset();
		debugString = '```\n' + JSON.stringify(debugInfo, null, 2) + '\n```';
		showDebugInfo = true;
		log.debug(debugString);
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

	function openJournal() {
		const modal = new SyncJournalModal(plugin.app);
		modal.open();
	}

</script>

<div class="debug-options">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Debug mode</div>
			<div class="setting-item-description">Allow access to developer settings</div>
		</div>
		<div class="setting-item-control">
			<label class="checkbox-container" class:is-enabled={debugMode}>
				<input
					type="checkbox"
					bind:checked={debugMode}
					on:change={async () => {
							const logLevel = getSettings().logLevel;
							const newLevel = debugMode ? logLevel : 'info';
							updateSettings({ debugMode: debugMode , logLevel: newLevel});
							log.setLevel(newLevel);
							await plugin.saveSettings();
					  }}
				/>
			</label>
		</div>
	</div>

	{#if debugMode}
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Log Level</div>
				<div class="setting-item-description">Determine log level</div>
			</div>
			<div class="TTS-setting-item-control">
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

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Journal Retention</div>
			<div class="setting-item-description">Days to keep journal entries (1–7)</div>
		</div>
		<div class="TTS-setting-item-control">
			<input
				type="number"
				min="1"
				max="7"
				value={getSettings().journalRetentionDays}
				on:change={async (e) => {
					const val = Math.min(7, Math.max(1, parseInt(e.target.value, 10) || 3));
					updateSettings({ journalRetentionDays: val });
					await plugin.saveSettings();
				}}
			/>
		</div>
	</div>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">View Sync Journal</div>
			<div class="setting-item-description">Browse and export sync journal entries</div>
		</div>
		<div class="setting-item-control">
			<button class="mod-cta" on:click={openJournal}>
				View Journal
			</button>
		</div>
	</div>

</div>



