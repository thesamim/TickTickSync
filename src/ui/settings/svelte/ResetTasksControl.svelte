<script lang="ts">
	import { resetTasks } from '@/ui/settings/utils/ResetSynchronization';
	export let isWorking: boolean;
	export let resetTasksText: string;
	export let plugin;
	export let setIsWorking: (val: boolean) => void;

	let showResetModal = false;
	let modalWorking = false;

	async function onReset() {
		showResetModal = true;
		modalWorking = false;
	}
	function closeModal() {
		if (!modalWorking) showResetModal = false;
	}
	async function confirmReset() {
		modalWorking = true;
		try {
			await resetTasks(plugin, setIsWorking);
		} finally {
			showResetModal = false;
			modalWorking = false;
		}
	}
</script>

<div class="setting-item">
	<div class="setting-item-info">
		<div class="setting-item-name">Reset Tasks</div>
		<div class="setting-item-description">
			Do you want to {resetTasksText}
			<br>
			<em>
				Caution: This will take some time and update Tasks from TickTick to Obsidian and Obsidian to TickTick.
			</em>
		</div>
	</div>
	<div class="setting-item-control">
		<button
			disabled={isWorking}
			class="mod-cta"
			on:click={onReset}>
			Reset Tasks.
		</button>
	</div>
</div>

{#if showResetModal}
	<div
		class="local-modal-backdrop"
		on:click={modalWorking ? undefined : closeModal}
		style={modalWorking ? 'cursor: wait;' : ''}
	></div>
	<div
		class="local-modal-dialog"
		role="dialog"
		aria-modal="true"
		style={modalWorking ? 'cursor: wait;' : ''}
	>
		<div class="local-modal-content">
			<h2>Confirm Reset</h2>
			<p>Do you <strong>REALLY</strong> want to {resetTasksText}?</p>
			<p style="color:var(--text-warning);"><em>This will sync everything and can take a while.</em></p>
			<div class="local-modal-actions">
				<button class="mod-cta"
					on:click={confirmReset}
					disabled={modalWorking}>
					{modalWorking ? 'Resetting...' : 'Yes, reset'}
				</button>
				<button
					style="margin-left:1em;"
					on:click={closeModal}
					disabled={modalWorking}
				>
					No, cancel
				</button>
			</div>
		</div>
	</div>
{/if}
