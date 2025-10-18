import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import TickTickSync from '@/main';
import { FileMap } from '@/services/fileMap';
import log from 'loglevel';

type DuplicateMap = Record<string, string[]>;

export class FoundFileDuplicatesModal extends Modal {

	title = 'Found duplicate tasks in files';
duplicates: DuplicateMap;
plugin: TickTickSync;
result: boolean = false;
	resolvePromise!: (value: (PromiseLike<boolean> | boolean)) => void;
selections: Record<string, string> = {};

constructor(app: App, plugin: TickTickSync, duplicates: DuplicateMap) {
		super(app);
		this.plugin = plugin;
		this.duplicates = duplicates;
}


	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.title);

		contentEl.createEl('p', { text: 'The same TickTick task id was found in multiple files. Choose the canonical file for each task. Other occurrences will be removed (a backup is created).' });

		for (const taskId of Object.keys(this.duplicates)) {
			const files = this.duplicates[taskId];
			const section = contentEl.createEl('div', { cls: 'ts-dup-section' });
			// Try to load a short title snippet to help the user identify the task
			let titleSnippet = '';
			let rawTitle = '';
			try {
				const savedTask = this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
				if (savedTask && savedTask.title) {
					rawTitle = this.plugin.taskParser?.stripOBSUrl ? this.plugin.taskParser.stripOBSUrl(savedTask.title) : savedTask.title;
					titleSnippet = rawTitle.trim();
					if (titleSnippet.length > 15) titleSnippet = titleSnippet.substring(0, 15) + '...';
				} else {
					titleSnippet = '(no cached title)';
				}
			} catch (err) {
				log.debug('Could not load task title for', taskId, err);
				titleSnippet = '(unknown)';
			}
			const header = section.createEl('h4', { text: `Task: ${taskId} — "${titleSnippet}"` });
			if (rawTitle && rawTitle.length > 0) {
				header.setAttr('title', rawTitle);
			}

			const list = section.createEl('div', { cls: 'ts-dup-list' });
			files.forEach((filePath, idx) => {
				const row = list.createEl('div', { cls: 'ts-dup-row' });
				const radio = row.createEl('input') as HTMLInputElement;
				radio.type = 'radio';
				radio.name = `dup-${taskId}`;
				radio.value = filePath;
				if (idx === 0) {
					radio.checked = true;
					this.selections[taskId] = filePath;
				}
				radio.onchange = () => { this.selections[taskId] = radio.value; };

				const label = row.createEl('a', { text: filePath, href: '#' });
				label.addEventListener('click', async (e) => {
					e.preventDefault();
					try {
						const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
						if (file) {
							await this.app.workspace.getLeaf().openFile(file);
						}
					} catch (err) {
						log.error('Could not open file: ', filePath, err);
					}
				});

			});
		}

		new Setting(contentEl).addButton(ok => {
			ok.setClass('ts_button');
			ok.setButtonText('Confirm and remove duplicates');
			ok.setWarning();
			ok.onClick(async () => {
				await this.handleConfirm();
				this.result = true;
				this.close();
			});
		});

		new Setting(contentEl).addButton(cancel => {
			cancel.setClass('ts_button');
			cancel.setButtonText('Cancel');
			cancel.onClick(() => {
				this.result = false;
				this.close();
			});
		});

	}


	async handleConfirm() {
		try {
			for (const taskId of Object.keys(this.duplicates)) {
				const files = this.duplicates[taskId];
				const keep = this.selections[taskId];
				for (const filePath of files) {
					if (filePath === keep) continue;
					const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
					if (!file) {
						log.warn(`File ${filePath} not found when trying to remove duplicate ${taskId}`);
						continue;
					}
					// create a timestamped backup (suffix inserted before extension)
					try {
						const original = await this.app.vault.read(file);
						const now = new Date();
						const ts = now.toISOString().replace(/[:.]/g, '-');
						let bkpPath = '';
						if (file.path.toLowerCase().endsWith('.md')) {
							// Change extension to .bkup to avoid Obsidian treating backups as markdown files
							bkpPath = file.path.replace(/(\.md)$/i, `.tickticksync-dup-bak-${ts}.bkup`);
						} else {
							bkpPath = `${file.path}.tickticksync-dup-bak-${ts}.bkup`;
						}
						await this.app.vault.create(bkpPath, original);
					} catch (err) {
						log.warn('Could not create backup for', filePath, err);
					}

					// remove the task block from the file via FileMap
					try {
						const fileMap = new FileMap(this.app, this.plugin, file);
						await fileMap.init();
						fileMap.deleteTask(taskId);
						const newContent = fileMap.getFileLines();
						await this.app.vault.modify(file, newContent);
						// update metadata
						try {
							await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(filePath, taskId);
						} catch (err) {
							log.warn('Failed to update metadata after removing duplicate', filePath, taskId, err);
						}
					} catch (err) {
						log.error('Failed to remove duplicate task from file', filePath, taskId, err);
					}
				}
			}
			await this.plugin.saveSettings();
			new Notice('Duplicate cleanup complete. Timestamped backups were created for modified files.');
		} catch (err) {
			log.error('Error cleaning up duplicates: ', err);
			new Notice(`Error cleaning up duplicates: ${err}`, 5000);
		}
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
		this.resolvePromise(this.result);
	}

	public showModal(): Promise<boolean> {
		this.open();
		return new Promise((resolve) => (this.resolvePromise = resolve));
	}

}
