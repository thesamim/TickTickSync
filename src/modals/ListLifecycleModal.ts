import { App, Modal, Setting } from 'obsidian';
import type { IProject } from '@/api/types/Project';
import { getSettings } from '@/settings';

export type ListLifecycleAction =
	| { type: 'keep' }
	| { type: 'stop' }
	| { type: 'move'; folder: string }
	| { type: 'trash' };

export interface ListLifecycleItem {
	project: IProject;
	filePath?: string;
	reason: 'archived' | 'deleted';
}

/**
 * Ask the user what to do with an archived or deleted list.
 * Each list is presented with 4 choices, matching the requested behavior:
 * 1) Keep file and delete tasks / stop syncing tasks? (we offer keep+stop)
 * 2) Move file to a chosen folder
 * 3) Trash the file from the vault + clean DB (for deleted)
 */
export class ListLifecycleModal extends Modal {
	private items: ListLifecycleItem[] = [];
	private resolvePromise!: (value: Map<string, ListLifecycleAction>) => void;
	private actions: Map<string, ListLifecycleAction> = new Map();
	private folders: Map<string, string> = new Map();
	private confirmed = false;

	constructor(app: App, items: ListLifecycleItem[]) {
		super(app);
		this.items = items;
		// sensible defaults
		for (const item of items) {
			this.actions.set(item.project.id, { type: 'keep' });
		}
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		const defaultFolder = getSettings().archivedListsFolder || 'Archived';
		for (const item of this.items) {
			this.folders.set(item.project.id, defaultFolder);
		}
		titleEl.setText('Archived / deleted lists');

		contentEl.createEl('p', {
			text: 'Choose what the plugin should do with lists that were archived or removed in TickTick.'
		});

		for (const item of this.items) {
			const section = contentEl.createEl('div');
			section.style.marginTop = '12px';
			section.style.marginBottom = '12px';
			section.style.padding = '8px';
			section.style.border = '1px solid var(--background-modifier-border)';
			section.style.borderRadius = '6px';

			const header = section.createEl('div');
			header.style.display = 'flex';
			header.style.justifyContent = 'space-between';
			const name = header.createEl('strong', { text: item.project.name });
			header.createEl('span', { text: item.reason === 'archived' ? 'archived' : 'deleted' });

			if (item.filePath) {
				section.createEl('div', {
					text: `File: ${item.filePath}`,
					attr: { style: 'color: var(--text-muted); font-size: 0.9em;' }
				});
			}

			new Setting(section)
				.setName('Action')
				.addDropdown(dropdown => {
					dropdown
						.addOption('keep', '1) Keep file — stop syncing tasks')
						.addOption('stop', '1b) Keep file — keep but mark list as paused (no sync)')
						.addOption('move', '2) Move file to a folder')
						.addOption('trash', '3) Trash the file from the vault and clean DB')
						.setValue('keep')
						.onChange(value => {
							if (value === 'move') {
								const folder = this.folders.get(item.project.id) || defaultFolder;
								this.actions.set(item.project.id, { type: 'move', folder });
							} else {
								this.actions.set(item.project.id, { type: value } as ListLifecycleAction);
							}
						});
				})
				.addText(text => {
					text.setValue(defaultFolder)
						.setPlaceholder('Folder for archived lists (e.g. Archived)')
						.onChange(value => {
							this.folders.set(item.project.id, value);
							const current = this.actions.get(item.project.id);
							if (current?.type === 'move') {
								this.actions.set(item.project.id, { type: 'move', folder: value });
							}
						});
					// hide until move is selected? keep visible for simplicity
				});
		}

		new Setting(contentEl)
			.addButton(cancelBtn => {
				cancelBtn.setButtonText('Cancel');
				cancelBtn.onClick(() => {
					this.close();
				});
			})
			.addButton(confirmBtn => {
				confirmBtn.setButtonText('Apply');
				confirmBtn.buttonEl.addClass('mod-cta');
				confirmBtn.onClick(() => {
					this.confirmed = true;
					this.close();
				});
			});
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
		if (this.resolvePromise) {
			// Cancel / Escape / clicking outside aborts: resolve with no actions
			this.resolvePromise(this.confirmed ? this.actions : new Map());
		}
	}

	public showModal(): Promise<Map<string, ListLifecycleAction>> {
		this.open();
		return new Promise((resolve) => (this.resolvePromise = resolve));
	}
}
