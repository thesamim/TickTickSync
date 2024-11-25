import TickTickSync from "@/main";


//TODO: encapsulate all api and cache
export class TickTickService {
	plugin: TickTickSync;
	initialized: boolean = false;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	async login(): Promise<boolean> {
		return false;
	}

}
