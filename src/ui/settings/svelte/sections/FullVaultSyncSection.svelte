<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { ConfirmFullSyncModal } from '@/modals/ConfirmFullSyncModal';
	import { onMount } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import { get } from 'svelte/store';

	export let open = false;
	export let plugin;

	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	// Use store subscription
	// $: enableFullVaultSync = $settingsStore.enableFullVaultSync; // Removed redundant local variable

	async function confirmFullSync() {
		const myModal = new ConfirmFullSyncModal(plugin.app, () => {
		});
		return await myModal.showModal();
	}

	async function handleToggle() {
		const targetValue = !$settingsStore.enableFullVaultSync;
		await handleFullVaultSyncChange(targetValue);
	}

	async function handleFullVaultSyncChange(value: boolean) {
		let noticeString: string;
		if (value) { // Use the passed value instead of checking store state before update
			const bConfirmation = await confirmFullSync();
			if (bConfirmation) {
				// enable, update store
				settingsStore.update((s) => ({ ...s, enableFullVaultSync: true }));
				noticeString = 'Full vault sync is enabled.';
			} else {
				// stay disabled
				settingsStore.update((s) => ({ ...s, enableFullVaultSync: false }));
				noticeString = 'Full vault sync not enabled.';
			}
		} else {
			settingsStore.update((s) => ({ ...s, enableFullVaultSync: false }));
			noticeString = 'Full vault sync is disabled.';
		}
		new Notice(noticeString);
		await plugin.saveSettings();
	}
</script>

<CollapsibleSection
	title="Full vault sync"
	shortDesc="Full vault settings"
	open={open}
	on:headerClick={handleHeaderClick}
>
	<div class="Full vault sync">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Full vault sync</div>
				<div class="setting-item-description">
					By default, only tasks marked with #TickTick are synchronized. If this option is turned on, all
					tasks in
					the vault will be synchronized.
					<p><b>NOTE: This includes all tasks that are currently Items of a task.</b></p></div>
			</div>
			<div class="setting-item-control">
				<label class="checkbox-container" class:is-enabled={$settingsStore.enableFullVaultSync}>
					<input
						type="checkbox"
						checked={$settingsStore.enableFullVaultSync}
						on:click|preventDefault={handleToggle}
					/>
				</label>
			</div>
		</div>
	</div>
</CollapsibleSection>
