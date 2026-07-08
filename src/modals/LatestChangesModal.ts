import { App, Modal, Setting } from 'obsidian';


export class LatestChangesModal extends Modal {
	title = 'TicTickSync -- Latest Changes.';
	cancelLabel = 'Cancel';
	confirmLabel = 'Got it.';
	message = '';
	result = false;
	notableChanges: string[][];
	onSubmit: (result: boolean) => void;
	resolvePromise!: (value: (PromiseLike<boolean> | boolean)) => void;


	constructor(app: App, notableChanges: string[][], onSubmit: (result: boolean) => void) {
		super(app);
		this.notableChanges = notableChanges;
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const notableChangesURL = 'https://github.com/thesamim/TickTickSync/wiki/Notable-Changes#';
		let { titleEl, contentEl } = this;
		titleEl.setText(this.title);

		let p1 = contentEl.createEl('p');
		p1.setText('The following are user experience affecting changes from prior versions of TickTickSync.');
		let p2 = contentEl.createEl('p');
		p2.createEl('strong', { text: 'Strongly' });
		p2.appendText(' recommend that you take a backup ASAP.');
		let changesText = contentEl.createEl('ol');
		this.notableChanges.forEach(notableChange => {
			let lineItem = changesText.createEl('li');
			lineItem.createEl('a', { href: `${notableChangesURL}${notableChange[2]}`, text: `${notableChange[0]}` });
			let holder = lineItem.createEl('ol');
			const changeLines = notableChange[1].split('\n');
			changeLines.forEach(line => {holder.createDiv({ text: `${line}` });})
		});

		new Setting(contentEl)
			.addButton(confirmBtn => {
				confirmBtn.setClass('ts_button');
				confirmBtn.setDestructive();
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
