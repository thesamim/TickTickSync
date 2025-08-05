<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { ConfirmFullSyncModal } from '@/modals/ConfirmFullSyncModal';
	import { onMount } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import { get } from 'svelte/store';

	export let open = false;
	export let plugin;

	let enableFullVaultSync: boolean = false;
	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	// Use store subscription
	$: enableFullVaultSync = $settingsStore.enableFullVaultSync;

	async function confirmFullSync() {
		const myModal = new ConfirmFullSyncModal(app, () => {
		});
		return await myModal.showModal();
	}

	async function handleFullVaultSyncChange(value: boolean) {
		let noticeString: string;
		if (!$settingsStore.enableFullVaultSync) {
			const bConfirmation = await confirmFullSync();
			if (bConfirmation) {
				// enable, update store
				settingsStore.update((s) => ({ ...s, enableFullVaultSync: true }));
				noticeString = 'Full vault sync is enabled.';
			} else {
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
				<label class="toggle-switch">
					<input
						type="checkbox"
						bind:checked={enableFullVaultSync}
						on:change={async (e) => {
							const checked = e.target.checked;
							await handleFullVaultSyncChange(checked)
					  }}
					/>
					<span class="slider"></span>
				</label>
			</div>
		</div>
	</div>
</CollapsibleSection>
