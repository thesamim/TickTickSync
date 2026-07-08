<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import { getSettings, updateSettings, mergeDeviceLists } from '@/settings';
	import { getCurrentDeviceInfo, setCurrentDeviceInfo } from '@/db/device';
	import { db } from '@/db/dexie';
	import log from 'loglevel';

	export let plugin;
	export let open = false;

	const dispatch = createEventDispatcher();

	let currentDevice = getCurrentDeviceInfo();
	let devices = getSettings().devices;

	onMount(async () => {
		try {
			const onDiskData = await plugin.loadData();
			if (onDiskData?.devices && Array.isArray(onDiskData.devices)) {
				const merged = mergeDeviceLists(onDiskData.devices, getSettings().devices);
				if (JSON.stringify(merged) !== JSON.stringify(getSettings().devices)) {
					updateSettings({ devices: merged });
				}
				devices = merged;
			}
		} catch (e) {
			log.warn('Could not refresh devices from disk', e);
		}
	});

	let isEditingLabel = false;
	let editedLabel = currentDevice?.deviceLabel || '';
	let currentDeviceLabel = currentDevice?.deviceLabel || 'Unknown';

	function handleHeaderClick() {
		dispatch('toggle');
	}

	function startEditingLabel() {
		isEditingLabel = true;
		editedLabel = currentDevice?.deviceLabel || '';
	}

	function cancelEditingLabel() {
		isEditingLabel = false;
		editedLabel = currentDevice?.deviceLabel || '';
	}

	async function saveDeviceLabel() {
		if (!currentDevice || editedLabel.trim() === '') {
			return;
		}

		const trimmedLabel = editedLabel.trim();

		const meta = await db.meta.get('sync');
		if (meta) {
			meta.deviceLabel = trimmedLabel;
			await db.meta.put(meta);
		}

		setCurrentDeviceInfo({
			deviceId: currentDevice.deviceId,
			deviceLabel: trimmedLabel
		});

		currentDevice = { ...currentDevice, deviceLabel: trimmedLabel };
		currentDeviceLabel = trimmedLabel;

		const settings = getSettings();
		const updatedDevices = settings.devices.map(d =>
			d.deviceId === currentDevice.deviceId
				? { deviceId: d.deviceId, deviceLabel: trimmedLabel }
				: d
		);
		updateSettings({ devices: updatedDevices });
		await db.meta.update("sync", { devices: updatedDevices });
		devices = updatedDevices;

		isEditingLabel = false;

		await plugin.saveSettings();
	}

	function focus(node: HTMLElement) {
		node.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			saveDeviceLabel();
		} else if (event.key === 'Escape') {
			cancelEditingLabel();
		}
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
			<div class="setting-item-name">Current Device</div>
			<div class="setting-item-description">
				This device's identity
			</div>
		</div>
		<div class="setting-item-control">
			<div style="display: flex; flex-direction: column; gap: 0.5em;">
				<div style="display: flex; align-items: center; gap: 0.5em;">
					<strong>Label:</strong>
					{#if isEditingLabel}
						<input
							type="text"
							bind:value={editedLabel}
							on:keydown={handleKeydown}
							style="flex: 1; padding: 0.25em 0.5em;"
							use:focus
						/>
						<button
							class="mod-cta"
							on:click={saveDeviceLabel}
							style="padding: 0.25em 0.5em;"
						>
							Save
						</button>
						<button
							on:click={cancelEditingLabel}
							style="padding: 0.25em 0.5em;"
						>
							Cancel
						</button>
					{:else}
						<span>{currentDevice?.deviceLabel || 'Unknown'}</span>
						<button
							on:click={startEditingLabel}
							class="clickable-icon"
							style="padding: 0.25em 0.5em;"
							aria-label="Edit device label"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
						</button>
					{/if}
				</div>
				<div style="font-family: monospace; font-size: 0.9em; color: var(--text-muted);">
					<strong>ID:</strong> {currentDevice?.deviceId || 'Unknown'}
				</div>
			</div>
		</div>
	</div>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Known Devices</div>
			<div class="setting-item-description">
				All devices that have been used with this vault.
			</div>
		</div>
		<div class="setting-item-control">
			{#if devices.length === 0}
				<div style="color: var(--text-muted); font-style: italic;">
					No devices tracked yet
				</div>
			{:else}
				<div style="display: flex; flex-direction: column; gap: 0.5em;">
					{#each devices as device}
						<div style="padding: 0.5em; background: var(--background-secondary); border-radius: 4px;">
							<div>
								<strong>{device.deviceLabel}</strong>
								{#if currentDevice && device.deviceId === currentDevice.deviceId}
									<span style="color: var(--text-accent); font-size: 0.9em;">(current)</span>
								{/if}
							</div>
							<div style="font-family: monospace; font-size: 0.85em; color: var(--text-muted);">
								{device.deviceId}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</CollapsibleSection>
