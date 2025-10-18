import { App, Modal, Setting } from 'obsidian';
import TickTickSync from '@/main';
import type { IProject } from '@/api/types//Project';
import { getSettings } from '@/settings';


export class FoundDuplicatesModal extends Modal {
	title = 'Duplicate Projects/Lists found';

	message: string;
	cancelLabel = 'Cancel';
	confirmLabel = 'Abort Sync';
	projects: IProject[] = [];
	result: boolean = false;
	onSubmit: (result: boolean) => void;
	resolvePromise: (value: (PromiseLike<boolean> | boolean)) => void = (_v: PromiseLike<boolean> | boolean) => {};
	private plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync, projects: IProject[], onSubmit: (result: boolean) => void) {
		super(app);
		this.plugin = plugin;
		this.projects = projects;
		this.message = `The following duplicate Projects/Lists were found. On ${getSettings().baseURL},` +
			`please either choose one of those to contain the tasks from both lists, or rename one of the lists.`;
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText(this.title);

		contentEl.createEl('p', { text: `${this.message}` });
		// const unorderedList = contentEl.createEl('ul');
		// this.projects.forEach((project) => {unorderedList.createEl('li', {text: `${project.id} \t ${project.name}`})})

		const projectsTable = contentEl.createEl('table', 'projects-table');
		const projectsTableHead = projectsTable.createEl('thead');
		const projectsTableHeadRow = projectsTableHead.createEl('tr');
		const projectsTableHeadRowName = projectsTableHeadRow.createEl('th');
		const projectsTableHeadRowName2 = projectsTableHeadRow.createEl('th');
		projectsTableHeadRowName.setText('Project Name');
		projectsTableHeadRowName2.setText('Project ID');
		const projectsTableBody = projectsTable.createEl('tbody');

		this.projects.forEach((project) => {
			const row = projectsTableBody.createEl('tr');
			const projectId = row.createEl('td', 'project-table-border');
			const projectName = row.createEl('td', 'project-table-border');
			projectId.setText(project.name);
			projectName.setText(project.id);
		});


		new Setting(contentEl).addButton(confirmBtn => {
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



