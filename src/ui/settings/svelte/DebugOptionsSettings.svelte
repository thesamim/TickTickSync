<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import log from '@/utils/logger';
	import { onMount } from 'svelte';
	import {LOG_LEVEL} from '@/ui/settings/svelte/constants.svelte.js';
	import './SettingsStyles.css';

	export let plugin: TickTickSync;

	let debugMode: boolean = false;

	async function handleDebugModeChange(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		debugMode = checked;
		updateSettings({ debugMode: checked });
		await plugin.saveSettings();
	}

	onMount(async () => {
		debugMode = getSettings().debugMode;
	});
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
</div>



