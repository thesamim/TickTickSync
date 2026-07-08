import { App, Modal, Setting } from 'obsidian';
import { getSyncJournal, clearJournal } from '@/sync/journal';
import type { JournalEntry } from '@/db/schema';
import { getSettings } from '@/settings';

export class SyncJournalModal extends Modal {
	entries: JournalEntry[] = [];
	loading = true;
	deviceMap: Record<string, string> = {};

	constructor(app: App) {
		super(app);
	}

	async onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText('Sync journal');

		const settings = getSettings();
		for (const d of settings.devices) {
			this.deviceMap[d.deviceId] = d.deviceLabel;
		}

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

	private resolveLabel(deviceId: string): string {
		return this.deviceMap[deviceId] ?? deviceId.slice(0, 8);
	}

	render(contentEl: HTMLElement) {
		contentEl.empty();

		const count = contentEl.createDiv({
			text: `${this.entries.length} journal entr${this.entries.length === 1 ? 'y' : 'ies'}`
		});
		count.addClass('sync-journal-count');

		const container = contentEl.createDiv();
		container.addClass('sync-journal-container');

		if (this.entries.length === 0) {
			container.createDiv({ text: 'No journal entries found.' });
		} else {
			for (const entry of this.entries) {
				const row = container.createDiv();
				row.addClass('sync-journal-row');

				const ts = new Date(entry.timestamp).toLocaleString();
				const label = this.resolveLabel(entry.deviceId ?? '');
				const action = entry.action ?? '?';

				row.createDiv({
					text: `[${ts}] [${label}] ${action}`
				});

				if (entry.details) {
					const detailsEl = row.createEl('pre');
					detailsEl.addClass('sync-journal-details');
					detailsEl.setText(JSON.stringify(entry.details, null, 2));
				}
			}
		}

		const buttonGroup = contentEl.createDiv();
		buttonGroup.addClass('sync-journal-btn-group');

		new Setting(buttonGroup)
			.addButton(btn => {
				btn.setButtonText('Save to JSON');
				btn.setCta();
				btn.onClick(() => this.saveToJson());
			})
			.addButton(btn => {
				btn.setButtonText('Clear journal');
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
		const a = this.contentEl.createEl('a', { href: url, attr: { download: `sync_journal_${Date.now()}.json` } });
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose();
	}
}
