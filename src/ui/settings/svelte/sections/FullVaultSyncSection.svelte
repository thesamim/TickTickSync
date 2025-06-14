<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { ConfirmFullSyncModal } from '@/modals/ConfirmFullSyncModal';
	import { onMount } from 'svelte';
	import { getSettings, updateSettings } from '@/settings';

	export let open = false;
	export let plugin;

	let enableFullVaultSync: boolean = false;
	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	onMount(async () => {
		enableFullVaultSync = getSettings().enableFullVaultSync;

	});

	async function confirmFullSync() {
		const myModal = new ConfirmFullSyncModal(app, () => {
		});
		return await myModal.showModal();
	}

	async function handleFullVaultSyncChange(value: boolean) {
		let noticeString: string;
		if (!getSettings().enableFullVaultSync) {
			const bConfirmation = await confirmFullSync();
			if (bConfirmation) {
				enableFullVaultSync = true;
				noticeString = 'Full vault sync is enabled.';
			} else {
				enableFullVaultSync = false;
				noticeString = 'Full vault sync not enabled.';
			}
		} else {
			enableFullVaultSync = false;
			noticeString = 'Full vault sync is disabled.';
		}
		updateSettings({ enableFullVaultSync: enableFullVaultSync });
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
