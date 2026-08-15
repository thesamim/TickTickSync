import { App, Modal, Setting } from 'obsidian';

export type FileLocationConflictAction = 'move' | 'delete-misplaced' | 'delete-correct' | 'skip';

export class FileLocationConflictModal extends Modal {
	title = 'Misplaced project file';
	filePath: string;
	expectedPath: string;
	projectName: string;
	targetExists: boolean;
	result!: FileLocationConflictAction;
	onSubmit: (result: FileLocationConflictAction) => void;
	resolvePromise!: (value: (PromiseLike<FileLocationConflictAction> | FileLocationConflictAction)) => void;

	constructor(app: App, filePath: string, expectedPath: string, projectName: string, targetExists: boolean, onSubmit: (result: FileLocationConflictAction) => void) {
		super(app);
		this.filePath = filePath;
		this.expectedPath = expectedPath;
		this.projectName = projectName;
		this.targetExists = targetExists;
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText(this.title);

		const message =
			`A file matching project "${this.projectName}" was found at:\n\n` +
			`${this.filePath}\n\n` +
			`but it should be located at:\n\n` +
			`${this.expectedPath}\n\n` +
			(this.targetExists
				? 'A file already exists at the expected location. Moving will merge the two files.'
				: '');

		contentEl.createEl('p', { text: message });

		new Setting(contentEl).addButton(moveBtn => {
			moveBtn.setClass('ts_button');
			moveBtn.setButtonText(this.targetExists ? 'Move & Merge' : 'Move to correct location');
			moveBtn.onClick(() => {
				this.result = 'move';
				this.onSubmit(this.result);
				this.close();
			});
		});
		new Setting(contentEl).addButton(deleteBtn => {
			deleteBtn.setClass('ts_button');
			deleteBtn.buttonEl.addClass('mod-destructive');
			deleteBtn.setButtonText('Delete this file');
			deleteBtn.onClick(() => {
				this.result = 'delete-misplaced';
				this.onSubmit(this.result);
				this.close();
			});
		});
		if (this.targetExists) {
			new Setting(contentEl).addButton(deleteBtn => {
				deleteBtn.setClass('ts_button');
				deleteBtn.buttonEl.addClass('mod-destructive');
				deleteBtn.setButtonText('Delete file at correct location');
				deleteBtn.onClick(() => {
					this.result = 'delete-correct';
					this.onSubmit(this.result);
					this.close();
				});
			});
		}
		new Setting(contentEl).addButton(skipBtn => {
			skipBtn.setClass('ts_button');
			skipBtn.setButtonText('Skip');
			skipBtn.onClick(() => {
				this.result = 'skip';
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
		this.resolvePromise(this.result ?? 'skip');
	}

	public showModal(): Promise<FileLocationConflictAction> {
		this.open();
		return new Promise(
			(resolve) => (this.resolvePromise = resolve)
		);
	}
}
