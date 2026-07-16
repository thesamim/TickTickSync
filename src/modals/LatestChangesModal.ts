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
		const notableChangesURL = 'https://thesamim.github.io/TickTickSync/changelog/#';
		let { titleEl, contentEl } = this;
		titleEl.setText(this.title);

		let tipEl = contentEl.createDiv({ cls: 'callout', attr: { 'data-callout': 'tip' } });
		let calloutTitle = tipEl.createDiv({ cls: 'callout-title' });
		calloutTitle.createDiv({ cls: 'callout-icon' });
		calloutTitle.createDiv({ cls: 'callout-title-inner', text: 'If TickTickSync provides value.' });
		let calloutContent = tipEl.createDiv({ cls: 'callout-content' });
		let p = calloutContent.createEl('p');
		let a = p.createEl('a', { href: 'https://ko-fi.com/O0C12398ZK', attr: { target: '_blank' } });
		a.createEl('img', { attr: {
			height: '36',
			style: 'border:0px;height:36px;',
			src: 'https://storage.ko-fi.com/cdn/kofi6.png?v=6',
			border: '0',
			alt: 'Buy Me a Coffee at ko-fi.com',
		}});

		let p1 = contentEl.createEl('p');
		p1.setText('The following are user experience affecting changes from prior versions of TickTickSync.');
		let p2 = contentEl.createEl('p');
		p2.createEl('strong', { text: 'Strongly' });
		p2.appendText(' recommend that you take a backup ASAP.');
		let changesText = contentEl.createEl('ol');
		this.notableChanges.forEach(notableChange => {
			let lineItem = changesText.createEl('li');
			const link = lineItem.createEl('a', { href: `${notableChangesURL}${notableChange[2]}` });
			// eslint-disable-next-line no-unsanitized/property -- trusted static content
			link.innerHTML = notableChange[0];
			let holder = lineItem.createEl('ol');
			const changeLines = notableChange[1].split('\n');
			changeLines.forEach(line => {
				const div = holder.createDiv();
				// eslint-disable-next-line no-unsanitized/property -- trusted static content
				div.innerHTML = line;
			})
		});

		new Setting(contentEl)
			.addButton(confirmBtn => {
				confirmBtn.setClass('ts_button');
				confirmBtn.buttonEl.addClass('mod-destructive');
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
		if (this.resolvePromise) {
			this.resolvePromise(this.result);
		}
	}

	public showModal(): Promise<boolean> {
		this.open();
		return new Promise(
			(resolve) => (this.resolvePromise = resolve)
		);
	}
}
