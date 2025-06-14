<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import log from '@/utils/logger';
	import { onMount } from 'svelte';
	import {LOG_LEVEL} from '@/ui/settings/svelte/constants.svelte.js';

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

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Skip backup</div>
				<div class="setting-item-description">Skip backup on startup</div>
			</div>
			<div class="setting-item-control">
				<label class="toggle-switch">
					<input
						type="checkbox"
						checked={getSettings().skipBackup}
						on:change={async (e) => {
              updateSettings({ skipBackup: e.target.checked });
              await plugin.saveSettings();
            }}
					/>
					<span class="slider"></span>
				</label>

			</div>
		</div>
	{/if}
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
</style>
