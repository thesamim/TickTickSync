<script lang="ts">
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';

	export let open = false;
	export let plugin;

	const dispatch = createEventDispatcher();

	function handleHeaderClick() {
		dispatch('toggle');
	}

	async function toggleArchived() {
		settingsStore.update((s) => ({ ...s, handleArchivedLists: !s.handleArchivedLists }));
		await plugin.saveSettings();
	}

	async function toggleDeleted() {
		settingsStore.update((s) => ({ ...s, handleDeletedLists: !s.handleDeletedLists }));
		await plugin.saveSettings();
	}

	async function updateFolder(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		settingsStore.update((s) => ({ ...s, archivedListsFolder: value }));
		await plugin.saveSettings();
	}
</script>

<CollapsibleSection
	title="Archived and deleted lists"
	shortDesc="Handle lists that were archived or removed in TickTick"
	open={open}
	on:headerClick={handleHeaderClick}
>
	<div class="Full vault sync">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Handle archived lists</div>
				<div class="setting-item-description">
					Ask what to do when a list is archived in TickTick (keep and stop syncing, move to a folder, or trash).
				</div>
			</div>
			<div class="setting-item-control">
				<label class="checkbox-container" class:is-enabled={$settingsStore.handleArchivedLists}>
					<input
						type="checkbox"
						checked={$settingsStore.handleArchivedLists}
						on:change={toggleArchived}
					/>
				</label>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Handle deleted lists</div>
				<div class="setting-item-description">
					Ask what to do when a list is deleted in TickTick (trash the file and clean the database).
				</div>
			</div>
			<div class="setting-item-control">
				<label class="checkbox-container" class:is-enabled={$settingsStore.handleDeletedLists}>
					<input
						type="checkbox"
						checked={$settingsStore.handleDeletedLists}
						on:change={toggleDeleted}
					/>
				</label>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Archived lists folder</div>
				<div class="setting-item-description">
					Folder to move archived list files into when you choose that option.
				</div>
			</div>
			<div class="setting-item-control">
				<input
					type="text"
					value={$settingsStore.archivedListsFolder ?? ''}
					on:change={updateFolder}
				/>
			</div>
		</div>
	</div>
</CollapsibleSection>
