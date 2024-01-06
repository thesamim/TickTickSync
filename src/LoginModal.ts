import {App, Modal, Setting} from "obsidian";
import TickTickSync from "../main";
import {BrowserWindow, session} from "@electron/remote";

//TODO: Fix this MESS!
export class LoginModal extends Modal {
	title = 'TickTick Login';
	message = 	'Please use the TickTick login window to Login to TickTick.';
	cancelLabel = 'Exit without loging in';
	confirmLabel = 'Login Complete';
	result: boolean;
	onSubmit: (result: boolean) => void;
	resolvePromise: (value: (PromiseLike<boolean> | boolean)) => void;

	constructor(app: App,  onSubmit: (result: boolean) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Called automatically by the Modal class when modal is opened.
	 */
	onOpen() {
		const {titleEl, contentEl} = this;

		titleEl.setText(this.title);
		contentEl.createEl('p', {text: this.message});

		new Setting(contentEl).addButton(cancelBtn => {
			cancelBtn.setClass('ts_button');
			cancelBtn.setButtonText(this.cancelLabel);
			cancelBtn.onClick( () => {
				this.result = false;
				this.onSubmit(this.result);
				this.close();
			})
		})
		.addButton( confirmBtn => {
			confirmBtn.setClass('ts_button');
			confirmBtn.setWarning();
			confirmBtn.setButtonText(this.confirmLabel);
			confirmBtn.onClick( () => {
				this.result = true;
				this.onSubmit(this.result);
				this.close();
			})
		})
		this.loadLoginWindow(this);

	}

	/**
	 * Called automatically by the Modal class when modal is closed.
	 */
	onClose() {
		this.titleEl.empty();
		this.contentEl.empty();
		super.onClose()
		this.resolvePromise(this.result);
	}
	public showModal(): Promise<boolean> {
		this.open();
		return new Promise(
			(resolve) => (this.resolvePromise = resolve)
		);
	}
	private async loadLoginWindow(parent: this) {
		const url = `https://ticktick.com/signin`

		//Get a cookie!
		const window = new BrowserWindow({ show: false,
			width: 600,
			height: 800,
			webPreferences: {
				nodeIntegration: false, // We recommend disabling nodeIntegration for security.
				contextIsolation: true, // We recommend enabling contextIsolation for security.
				// see https://github.com/electron/electron/blob/master/docs/tutorial/security.md
			},
		});
		window.loadURL(url);
		window.once('ready-to-show', () => {
			window.show()
		})
		console.log("loaded.")
		window.on('closed', () => {
			session.defaultSession.cookies.get({domain: ".ticktick.com", name: "t"})
				.then((cookies) => {
					//TODO: The cookie magically gets used. I don't like blackmagic
					//      in the fullness of time, really need to manage it.
					console.log(cookies)
					console.log(cookies[0].name, cookies[0].value)
				}).catch((error) => {
				console.log(error)
				parent.close()
			})
			console.log("window closed");
		});
		console.log("end of click processing.")
	}
}
