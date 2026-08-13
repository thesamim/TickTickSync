import { App, Modal, Setting } from 'obsidian';

export class CleanupDatabaseModal extends Modal {
	resolvePromise!: (value: boolean) => void;

	constructor(app: App, private files: string[]) {
		super(app);
	}

	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText('Clean up database');

		contentEl.createEl('p', { text: 'The following files are still present in the database but no longer exist in your vault. Remove them from the database?' });

		const listEl = contentEl.createDiv({ attr: { style: 'max-height: 400px; overflow-y: auto; margin-bottom: 10px;' } });
		for (const file of this.files) {
			listEl.createDiv({ text: file, cls: 'ts-database-cleanup-file' });
		}

		new Setting(contentEl)
			.addButton(cancelBtn => {
				cancelBtn.setClass('ts_button');
				cancelBtn.setButtonText('Cancel');
				cancelBtn.onClick(() => {
					this.resolvePromise(false);
					this.close();
				});
			})
			.addButton(confirmBtn => {
				confirmBtn.setClass('ts_button');
				confirmBtn.buttonEl.addClass('mod-destructive');
				confirmBtn.setButtonText(`Clean up database (${this.files.length})`);
				confirmBtn.onClick(() => {
					this.resolvePromise(true);
					this.close();
				});
			});
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
	}

	public showModal(): Promise<boolean> {
		this.open();
		return new Promise(resolve => (this.resolvePromise = resolve));
	}
}
