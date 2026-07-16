import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import type { LocalTask } from '@/db/schema';

export class CleanupDeletedTasksModal extends Modal {
	items: { task: LocalTask; selected: boolean }[] = [];
	resolvePromise!: (value: string[]) => void;

	constructor(app: App, tasks: LocalTask[]) {
		super(app);
		this.items = tasks.map(t => ({ task: t, selected: false }));
	}

	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText('Permanently delete deleted tasks');

		contentEl.createEl('p', { text: 'Select tasks to permanently remove from the database:' });

		if (this.items.length === 0) {
			contentEl.createEl('p', { text: 'No deleted tasks found.' });
			new Setting(contentEl).addButton(btn => {
				btn.setButtonText('Close');
				btn.onClick(() => {
					this.resolvePromise([]);
					this.close();
				});
			});
			return;
		}

		new Setting(contentEl)
			.setName('Select all')
			.addToggle(toggle => {
				toggle.setValue(false);
				toggle.onChange(value => {
					this.items.forEach(item => item.selected = value);
					this.updateButtonText();
				});
			});

		const listEl = contentEl.createDiv({ attr: { style: 'max-height: 400px; overflow-y: auto; margin-bottom: 10px;' } });

		this.items.forEach(item => {
			const task = item.task;
			const title = task.task.title || 'Untitled';
			const file = task.file || 'No file';
			const deletedAt = new Date(task.updatedAt).toLocaleDateString();

			new Setting(listEl)
				.setName(title.length > 60 ? title.substring(0, 60) + '...' : title)
				.setDesc(`File: ${file} | Deleted: ${deletedAt}`)
				.addToggle(toggle => {
					toggle.setValue(item.selected);
					toggle.onChange(value => {
						item.selected = value;
						this.updateButtonText();
					});
				});
		});

		let deleteComponent: ButtonComponent | undefined;

		const buttonSetting = new Setting(contentEl);
		buttonSetting.addButton(btn => {
			btn.setButtonText('Delete permanently');
			btn.buttonEl.addClass('mod-destructive');
			btn.setDisabled(true);
			deleteComponent = btn;
			btn.onClick(() => {
				const selected = this.items
					.filter(i => i.selected)
					.map(i => i.task.taskId);
				if (selected.length === 0) return;
				this.resolvePromise(selected);
				this.close();
			});
		});

		buttonSetting.addButton(cancelBtn => {
			cancelBtn.setButtonText('Cancel');
			cancelBtn.onClick(() => {
				this.resolvePromise([]);
				this.close();
			});
		});

		this.updateButtonText = () => {
			const count = this.items.filter(i => i.selected).length;
			deleteComponent?.setButtonText(`Delete permanently (${count})`);
			deleteComponent?.setDisabled(count === 0);
		};
	}

	private updateButtonText: () => void = () => {};

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
	}

	public showModal(): Promise<string[]> {
		this.open();
		return new Promise((resolve) => (this.resolvePromise = resolve));
	}
}
