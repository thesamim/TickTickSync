import { App, Modal, Setting } from 'obsidian';
import { getSyncJournal, clearJournal } from '@/sync/journal';
import log from '@/utils/logger';

export class SyncJournalModal extends Modal {
	entries: any[] = [];
	loading = true;

	constructor(app: App) {
		super(app);
	}

	async onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText('Sync Journal');

		contentEl.createEl('p', {
			text: 'Loading journal entries...',
			attr: { id: 'journal-loading' }
		});

		try {
			this.entries = await getSyncJournal();
		} catch {
			this.entries = [];
		}
		this.loading = false;
		this.render(contentEl);
	}

	render(contentEl: HTMLElement) {
		contentEl.empty();

		const count = contentEl.createEl('div', {
			text: `${this.entries.length} journal entr${this.entries.length === 1 ? 'y' : 'ies'}`
		});
		count.style.marginBottom = '0.5em';
		count.style.fontWeight = 'bold';

		const container = contentEl.createEl('div');
		container.style.maxHeight = '400px';
		container.style.overflowY = 'auto';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '4px';
		container.style.padding = '0.5em';
		container.style.marginBottom = '1em';
		container.style.fontSize = '12px';
		container.style.fontFamily = 'monospace';

		if (this.entries.length === 0) {
			container.createEl('div', { text: 'No journal entries found.' });
		} else {
			for (const entry of this.entries) {
				const row = container.createEl('div');
				row.style.borderBottom = '1px solid var(--background-modifier-border)';
				row.style.padding = '0.4em 0';

				const ts = new Date(entry.timestamp).toLocaleString();
				const devId = entry.deviceId ? entry.deviceId.slice(0, 8) : '?';
				const action = entry.action ?? '?';

				row.createEl('div', {
					text: `[${ts}] [${devId}] ${action}`
				});

				if (entry.details) {
					const detailsEl = row.createEl('pre');
					detailsEl.style.margin = '0.2em 0 0 1em';
					detailsEl.style.fontSize = '11px';
					detailsEl.style.color = 'var(--text-muted)';
					detailsEl.style.whiteSpace = 'pre-wrap';
					detailsEl.setText(JSON.stringify(entry.details, null, 2));
					// log.debug("Entry: ", entry.details)
				}
			}
		}

		const buttonGroup = contentEl.createEl('div');
		buttonGroup.style.display = 'flex';
		buttonGroup.style.gap = '0.5em';
		buttonGroup.style.justifyContent = 'flex-end';

		new Setting(buttonGroup)
			.addButton(btn => {
				btn.setButtonText('Save to JSON');
				btn.setCta();
				btn.onClick(() => this.saveToJson());
			})
			.addButton(btn => {
				btn.setButtonText('Clear Journal');
				btn.onClick(async () => {
					await clearJournal();
					this.entries = [];
					this.render(contentEl);
				});
			})
			.addButton(btn => {
				btn.setButtonText('Close');
				btn.onClick(() => this.close());
			});
	}

	private saveToJson() {
		const jsonString = JSON.stringify(this.entries, null, 2);
		const blob = new Blob([jsonString], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sync_journal_${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
	}
}
