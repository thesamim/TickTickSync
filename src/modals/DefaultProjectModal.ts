import { App, Modal, Setting } from "obsidian";
import TickTickSync from "@/main"
import {getSettings} from "@/settings";


interface MyProject {
    id: string;
    name: string;
}

export class SetDefaultProjectForFileModal extends Modal {
    defaultProjectId: string
    defaultProjectName: string
    filepath: string
    plugin: TickTickSync


    constructor(app: App, plugin: TickTickSync, filepath: string) {
        super(app);
        this.filepath = filepath
        this.plugin = plugin
        this.open()
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h5', { text: 'Set default project for TickTick tasks in the current file' });

        this.defaultProjectId = await this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(this.filepath)
        this.defaultProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(this.defaultProjectId)
        // console.log(this.defaultProjectId)
        // console.log(this.defaultProjectName)
        const fileMetadata = getSettings().fileMetadata;
        const defaultProjectIds = Object.values(fileMetadata).map(meta => meta.defaultProjectId);
        const allowableProjects = getSettings().TickTickTasksData?.projects?.filter(project => !defaultProjectIds.includes(project.id));
        const myProjectsOptions: MyProject | undefined = allowableProjects.reduce((obj, item) => {
                // console.log(obj, item.id, item.name)
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
					.addOption("","")
                    .addOptions(myProjectsOptions)
                    .onChange(async (value) => {
                        await this.plugin.cacheOperation?.setDefaultProjectIdForFilepath(this.filepath, value)
                        await this.plugin.setStatusBarText()
                        this.close();
                    })

            )




    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}
