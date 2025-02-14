import { App, Modal, Setting } from 'obsidian';


export class LatestChangesModal extends Modal {
	title = 'TicTickSync -- Latest Changes.';
	cancelLabel = 'Cancel';
	confirmLabel = 'Got it.';
	message = '';
	result: boolean;
	intro = '<p>The following are user experience affecting changes from prior versions of TickTickSync.</p><p><strong>Strongly</strong> recommend that you take a backup ASAP.</p>';
	notableChanges: string[][];
	onSubmit: (result: boolean) => void;
	resolvePromise: (value: (PromiseLike<boolean> | boolean)) => void;


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

		let changesText = contentEl.createEl('p');
		changesText.innerHTML = `${this.intro}`;
		changesText = contentEl.createEl('ol');
		this.notableChanges.forEach(notableChange => {
			let lineItem = changesText.createEl('li');
			lineItem.createEl('a', { href: `${notableChangesURL}${notableChange[2]}`, text: `${notableChange[0]}` });
			let holder = lineItem.createEl('ol');
			holder.createEl('p', { text: `${notableChange[1]}` });
		});

		new Setting(contentEl)
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
