<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import { resetTasks } from '@/ui/settings/utils/ResetSynchronization';
	import type TickTickSync from '@/main';
	import './SettingsStyles.css';
	import { onMount } from 'svelte';

	export let plugin: TickTickSync;

	let isWorking: boolean = false;
	let syncNotes: boolean = false;
	let resetNotesText: string = '';
	$: resetNotesText = syncNotes
		? 'Get all Notes from TickTick?'
		: 'Remove all Notes from Obsidian? (This will not delete Notes in TickTick)';

	let delimiterOption: 'none' | 'custom' = 'none';
	let customDelimiter: string = ''; // e.g., "---", "**", etc.
	let previewExample = '';

	// Load current settings on mount
	onMount(() => {
		const settings = getSettings();
		syncNotes = settings.syncNotes;
		if (settings.noteDelimiter === '' || settings.noteDelimiter == null) {
			delimiterOption = 'none';
			customDelimiter = '';
		} else {
			delimiterOption = 'custom';
			customDelimiter = settings.noteDelimiter;
		}
		updatePreview();
	});


	// Handle when radio is changed
	function handleOptionChange(option: 'none' | 'custom') {
		delimiterOption = option;
		if (option === 'none') {
			customDelimiter = '';
			saveDelimiter('');
		} else if (!customDelimiter) {
			customDelimiter = '---'; // some sane default for custom input
			saveDelimiter(customDelimiter);
		}
		updatePreview();
	}

	// Save the delimiter to settings
	async function saveDelimiter(value: string) {
		updateSettings({ noteDelimiter: value });
		await plugin.saveSettings();
	}

	// Handle when custom field changes
	function handleCustomChange(e: Event) {
		const input = e.target as HTMLInputElement;
		customDelimiter = input.value;
		saveDelimiter(customDelimiter);
		updatePreview();
	}

	// Example preview
	function updatePreview() {
		previewExample =
			delimiterOption === 'none'
				? '☐ Task Title \n   Note 1\n   Note 2'
				: `☐ Task Title \n   ${customDelimiter}\n   Note 1\n   Note 2\n   ${customDelimiter}`;

	}


</script>
<div class="{isWorking ? 'wait-cursor' : 'default-cursor'}">
	<div class="notes-settings ">
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Sync Notes</div>
				<div class="setting-item-description">Synchronize Notes</div>
			</div>
			<div class="setting-item-control">
				<label class="toggle-switch">
					<input
						type="checkbox"
						bind:checked={syncNotes}
						on:change={async (e) => {
							const checked = e.target.checked;
							syncNotes = checked; // Ensure local state stays in sync
							updateSettings({ syncNotes: checked });
							await plugin.saveSettings();
					  }}
					/>
					<span class="slider"></span>
				</label>
			</div>
		</div>

		{#if syncNotes}
			<div>Notes will be synchronized.</div>
			<br>


			<div class="setting-item delimiter-settings">
				<div class="setting-item-info">
					<div class="setting-item-name">Note Delimiter</div>
					<div class="setting-item-description">
						Choose how Notes are separated from a Task. <br>Changes will be applied on next update from
						TickTick.
					</div>
				</div>
				<div class="setting-item-control">
					<div class="note-delimiter-row">
						<div class="delimiter-radio-group">
							<label>
								<input
									type="radio"
									name="delimiterOption"
									value="none"
									checked={delimiterOption === "none"}
									on:change={() => handleOptionChange("none")}
								/>
								No delimiter
							</label>
							<label>
								<input
									type="radio"
									name="delimiterOption"
									value="custom"
									checked={delimiterOption === "custom"}
									on:change={() => handleOptionChange("custom")}
								/>
								Custom
							</label>
						</div>
						{#if delimiterOption === "custom"}
							<input
								type="text"
								placeholder="Enter delimiter (e.g., ---)"
								bind:value={customDelimiter}
								on:input={handleCustomChange}
								maxlength={61}
								style="margin-left:0.5em; width:10em"
							/>
						{/if}
						<div class="delimiter-preview">
							<p>Preview:</p>
							<span><pre>{previewExample}</pre></span>
						</div>
					</div>
				</div>
			</div>
		{:else }
			<div>Notes will be not synchronized.</div>
			<br>
		{/if}

		<br>
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Reset Notes</div>
				<div class="setting-item-description">Do you want to {resetNotesText} <br> <em> Caution: This will take
					some time and update Tasks from TickTick to Obsidian and Obsidian to TickTick.</em></div>
			</div>
			<div class="setting-item-control">
				<button
					disabled={isWorking}
					class="mod-cta"
					on:click={async () => {
						await resetTasks(plugin, (val) => isWorking = val);
					}}>
					Reset Notes.
				</button>
			</div>
		</div>

	</div>
</div>
