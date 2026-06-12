import { App, Modal, Setting } from 'obsidian';

export interface OrphanItem {
	title: string;
	filePath?: string;
	projectName?: string;
}

export type OrphanAction = 'add' | 'delete' | 'cancel';

export class OrphanTaskModal extends Modal {
	title = 'Orphaned TickTick Tasks';

	message = 'The following tasks exist in TickTick but were not found in the local vault or database:';
	items: OrphanItem[] = [];
	action: OrphanAction = 'cancel';
	resolvePromise: (value: OrphanAction) => void;

	constructor(app: App, items: OrphanItem[]) {
		super(app);
		this.items = items;
	}

	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText(this.title);

		contentEl.createEl('p', { text: this.message });

		const groupedItems: Record<string, string[]> = {};
		this.items.forEach(item => {
			const group = item.filePath || item.projectName || 'Unknown';
			if (!groupedItems[group]) {
				groupedItems[group] = [];
			}
			groupedItems[group].push(item.title);
		});

		for (const [group, titles] of Object.entries(groupedItems)) {
			if (group !== 'Unknown' || Object.keys(groupedItems).length > 1) {
				contentEl.createEl('strong', { text: group, attr: { style: 'display: block; margin-top: 10px;' } });
			}
			const unorderedList = contentEl.createEl('ul', { attr: { style: 'margin-top: 5px;' } });
			titles.forEach((title) => {
				unorderedList.createEl('li', { text: title });
			});
		}

		contentEl.createEl('hr');

		const desc = contentEl.createEl('p', { text: 'What would you like to do with these tasks?', attr: { style: 'margin-bottom: 10px;' } });

		new Setting(contentEl)
			.addButton(cancelBtn => {
				cancelBtn.setClass('ts_button');
				cancelBtn.setButtonText('Cancel');
				cancelBtn.onClick(() => {
					this.action = 'cancel';
					this.close();
				});
			})
			.addButton(deleteBtn => {
				deleteBtn.setClass('ts_button');
				deleteBtn.setWarning();
				deleteBtn.setButtonText('Delete from TickTick');
				deleteBtn.onClick(() => {
					this.action = 'delete';
					this.close();
				});
			})
			.addButton(addBtn => {
				addBtn.setClass('ts_button');
				addBtn.setCta();
				addBtn.setButtonText('Add to File & DB');
				addBtn.onClick(() => {
					this.action = 'add';
					this.close();
				});
			});
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
		this.resolvePromise(this.action);
	}

	public showModal(): Promise<OrphanAction> {
		this.open();
		return new Promise((resolve) => (this.resolvePromise = resolve));
	}
}
