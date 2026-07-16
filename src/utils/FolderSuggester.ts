import { App, TAbstractFile, TFolder, AbstractInputSuggest } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;

	constructor(inputEl: HTMLInputElement, app: App) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerCaseInputStr = query.toLowerCase();

		abstractFiles.forEach((folder: TAbstractFile) => {
			if (
				folder instanceof TFolder &&
				folder.path.toLowerCase().contains(lowerCaseInputStr)
			) {
				folders.push(folder);
			}
		});

		return folders;
	}

	renderSuggestion(value: TFolder, el: HTMLElement): void {
		el.setText(value.path);
	}

	selectSuggestion(value: TFolder, _evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = value.path;
		this.inputEl.trigger('input');
		this.close();
	}
}
