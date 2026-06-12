import { App, Modal, Setting } from 'obsidian';
import TickTickSync from '@/main';
import { getSettings } from '@/settings';
import { getAllProjects } from "@/db/projects";
import { getAllFiles } from "@/db/files";
import { db } from "@/db/dexie";


interface MyProject {
	id: string;
	name: string;
}

export class SetDefaultProjectForFileModal extends Modal {
	defaultProjectId: string;
	defaultProjectName: string;
	filepath: string;
	plugin: TickTickSync;


	constructor(app: App, plugin: TickTickSync, filepath: string) {
		super(app);
		this.filepath = filepath;
		this.plugin = plugin;
		this.open();
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h5', { text: 'Set default project for TickTick tasks in the current file' });

		this.defaultProjectId = await this.plugin.fileTaskQueries.getDefaultProjectIdForFilepath(this.filepath);
		const projectRecord = this.defaultProjectId ? await db.projects.get(this.defaultProjectId) : undefined;
		this.defaultProjectName = projectRecord?.project?.name || this.defaultProjectId;
		// log.debug(this.defaultProjectId)
		// log.debug(this.defaultProjectName)
		const allFiles = await getAllFiles();
		const defaultProjectIds = allFiles.map(f => f.defaultProjectId).filter(id => !!id);
		const allProjects = await getAllProjects();
		const allowableProjects = allProjects.filter(project => !defaultProjectIds.includes(project.id));
		const myProjectsOptions: MyProject | undefined = allowableProjects.reduce((obj, item) => {
				// log.debug(obj, item.id, item.name)
				obj[item.id] = item.name;
				return obj;
			}, {}
		);

		new Setting(contentEl)
			.setName('Default project')
			//.setDesc('Set default project for TickTick tasks in the current file')
			.addDropdown(component =>
				component
					.addOption(this.defaultProjectId, this.defaultProjectName)
					.addOption('', '')
					.addOptions(myProjectsOptions)
					.onChange(async (value) => {
						await this.plugin.fileMetadataService?.updateFileMetadata(this.filepath, { defaultProjectId: value, TickTickTasks: [], TickTickCount: 0 });
						await this.plugin.setStatusBarText();
						this.close();
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
