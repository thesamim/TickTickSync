<script lang="ts">
	import { onMount } from 'svelte';
	import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
	import { createEventDispatcher } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import type { PausableList } from '@/services/ListLifecycleService';

	export let open = false;
	export let plugin;

	const dispatch = createEventDispatcher();

	let pausableLists: PausableList[] = [];
	let listsLoaded = false;

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

	async function refreshPausableLists() {
		if (!plugin?.listLifecycleService?.getPausableLists) return;
		pausableLists = await plugin.listLifecycleService.getPausableLists();
		listsLoaded = true;
	}

	async function togglePause(id: string, paused: boolean) {
		await plugin.listLifecycleService?.setListPaused(id, paused);
		await refreshPausableLists();
	}

	let wasOpen = open;
	// Refresh whenever the section is expanded so lists created since the
	// settings tab was opened show up in the pause list.
	$: if (open !== wasOpen) {
		wasOpen = open;
		if (open) {
			void refreshPausableLists();
		}
	}

	onMount(() => {
		void refreshPausableLists();
	});
</script>

<CollapsibleSection
	title="List lifecycle"
	shortDesc="Handle paused, archived and deleted lists"
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

		<div class="setting-item setting-item-heading">
			<div class="setting-item-info">
				<div class="setting-item-name">Paused lists</div>
				<div class="setting-item-description">
					Paused lists are not synced in either direction and their files stay where they are.
					You can also pause or resume a list from the command palette
					(<strong>Pause or resume a list</strong>).
				</div>
			</div>
		</div>

		{#if listsLoaded && pausableLists.length === 0}
			<div class="setting-item">
				<div class="setting-item-info">
					<div class="setting-item-description">No lists available to pause.</div>
				</div>
			</div>
		{:else}
			{#each pausableLists as list (list.id)}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name">{list.name}</div>
						<div class="setting-item-description">
							{list.paused ? 'Paused — not syncing' : 'Syncing'}
						</div>
					</div>
					<div class="setting-item-control">
						<label
							class="checkbox-container"
							class:is-enabled={list.paused}
							title="Pause syncing this list"
						>
							<input
								type="checkbox"
								checked={list.paused}
								on:change={() => togglePause(list.id, !list.paused)}
							/>
						</label>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</CollapsibleSection>
