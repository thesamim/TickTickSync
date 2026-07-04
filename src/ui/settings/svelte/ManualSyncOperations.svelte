<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import type TickTickSync from '@/main';
	import { Notice, Setting, TFolder } from 'obsidian';
	import { FolderSuggest } from '@/utils/FolderSuggester';
	import { onMount } from 'svelte';
	import { validateNewFolder } from '@/utils/FolderUtils';

	export let plugin: TickTickSync;

	let folderOptions: Record<string, string> = {};
	let isCheckingDatabase = false;

	async function handleManualSync() {
		if (!getSettings().token) {
			new Notice('Please log in from settings first');
			return;
		}
		try {
			await plugin.scheduledSynchronization();
			new Notice('Sync completed.');
		} catch (error) {
			new Notice(`An error occurred while syncing: ${error}`);
		}
	}

	let debounceTimeout: ReturnType<typeof setTimeout>;

	function searchFolder(element: HTMLElement) {
		const setting = new Setting(element)
			.addSearch((search) => {
				search.setPlaceholder('Select or Create folder')
					.setValue(getSettings().bkupFolder);
				search.setValue(folderOptions[getSettings().bkupFolder]);
				new FolderSuggest(search.inputEl, plugin.app);
				search.onChange((value) => {
					if (debounceTimeout) clearTimeout(debounceTimeout);

					debounceTimeout = setTimeout(async () => {
						const newFolder = await validateNewFolder(value, "Backup");
						if (newFolder) {
							updateSettings({ bkupFolder: newFolder });
							await plugin.saveSettings();
						}
					}, 700);

				});
			});
	}



	function getFolderOptions() {
		const folders = plugin.app.vault.getAllFolders(true);
		const folderOptions: Record<string, string> = {};
		for (const folder of folders) {
			folderOptions[folder.path] = folder.name;
		}
		return folderOptions;
	}

	async function handleCheckDatabase() {
		isCheckingDatabase = true;
		document.body.style.cursor = 'wait';
		try {
			await plugin.service.checkDataBase();
		} finally {
			isCheckingDatabase = false;
			document.body.style.cursor = '';
		}
	}

	onMount(async () => {
		folderOptions = getFolderOptions();
	});

</script>

<div class="manual-operations">
	{#if getSettings().token}
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Manual sync</div>
				<div class="setting-item-description">Manually perform a synchronization task</div>
			</div>
			<div class="setting-item-control">
				<button class="mod-cta" on:click={handleManualSync} disabled={isCheckingDatabase}>
					Sync
				</button>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Check database</div>
				<div class="setting-item-description">
					Check for possible issues: sync error, file renaming not updated, or missed tasks not synchronized
				</div>
			</div>
			<div class="setting-item-control">
				<button
					class="mod-cta"
					on:click={handleCheckDatabase}
					disabled={isCheckingDatabase}>
					{isCheckingDatabase ? 'Checking...' : 'Check Database'}
				</button>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Backup TickTick data</div>
				<div class="setting-item-description">
					Click to backup TickTick data. The backed-up files will be stored in the selected directory of the
					Obsidian vault
				</div>
			</div>
			<div class="setting-item-control">
				<button
					class="mod-cta"
					on:click={() => plugin.service.backup()}
					disabled={isCheckingDatabase}>
					Backup
				</button>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Skip backup</div>
				<div class="setting-item-description">Skip backup on startup</div>
			</div>
			<div class="setting-item-control">
				<label class="checkbox-container" class:is-enabled={$settingsStore.skipBackup}>
					<input
						type="checkbox"
						checked={$settingsStore.skipBackup}
						on:change={async (e) => {
							updateSettings({ skipBackup: e.target.checked });
							await plugin.saveSettings();
						}}
					/>
				</label>
			</div>
		</div>
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Backup folder</div>
				<div class="setting-item-description">Choose the folder to store the backup files.</div>
			</div>
			<div class="setting-item-control flex-container">
				<div
					class="modal-form remove-padding remove-border fix-suggest"
					use:searchFolder
				>
				</div>
			</div>

		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Permanently delete soft-deleted tasks</div>
				<div class="setting-item-description">View and permanently remove soft-deleted task records from the database</div>
			</div>
			<div class="setting-item-control">
				<button class="mod-cta" on:click={async () => {
					const { CleanupDeletedTasksModal } = await import('@/modals/CleanupDeletedTasksModal');
					const deletedTasks = await plugin.taskRepository.getDeletedTasks();
					if (deletedTasks.length === 0) {
						new Notice('No soft-deleted tasks found.');
						return;
					}
					const modal = new CleanupDeletedTasksModal(plugin.app, deletedTasks);
					const selected = await modal.showModal();
					if (selected.length > 0) {
						await plugin.taskRepository.hardDeleteTasks(selected);
						new Notice(`Permanently deleted ${selected.length} task(s).`);
					}
				}} disabled={isCheckingDatabase}>
					Manage Deleted Tasks
				</button>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Recover soft-deleted tasks</div>
				<div class="setting-item-description">View and restore soft-deleted tasks back to their original or a different file</div>
			</div>
			<div class="setting-item-control">
				<button class="mod-cta" on:click={async () => {
					const { RecoverDeletedTasksModal } = await import('@/modals/RecoverDeletedTasksModal');
					const deletedTasks = await plugin.taskRepository.getDeletedTasks();
					if (deletedTasks.length === 0) {
						new Notice('No soft-deleted tasks found.');
						return;
					}
					const modal = new RecoverDeletedTasksModal(plugin.app, plugin, deletedTasks);
					await modal.showModal();
				}} disabled={isCheckingDatabase}>
					Recover Deleted Tasks
				</button>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Deleted Task Retention</div>
				<div class="setting-item-description">Days to keep soft-deleted tasks before auto-purge (1–31)</div>
			</div>
			<div class="TTS-setting-item-control">
				<input
					type="number"
					min="1"
					max="31"
					value={getSettings().deletedTaskRetentionDays}
					on:change={async (e) => {
						const val = Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 7));
						updateSettings({ deletedTaskRetentionDays: val });
						await plugin.saveSettings();
					}}
				/>
			</div>
		</div>
	{/if}
</div>
