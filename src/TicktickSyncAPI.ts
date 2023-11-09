import { App} from 'obsidian';
import TickTickSync from "../main";


type Event = {
    id: string;
    object_type: string;
    object_id: string;
    event_type: string;
    event_date: string;
    parent_project_id: string;
    parent_item_id: string | null;
    initiator_id: string | null;
    extra_data: Record<string, any>;
};

type FilterOptions = {
    event_type?: string;
    object_type?: string;
};

//TODO: This is just mostly pass through. Do we reall need it?
export class TickTickSyncAPI {
    app:App;
    plugin: TickTickSync;
    
    constructor(app:App, plugin:TickTickSync) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }
    
    //backup TickTick
    async getAllResources() {
        try {
            let data = this.plugin.tickTickRestAPI?.getAllResources();
            return data;
            
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch all resources due to network error');
        }
    }
    
    //backup TickTick
    async getAllTasks() {
        try {
            let data = this.plugin.tickTickRestAPI?.getAllTasks()
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch user resources due to network error');
        }
    }
    
    async getUserResource() {
        try {
            let data = this.plugin.tickTickRestAPI?.getUserResources()
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch user resources due to network error');
        }
    }
    
    
    
    
    
    async getNonObsidianAllTasks() {
        try{
            const allActivity = await this.plugin.tickTickRestAPI?.GetActiveTasks();
            // console.log("this is what we got: " + allActivity?.map(task => task.title));
            //client does not contain obsidian's activity
            // const filteredArray = allActivity.filter(obj => !obj.extra_data.client?.includes("obsidian"));
            // const filteredArray = allActivity.filter(obj => !obj.tags?.includes("obsidian"));
            const filteredArray = allActivity;
            return(filteredArray)
            
        }catch(err){
            console.error('An error occurred:', err);
        }
        
    }
    
    
    
    
    
    filterActivityTasks(events: Event[], options: FilterOptions): Event[] {
        return events.filter(event =>
            (options.event_type ? event.event_type === options.event_type : true) &&
            (options.object_type ? event.object_type === options.object_type : true)
            
            );
        };
        
        //get completed items activity
        //result {count:number,events:[]}
        async getCompletedItemsActivity() {
            const data = this.plugin.tickTickRestAPI?.getAllCompletedItems();
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch completed items due to network error');
        }
        

        //todo: this is getting all tasks
        //get uncompleted items activity
        //result {count:number,events:[]}
        async getUncompletedItemsActivity() : any[] {
            
            const data = this.plugin.tickTickRestAPI?.getTasks();
            
            return data;
        }
        
        
        //get non-obsidian completed event 
        //todo: this is getting all tasks
        async getNonObsidianCompletedItemsActivity() {
            const completedItemsActivity = await this.getCompletedItemsActivity()
            const completedItemsActivityEvents = completedItemsActivity.events
            //client does not contain obsidian's activity
            const filteredArray = completedItemsActivityEvents.filter(obj => !obj.extra_data.client.includes("obsidian"));
            return(filteredArray)
        }
        
        
        //get non-obsidian uncompleted event
        async getNonObsidianUncompletedItemsActivity() {
            const uncompletedItemsActivity = await this.getUncompletedItemsActivity()
            const uncompletedItemsActivityEvents = uncompletedItemsActivity.events
            //client does not contain obsidian's activity
            const filteredArray = uncompletedItemsActivityEvents.filter(obj => !obj.extra_data.client.includes("obsidian"));
            return(filteredArray)
        }
        
        async getUpdatedItemsActivity() {
            throw new Error("Updated Items call not implemented in TickTick. What do we need it for?")
        }
        // //get updated items activity
        // //result {count:number,events:[]}
        // async getUpdatedItemsActivity() {
        //     const accessToken = this.plugin.settings.TickTickAPIToken
        //     const url = 'https://api.TickTick.com/sync/v9/activity/get';
        //     const options = {
        //         method: 'POST',
        //         headers: {
        //             'Authorization': `Bearer ${accessToken}`,
        //             'Content-Type': 'application/x-www-form-urlencoded'
        //         },
        //         body: new URLSearchParams({
        //             'object_type': 'item',
        //             'event_type': 'updated'
        //         })
        //     };
        
        //     try {
        //         const response = await fetch(url, options);
        
        //         if (!response.ok) {
        //             throw new Error(`Failed to fetch updated items: ${response.status} ${response.statusText}`);
        //         }
        
        //         const data = await response.json();
        //         //console.log(data)
        //         return data;
        //     } catch (error) {
        //         console.error(error);
        //         throw new Error('Failed to fetch updated items due to network error');
        //     }
        // }
        
        
        //get non-obsidian updated event
        async getNonObsidianUpdatedItemsActivity() {
            const updatedItemsActivity = await this.getUpdatedItemsActivity()
            const updatedItemsActivityEvents = updatedItemsActivity.events
            //client does not contain obsidian's activity
            const filteredArray = updatedItemsActivityEvents.filter(obj => {
                const client = obj.extra_data && obj.extra_data.client;
                return !client || !client.includes("obsidian");
            });
            return(filteredArray)
        }
        
        async getProjectsActivity() {
            throw new Error("Project Activities no impmlemented in TickTick")
        }
        
        // //get completed items activity
        // //result {count:number,events:[]}
        // async getProjectsActivity() {
        //     const accessToken = this.plugin.settings.TickTickAPIToken
        //     const url = 'https://api.TickTick.com/sync/v9/activity/get';
        //     const options = {
        //         method: 'POST',
        //         headers: {
        //             'Authorization': `Bearer ${accessToken}`,
        //             'Content-Type': 'application/x-www-form-urlencoded'
        //         },
        //         body: new URLSearchParams({
        //             'object_type': 'project'
        //         })
        //     };
        
        //     try {
        //         const response = await fetch(url, options);
        
        //         if (!response.ok) {
        //             throw new Error(`Failed to fetch projects activities: ${response.status} ${response.statusText}`);
        //         }
        
        //         const data = await response.json();
        
        //         return data;
        //     } catch (error) {
        //         console.error(error);
        //         throw new Error('Failed to fetch projects activities due to network error');
        //     }
        // }
    }
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    