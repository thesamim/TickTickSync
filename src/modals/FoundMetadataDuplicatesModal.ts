import { App, Modal, Setting, Notice } from 'obsidian';
import TickTickSync from '@/main';
import log from 'loglevel';

type DuplicateMap = Record<string, string[]>;

export class FoundMetadataDuplicatesModal extends Modal {

	title = 'Found duplicate tasks in metadata';
duplicates: DuplicateMap;
plugin: TickTickSync;
result: boolean = false;
resolvePromise!: (value: (PromiseLike<boolean> | boolean)) => void;
selections: Record<string, string> = {};
	plan: Record<string, {keep: string, remove: string[]}> = {};
	confirmPhase: boolean = false;

constructor(app: App, plugin: TickTickSync, duplicates: DuplicateMap) {
		super(app);
		this.plugin = plugin;
		this.duplicates = duplicates;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.title);
		contentEl.createEl('p', { text: 'The same TickTick task id was found in multiple metadata entries. Choose the canonical file for each task. Other metadata entries will be removed.' });

		for (const taskId of Object.keys(this.duplicates)) {
			const files = this.duplicates[taskId];
			const section = contentEl.createEl('div', { cls: 'ts-dup-section' });

			// Load a short title for the task if available
			let titleSnippet = '(no cached title)';
			let rawTitle = '';
			try {
				const savedTask = this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
				if (savedTask && savedTask.title) {
					rawTitle = this.plugin.taskParser?.stripOBSUrl ? this.plugin.taskParser.stripOBSUrl(savedTask.title) : savedTask.title;
					titleSnippet = rawTitle.trim();
					if (titleSnippet.length > 15) titleSnippet = titleSnippet.substring(0, 15) + '...';
				}
			} catch (err) {
				log.debug('Could not load task title for', taskId, err);
			}

			const header = section.createEl('h4', { text: `Task: ${taskId} — "${titleSnippet}"` });
			if (rawTitle && rawTitle.length > 0) header.setAttr('title', rawTitle);

			const list = section.createEl('div', { cls: 'ts-dup-list' });
			files.forEach((filePath, idx) => {
				const row = list.createEl('div', { cls: 'ts-dup-row' });
				const radio = row.createEl('input') as HTMLInputElement;
				radio.type = 'radio';
				radio.name = `dup-meta-${taskId}`;
				radio.value = filePath;
				// default to currently assigned file if available
				try {
					const currentFileForTask = this.plugin.cacheOperation?.getFilepathForTask(taskId);
					if (currentFileForTask && currentFileForTask === filePath) {
						radio.checked = true;
						this.selections[taskId] = filePath;
					} else if (!this.selections[taskId] && idx === 0) {
						radio.checked = true;
						this.selections[taskId] = filePath;
					}
				} catch (err) {
					if (!this.selections[taskId] && idx === 0) {
						radio.checked = true;
						this.selections[taskId] = filePath;
					}
				}
				radio.onchange = () => { this.selections[taskId] = radio.value; };

				const label = row.createEl('span', { text: filePath });
			});
		}

		// First button: prepare summary and go to confirm phase
		new Setting(contentEl).addButton(next => {
			next.setClass('ts_button');
			next.setButtonText('Preview changes');
			next.onClick(() => {
				this.preparePlan();
				this.renderConfirm(contentEl);
			});
		});

		new Setting(contentEl).addButton(cancel => {
			cancel.setClass('ts_button');
			cancel.setButtonText('Cancel');
			cancel.onClick(() => {
				this.result = false;
				this.close();
			});
		});
	}

	private preparePlan() {
		this.plan = {};
		for (const taskId of Object.keys(this.duplicates)) {
			const files = this.duplicates[taskId];
			const keep = this.selections[taskId];
			this.plan[taskId] = { keep, remove: files.filter(f => f !== keep) };
		}
	}

	private renderConfirm(contentEl: HTMLElement) {
		this.confirmPhase = true;
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: 'Preview of metadata changes to be applied:' });
		for (const taskId of Object.keys(this.plan)) {
			const entry = this.plan[taskId];
			const div = this.contentEl.createEl('div', { cls: 'ts-plan-entry' });
			div.createEl('div', { text: `Task ${taskId}` });
			div.createEl('div', { text: `Keep: ${entry.keep}` });
			div.createEl('div', { text: `Remove from: ${entry.remove.join(', ')}` });
		}

		new Setting(this.contentEl).addButton(confirm => {
			confirm.setWarning();
			confirm.setButtonText('Apply changes');
			confirm.onClick(async () => {
				await this.handleConfirm();
				this.result = true;
				this.close();
			});
		});

		new Setting(this.contentEl).addButton(back => {
			back.setButtonText('Back');
			back.onClick(() => {
				this.confirmPhase = false;
				this.contentEl.empty();
				this.onOpen();
			});
		});
	}

	async handleConfirm() {
		try {
			for (const taskId of Object.keys(this.duplicates)) {
				const files = this.duplicates[taskId];
				const keep = this.selections[taskId];
				// Ensure the canonical file has the metadata entry
				const savedTask = this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
				if (!savedTask) {
					log.warn(`Task ${taskId} not found in cache; skipping metadata adjustments.`);
					continue;
				}
				// If keep doesn't contain the task metadata, add it
				const currentFileForTask = this.plugin.cacheOperation?.getFilepathForTask(taskId);
				if (!currentFileForTask || currentFileForTask !== keep) {
					try {
						await this.plugin.cacheOperation?.addTaskToMetadata(keep, savedTask);
					} catch (err) {
						log.warn('Failed to add task to canonical metadata', keep, taskId, err);
					}
				}
				// Remove task id from other metadata entries
				for (const filePath of files) {
					if (filePath === keep) continue;
					try {
						await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(filePath, taskId);
					} catch (err) {
						log.warn('Failed to remove duplicate task id from metadata', filePath, taskId, err);
					}
				}
			}
			await this.plugin.saveSettings();
			new Notice('Metadata duplicate cleanup complete.');
		} catch (err) {
			log.error('Error during metadata duplicate cleanup', err);
			new Notice(`Error during metadata duplicate cleanup: ${err}`, 5000);
		}
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
		this.resolvePromise(this.result);
	}

	public showModal(): Promise<boolean> {
		this.open();
		return new Promise((resolve) => (this.resolvePromise = resolve));
	}

}
