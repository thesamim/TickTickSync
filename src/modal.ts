import { App, Modal ,Setting } from "obsidian";
import UltimateTickTickSyncForObsidian from "../main"


interface MyProject {
    id: string;
    name: string;
}

export class SetDefalutProjectInTheFilepathModal extends Modal {
    defaultProjectId: string
    defaultProjectName: string
    filepath:string
    plugin:UltimateTickTickSyncForObsidian
    
    
    constructor(app: App,plugin:UltimateTickTickSyncForObsidian, filepath:string) {
        super(app);
        this.filepath = filepath
        this.plugin = plugin
        this.open()
    }
    
    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h5', { text: 'Set default project for TickTick tasks in the current file' });
        
        this.defaultProjectId = await this.plugin.cacheOperation.getDefaultProjectIdForFilepath(this.filepath)
        this.defaultProjectName = await this.plugin.cacheOperation.getProjectNameByIdFromCache(this.defaultProjectId)
        console.log(this.defaultProjectId)
        console.log(this.defaultProjectName)
        const myProjectsOptions: MyProject | undefined = this.plugin.settings.TickTickTasksData?.projects?.reduce((obj, item) => {
            obj[(item.id).toString()] = item.name;
            return obj;
        }, {}
        );
        
        
        
        new Setting(contentEl)
        .setName('Default project')
        //.setDesc('Set default project for TickTick tasks in the current file')
        .addDropdown(component =>
            component
            .addOption(this.defaultProjectId,this.defaultProjectName)
            .addOptions(myProjectsOptions)
            .onChange((value)=>{
                console.log(`project id is ${value}`)
                //this.plugin.settings.defaultProjectId = this.result
                //this.plugin.settings.defaultProjectName = this.plugin.cacheOperation.getProjectNameByIdFromCache(this.result)
                //this.plugin.saveSettings()
                this.plugin.cacheOperation.setDefaultProjectIdForFilepath(this.filepath,value)
                this.plugin.setStatusBarText()
                this.close();
                
            })
            
            )
            
            
            
            
        }
        
        onClose() {
            let { contentEl } = this;
            contentEl.empty();
        }
    }
    