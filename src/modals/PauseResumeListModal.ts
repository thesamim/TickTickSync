import { App, FuzzySuggestModal } from 'obsidian';
import type { PausableList } from '@/services/ListLifecycleService';

/**
 * Fuzzy picker used by the "Pause or resume a list" command.
 */
export class PauseResumeListModal extends FuzzySuggestModal<PausableList> {
	private lists: PausableList[];
	private onChoose: (list: PausableList) => void | Promise<void>;

	constructor(
		app: App,
		lists: PausableList[],
		onChoose: (list: PausableList) => void | Promise<void>
	) {
		super(app);
		this.lists = lists;
		this.onChoose = onChoose;
		this.setPlaceholder('Select a list to pause or resume');
	}

	getItems(): PausableList[] {
		return this.lists;
	}

	getItemText(item: PausableList): string {
		return item.paused ? `${item.name} (paused)` : item.name;
	}

	onChooseItem(item: PausableList): void {
		void this.onChoose(item);
	}
}
