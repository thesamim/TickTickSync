import { App, Modal, Setting } from 'obsidian';


export class ConfirmFullSyncModal extends Modal {
	title = 'Full Vault Task Sync Confirmation';
	message = 'Are you sure you want to Sync ALL tasks. \n' +
		'Tasks that are currently "Items" of tasks will be ' +
		'converted to "Sub Tasks" of the containing Tasks.\n' +
		'The "Items" will not be deleted.\nPlease proceed with Caution.';
	cancelLabel = 'Cancel';
	confirmLabel = 'Confirm Full Vault Task Sync';
	result: boolean;
	onSubmit: (result: boolean) => void;
	resolvePromise: (value: (PromiseLike<boolean> | boolean)) => void;

	constructor(app: App, onSubmit: (result: boolean) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText(this.title);
		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl).addButton(cancelBtn => {
			cancelBtn.setClass('ts_button');
			cancelBtn.setButtonText(this.cancelLabel);
			cancelBtn.onClick(() => {
				this.result = false;
				this.onSubmit(this.result);
				this.close();
			});
		})
			.addButton(confirmBtn => {
				confirmBtn.setClass('ts_button');
				confirmBtn.setWarning();
				confirmBtn.setButtonText(this.confirmLabel);
				confirmBtn.onClick(() => {
					this.result = true;
					this.onSubmit(this.result);
					this.close();
				});
			});

	}

	/**
	 * Called automatically by the Modal class when modal is closed.
	 */
	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
		this.resolvePromise(this.result);
	}

	public showModal(): Promise<boolean> {
		this.open();
		return new Promise(
			(resolve) => (this.resolvePromise = resolve)
		);
	}
}
