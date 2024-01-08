import {App, Modal, Setting} from "obsidian";
import TickTickSync from "../main";


export class TaskDeletionModal extends Modal {
	title = 'Task Deletion Confirmation';
	message = 'The following Task(s) will be deleted because: ';
	cancelLabel = 'Cancel';
	confirmLabel = 'Confirm Deletion';
	taskTitles: string [] =  [];
	result: boolean;
	reason: string;
	onSubmit: (result: boolean) => void;
	resolvePromise: (value: (PromiseLike<boolean> | boolean)) => void;

	constructor(app: App, taskTitles: string[], reason: string, onSubmit: (result: boolean) => void) {
		super(app);
		this.taskTitles = taskTitles;
		this.reason = reason;
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const {titleEl, contentEl} = this;

		titleEl.setText(this.title);
		contentEl.createEl('p', {text: `${this.message}${this.reason}`});
		const unorderedList = contentEl.createEl('ul');
		this.taskTitles.forEach((task) => {unorderedList.createEl('li', {text: task})})

		
		new Setting(contentEl).addButton(cancelBtn => {
			cancelBtn.setClass('ts_button');
			cancelBtn.setButtonText(this.cancelLabel);
			cancelBtn.onClick( () => {
				this.result = false;
				this.onSubmit(this.result);
				this.close();
			})
		})
		.addButton( confirmBtn => {
			confirmBtn.setClass('ts_button');
			confirmBtn.setWarning();
			confirmBtn.setButtonText(this.confirmLabel);
			confirmBtn.onClick( () => {
				this.result = true;
				this.onSubmit(this.result);
				this.close();

			})
		})

	}

	/**
	 * Called automatically by the Modal class when modal is closed.
	 */
	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose()
		this.resolvePromise(this.result);
	}
	public showModal(): Promise<boolean> {
		this.open();
		return new Promise(
			(resolve) => (this.resolvePromise = resolve)
		);
	}
}
