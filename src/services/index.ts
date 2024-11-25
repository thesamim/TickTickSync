import TickTickSync from "@/main";
import {Tick} from "@/api";


//TODO: encapsulate all api and cache
export class TickTickService {
	plugin: TickTickSync;
	initialized: boolean = false;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	async login(baseUrl: string, username: string, password: string):
		Promise<{ inboxId: string; token: string } | null> {
		try {
			const api = new Tick({
				username: username,
				password: password,
				baseUrl: baseUrl,
				token: "",
				checkPoint: 0
			});
			//try login
			return await api.login();
		} catch (error) {
			console.error(error);
		}
		return null;
	}

}
