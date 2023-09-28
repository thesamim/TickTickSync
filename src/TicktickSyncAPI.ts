import { App} from 'obsidian';
import UltimateTickTickSyncForObsidian from "../main";


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

export class TickTickSyncAPI {
    app:App;
    plugin: UltimateTickTickSyncForObsidian;
    
    constructor(app:App, plugin:UltimateTickTickSyncForObsidian) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }
    
    //backup TickTick
    async getAllResources() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/sync';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                sync_token: "*",
                resource_types: '["all"]'
            })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch all resources: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch all resources due to network error');
        }
    }
    
    //backup TickTick
    async getUserResource() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/sync';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                sync_token: "*",
                resource_types: '["user_plan_limits"]'
            })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch all resources: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(data)
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch user resources due to network error');
        }
    }
    
    
    
    //update user timezone
    async updateUserTimezone() {
        const unixTimestampString: string = Math.floor(Date.now() / 1000).toString();
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/sync';
        const commands = [
            {
                'type': "user_update",
                'uuid': unixTimestampString,
                'args': { 'timezone': 'Asia/Shanghai' },
            },
        ];
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ commands: JSON.stringify(commands) })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch all resources: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(data)
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch user resources due to network error');
        }
    }
    
    //get activity logs
    //result {count:number,events:[]}
    async getAllActivityEvents() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const headers = new Headers({
            Authorization: `Bearer ${accessToken}`
        });
        
        try {
            const response = await fetch('https://api.TickTick.com/sync/v9/activity/get', {
            method: 'POST',
            headers,
            body: JSON.stringify({})
        });
        
        if (!response.ok) {
            throw new Error(`API returned error status: ${response.status}`);
        }
        
        const data = await response.json();
        
        return data;
    } catch (error) {
        throw error;
    }
}

async getNonObsidianAllActivityEvents() {
    try{
        const allActivity = await this.getAllActivityEvents()
        //console.log(allActivity)
        const allActivityEvents = allActivity.events
        //client does not contain obsidian's activity
        const filteredArray = allActivityEvents.filter(obj => !obj.extra_data.client?.includes("obsidian"));
        //console.log(filteredArray)
        return(filteredArray)
        
    }catch(err){
        console.error('An error occurred:', err);
    }
    
}





filterActivityEvents(events: Event[], options: FilterOptions): Event[] {
    return events.filter(event =>
        (options.event_type ? event.event_type === options.event_type : true) &&
        (options.object_type ? event.object_type === options.object_type : true)
        
        );
    };
    
    //get completed items activity
    //result {count:number,events:[]}
    async getCompletedItemsActivity() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/activity/get';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'object_type': 'item',
                'event_type': 'completed'
            })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch completed items: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch completed items due to network error');
        }
    }
    
    
    
    //get uncompleted items activity
    //result {count:number,events:[]}
    async getUncompletedItemsActivity() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/activity/get';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'object_type': 'item',
                'event_type': 'uncompleted'
            })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch uncompleted items: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch uncompleted items due to network error');
        }
    }
    
    
    //get non-obsidian completed event
    async getNonObsidianCompletedItemsActivity() {
        const accessToken = this.plugin.settings.TickTickAPIToken
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
    
    
    //get updated items activity
    //result {count:number,events:[]}
    async getUpdatedItemsActivity() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/activity/get';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'object_type': 'item',
                'event_type': 'updated'
            })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch updated items: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            //console.log(data)
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch updated items due to network error');
        }
    }
    
    
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
    
    
    //get completed items activity
    //result {count:number,events:[]}
    async getProjectsActivity() {
        const accessToken = this.plugin.settings.TickTickAPIToken
        const url = 'https://api.TickTick.com/sync/v9/activity/get';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'object_type': 'project'
            })
        };
        
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch projects activities: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return data;
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch projects activities due to network error');
        }
    }
    
}





















