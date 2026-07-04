<script lang="ts">
	import { settingsStore } from '@/ui/settings/settingsstore';
	import type TickTickSync from '@/main';
	import { LINK_BEHAVIOR, LINK_VISIBILITY } from '@/ui/settings/svelte/constants.svelte.js';
	import './SettingsStyles.css';
	import ResetTasksControl from '@/ui/settings/svelte/ResetTasksControl.svelte';

	import { resetTasks } from '@/ui/settings/utils/ResetSynchronization'

	export let plugin: TickTickSync;

	let isWorking: boolean = false;
	let fileLinksInTickTick: string;
	let taskLinksInObsidian: string;
	let syncNotes: boolean;
	let keepProjectFolders: boolean;
	let linkBehaviorOptions: Record<string, string> = LINK_BEHAVIOR;
	let showKeepFoldersModal = false;
	let modalWorking = false;

	// Task display settings
	let readingLink: string;
	let readingId: boolean;
	let readingTag: boolean;
	let editingLink: string;
	let editingId: boolean;
	let editingTag: boolean;

	let linkVisibilityOptions: Record<string, string> = LINK_VISIBILITY;

	function setIsWorking(value: boolean) {
		isWorking = value;
	}

	let resetTasksText: string = '';
	$: resetTasksText = 'Update Tasks in TickTick and Obsidian?';

	async function confirmKeepFoldersChange() {
		modalWorking = true;
		try {
			await plugin.service.reorganizeFilesToFolders();
			await  resetTasks(plugin, setIsWorking)
		} catch (error) {
			console.error('Error reorganizing files:', error);
		} finally {
			showKeepFoldersModal = false;
			modalWorking = false;
		}
	}

	function closeKeepFoldersModal() {
		if (!modalWorking) showKeepFoldersModal = false;
	}

	// Use store subscription for values, and mirror them for form controls
	$: fileLinksInTickTick = $settingsStore.fileLinksInTickTick;
	$: taskLinksInObsidian = $settingsStore.taskLinksInObsidian;
	$: syncNotes = $settingsStore.syncNotes;
	$: keepProjectFolders = $settingsStore.keepProjectFolders;
	$: readingLink = $settingsStore.taskDisplay?.reading?.link ?? 'show';
	$: readingId = $settingsStore.taskDisplay?.reading?.id ?? false;
	$: readingTag = $settingsStore.taskDisplay?.reading?.tag ?? true;
	$: editingLink = $settingsStore.taskDisplay?.editing?.link ?? 'show';
	$: editingId = $settingsStore.taskDisplay?.editing?.id ?? true;
	$: editingTag = $settingsStore.taskDisplay?.editing?.tag ?? true;

	// Remove noteLink from options if needed
	$: if (!syncNotes) {
		const opt = { ...LINK_BEHAVIOR };
		delete opt['noteLink'];
		linkBehaviorOptions = opt;
	} else {
		linkBehaviorOptions = LINK_BEHAVIOR;
	}

	async function handleObsidianTaskLinkChange(value: string) {
		settingsStore.update((s) => ({ ...s, taskLinksInObsidian: value }));
		await plugin.saveSettings();
	}

	async function handleTickTickTaskLinkChange(value: string) {
		settingsStore.update((s) => ({ ...s, fileLinksInTickTick: value }));
		await plugin.saveSettings();
	}

	async function handleKeepProjectFoldersChange(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		settingsStore.update((s) => ({ ...s, keepProjectFolders: checked }));
		await plugin.saveSettings();
		
		if (checked) {
			showKeepFoldersModal = true;
		}
	}

	async function handleTaskDisplayChange(field: string, value: any) {
		settingsStore.update((s) => {
			const taskDisplay = s.taskDisplay ?? { reading: { link: 'show', id: false, tag: true }, editing: { link: 'show', id: true, tag: true } };
			const parts = field.split('.');
			return {
				...s,
				taskDisplay: {
					...taskDisplay,
					[parts[0]]: {
						...taskDisplay[parts[0] as 'reading' | 'editing'],
						[parts[1]]: value
					}
				}
			};
		});
		await plugin.saveSettings();
	}
</script>
<div class="{isWorking ? 'wait-cursor' : 'default-cursor'}">
	{#if showKeepFoldersModal}
	<div
		class="local-modal-backdrop"
		on:click={modalWorking ? undefined : closeKeepFoldersModal}
		style={modalWorking ? 'cursor: wait;' : ''}
	></div>
	<div
		class="local-modal-dialog"
		role="dialog"
		aria-modal="true"
		style={modalWorking ? 'cursor: wait;' : ''}
	>
		<div class="local-modal-content">
			<h2>Reorganize Files?</h2>
			<p>Would you like to reorganize existing task files into folders now?</p>
			<p>This will move plugin-managed files to match your TickTick folder structure.</p>
			<p style="color:var(--text-warning);"><em>Files without a default project will not be moved.</em></p>
			<div class="local-modal-actions">
				<button class="mod-cta"
					on:click={confirmKeepFoldersChange}
					disabled={modalWorking}>
					{modalWorking ? 'Reorganizing...' : 'Yes, reorganize'}
				</button>
				<button
					style="margin-left:1em;"
					on:click={closeKeepFoldersModal}
					disabled={modalWorking}
				>
					No, cancel
				</button>
			</div>
		</div>
	</div>
{/if}

{#if !syncNotes}
		<div class="setting-item-info">
			<hr>
			<div class="setting-item-name">Notice:</div>
			<p>Note syncing is disabled. Links can only be added to the Task text or not added at all.</p>
			<hr>
		</div>
	{/if}

	<div class="task-settings ">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Organize tasks by TickTick folders</div>
				<div class="setting-item-description">
					When enabled, tasks will be organized into Obsidian folders matching your TickTick folder structure.
					Files without a default project will not be moved.
				</div>
			</div>
			<div class="setting-item-control">
				<input
					type="checkbox"
					checked={keepProjectFolders}
					on:change={handleKeepProjectFoldersChange}
				/>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Task link handling in Obsidian</div>
				<div class="setting-item-description"> Add TickTick task link to Tasks in Obsidian
				</div>
			</div>
			<div class="setting-item-control">
				<select
					class="dropdown"
					id="sync-project"
					bind:value={taskLinksInObsidian}
					on:change={(e: Event) => handleObsidianTaskLinkChange((e.target as HTMLSelectElement).value)}
				>
					{#each Object.entries(linkBehaviorOptions) as [id, name]}
						<option value={id}>{name}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="task-settings ">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Task link handling in TickTick</div>
				<div class="setting-item-description"> Add Obsidian file link to Tasks in TickTick
				</div>
			</div>
			<div class="setting-item-control">
				<select
					class="dropdown"
					id="sync-project"
					bind:value={fileLinksInTickTick}
					on:change={(e: Event) => handleTickTickTaskLinkChange((e.target as HTMLSelectElement).value)}
				>
					{#each Object.entries(linkBehaviorOptions) as [id, name]}
						<option value={id}>{name}</option>
					{/each}
				</select>
			</div>
		</div>

	</div>

	<hr>

	<div class="task-settings ">
		<h3 class="setting-item-name" style="margin-bottom: 8px;">Task Display</h3>
		<p class="setting-item-description" style="margin-bottom: 12px;">
			Control which task elements are visible in Reading mode and Edit mode.
		</p>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">TickTick Link</div>
			</div>
			<div class="setting-item-control" style="gap: 8px; flex-wrap: wrap;">
				<label style="font-size: var(--font-small);">Reading:
					<select
						class="dropdown"
						bind:value={readingLink}
						on:change={(e: Event) => handleTaskDisplayChange('reading.link', (e.target as HTMLSelectElement).value)}
					>
						{#each Object.entries(linkVisibilityOptions) as [id, name]}
							<option value={id}>{name}</option>
						{/each}
					</select>
				</label>
				<label style="font-size: var(--font-small);">Edit:
					<select
						class="dropdown"
						bind:value={editingLink}
						on:change={(e: Event) => handleTaskDisplayChange('editing.link', (e.target as HTMLSelectElement).value)}
					>
						{#each Object.entries(linkVisibilityOptions) as [id, name]}
							<option value={id}>{name}</option>
						{/each}
					</select>
				</label>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">TickTick ID</div>
			</div>
			<div class="setting-item-control" style="gap: 8px; flex-wrap: wrap;">
				<label style="font-size: var(--font-small);">Reading:
					<input
						type="checkbox"
						bind:checked={readingId}
						on:change={(e: Event) => handleTaskDisplayChange('reading.id', (e.target as HTMLInputElement).checked)}
					/>
				</label>
				<label style="font-size: var(--font-small);">Edit:
					<input
						type="checkbox"
						bind:checked={editingId}
						on:change={(e: Event) => handleTaskDisplayChange('editing.id', (e.target as HTMLInputElement).checked)}
					/>
				</label>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">#ticktick Tag</div>
			</div>
			<div class="setting-item-control" style="gap: 8px; flex-wrap: wrap;">
				<label style="font-size: var(--font-small);">Reading:
					<input
						type="checkbox"
						bind:checked={readingTag}
						on:change={(e: Event) => handleTaskDisplayChange('reading.tag', (e.target as HTMLInputElement).checked)}
					/>
				</label>
				<label style="font-size: var(--font-small);">Edit:
					<input
						type="checkbox"
						bind:checked={editingTag}
						on:change={(e: Event) => handleTaskDisplayChange('editing.tag', (e.target as HTMLInputElement).checked)}
					/>
				</label>
			</div>
		</div>

		<br>
		<ResetTasksControl
			{isWorking}
			{resetTasksText}
			{plugin}
			{setIsWorking}
		/>

	</div>
</div>
