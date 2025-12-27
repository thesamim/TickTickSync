<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { getSettings, updateSettings } from '../../../../settings';

	export let plugin;
	export let open = false;

	const dispatch = createEventDispatcher();

	let deviceLabel = getSettings().deviceLabel;
	let deviceId = getSettings().deviceId;

	function handleHeaderClick() {
		dispatch('toggle');
	}

	function handleLabelChange(e) {
		const value = e.target.value;
		updateSettings({ deviceLabel: value });
	}
</script>

<CollapsibleSection
	title="Device Identity"
	shortDesc="Device Identity"
	open={open}
	on:headerClick={handleHeaderClick}
>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Device Name</div>
			<div class="setting-item-description">
				A friendly name for this device used in sync logs and metadata.
			</div>
		</div>
		<div class="setting-item-control">
			<input
				type="text"
				placeholder="e.g. Work Laptop"
				bind:value={deviceLabel}
				on:input={handleLabelChange}
			/>
		</div>
	</div>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Device ID</div>
			<div class="setting-item-description">
				Unique identifier for this installation.
			</div>
		</div>
		<div class="setting-item-control">
			<input
				type="text"
				value={deviceId}
				readonly
				class="setting-disabled"
				style="cursor: default;"
			/>
		</div>
	</div>
</CollapsibleSection>
