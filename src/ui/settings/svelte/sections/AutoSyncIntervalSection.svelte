<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { getSettings, updateSettings } from '@/settings';
	import { Notice } from 'obsidian';

	export let open = false;
	export let plugin;

	let automaticSynchronizationInterval: number = getSettings().automaticSynchronizationInterval;
	$: automaticSynchronizationIntervalString = automaticSynchronizationInterval.toString();
	let debounceTimeout: ReturnType<typeof setTimeout>;
	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	async function handleAutomaticSynchronizationIntervalChange(value: string) {
		const intervalNum = Number(value);
		if (isNaN(intervalNum) || !Number.isInteger(intervalNum)) {
			new Notice(`Wrong type, please enter a integer.`);
			return;
		}
		if (intervalNum !== 0 && intervalNum < 20) {
			new Notice(`The synchronization interval time cannot be less than 20 seconds.`);
			return;
		}
		updateSettings({ automaticSynchronizationInterval: intervalNum });
		await plugin.saveSettings();
		plugin.reloadInterval();
		new Notice('Settings have been updated.');
	}
</script>

<CollapsibleSection
	title="Automatic sync interval time"
	shortDesc="Sync interval setting"
	open={open}
	on:headerClick={handleHeaderClick}
>
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Automatic sync interval time</div>
			<div class="setting-item-description">Please specify the desired interval time, with seconds as the default
				unit. 0 for manual sync. The default setting is 300 seconds, which corresponds to syncing once every 5
				minutes. You can customize it, but it cannot be lower than 20 seconds.
			</div>
		</div>
		<div class="setting-item-control">
			<input
				id="sync-tag"
				type="text"
				bind:value={automaticSynchronizationInterval}
				Placeholder="Sync interval"
				on:input={(e: Event) => {
					if (debounceTimeout) clearTimeout(debounceTimeout);
					debounceTimeout = setTimeout(async () => {
						const target = e.target as HTMLInputElement;
						await handleAutomaticSynchronizationIntervalChange(target.value);
						}, 900);
				}}
			/>
		</div>
	</div>
</CollapsibleSection>
