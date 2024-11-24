import {App, Modal, Setting} from "obsidian";


export class ConfirmFullSyncModal extends Modal {
	title = 'TicTickSync -- Latest Changes.';
	cancelLabel = 'Cancel';
	confirmLabel = 'Got it.';
	message = 	'<h1>There are new Task Limiting rules</h1>\n' +
		'<p>Tasks tagged with <strong>#ticktick</strong> will always be uploaded to TickTick. Tasks updated in Obsidian will always be updated' +
		' to TickTick. Sychronization from TickTick' +
		' applies to all tasks, <u>unless</u> a limiting <b>Project</b> or a limiting <b>tag</b> are set in Settings.</p>\n' +
		'<p>You can choose a limiting <strong>Project</strong> and/or a limiting <strong>Tag</strong>.</p>\n' +
		'<p>Given a project <b>LimitProject</b> and a tag <b>LimitTag</b>, the synchronization rules are:</p>\n' +
		'<table border="1">\n' +
		'<tbody>\n' +
		'<tr>\n' +
		'<th>Project</th>\n' +
		'<th>Tag</th>\n' +
		'<th>AND/OR</th>\n' +
		'<th>Result</th>\n' +
		'</tr>\n' +
		'<tr>\n' +
		'<td>LimitProject</td>\n' +
		'<td>N/A</td>\n' +
		'<td>N/A</td>\n' +
		'<td>Only the tasks in LimitProject will be synched bi-directionally</td>\n' +
		'</tr>\n' +
		'<tr>\n' +
		'<td>N/A</td>\n' +
		'<td>LimitTag</td>\n' +
		'<td>N/A</td>\n' +
		'<td>Only the tasks with the LimitTag tag will be synched bi-directionally</td>\n' +
		'</tr>\n' +
		'<tr>\n' +
		'<td>LimitProject</td>\n' +
		'<td>LimitTag</td>\n' +
		'<td>AND</td>\n' +
		'<td>Only the tasks that are both in the LimitProject and have the LimitTag tag will be bi-directionally synched</td>\n' +
		'</tr>\n' +
		'<tr>\n' +
		'<td>LimitProject</td>\n' +
		'<td>LimitTag</td>\n' +
		'<td>OR</td>\n' +
		'<td>All the tasks in LimitProject and All the tasks with the LimitTag tag will be bi-directionally sycnhed.</td>\n' +
		'</tr>\n' +
		'</tbody>\n' +
		'</table>\n' +
		'<p>&nbsp;</p>';

	result: boolean;
	onSubmit: (result: boolean) => void;
	resolvePromise: (value: (PromiseLike<boolean> | boolean)) => void;

	constructor(app: App,  onSubmit: (result: boolean) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const {titleEl, contentEl} = this;

		titleEl.setText(this.title);
		const changesText = contentEl.createEl('p', {text: this.message});
		changesText.innerHTML = this.message;



		new Setting(contentEl)
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
