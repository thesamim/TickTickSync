import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import TickTickSync from '@/main';
import { FileMap } from '@/services/fileMap';
import log from 'loglevel';
import { PlanExecutor } from '@/services/planExecutor';
import type { DuplicatePlan, PlanAction } from '@/services/planExecutor';

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
			// Build duplicate plan based on user selections
			const plans: DuplicatePlan[] = [];
			for (const taskId of Object.keys(this.duplicates)) {
				const files = this.duplicates[taskId];
				const keep = this.selections[taskId];
				const actions: PlanAction[] = [];
				for (const filePath of files) {
					if (filePath === keep) continue;
					actions.push({ action: 'delete', taskId, from: filePath, to: keep });
				}
				plans.push({ taskId, candidates: files, recommended: keep, actions });
			}

			const executor = new PlanExecutor(this.app, this.plugin);
			await executor.applyPlan(plans, 'manual');
		} catch (err) {
			log.error('Error building or applying duplicate plan: ', err);
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
