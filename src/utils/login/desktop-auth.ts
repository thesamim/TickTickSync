import { Notice } from 'obsidian';

export class DesktopAuth {
	host;

	constructor(private app: any, host: string) {
		this.host = host;
		console.log('DesktopAuth constructor', host, this.host);
	}

	async authenticate(): Promise<any[]> {
		let finished = false;
		let timeoutId: NodeJS.Timeout | null = null;
		let pollId: NodeJS.Timeout | null = null;
		let win: any;

		const finish = (fn: (v?: any) => void, value?: any) => {
			if (!finished) {
				finished = true;
				cleanup();
				fn(value);
			}
		};

		const cleanup = () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (pollId) clearInterval(pollId);
			if (win) {
				win.webContents?.removeAllListeners('did-finish-load');
				win.webContents?.removeAllListeners('did-navigate');
				win.removeAllListeners('closed');
				if (!win.isDestroyed()) win.close();
			}
		};

		const tryGetCookies = async (): Promise<any[] | null> => {
			if (!win || win.isDestroyed()) return null;
			try {
				const cookies = await win.webContents.session.cookies.get({
					url: `https://${this.host}/`
				});
				return cookies;
			} catch {
				return null;
			}
		};

		const pickcookie = (cookies: any[]) => {
			if (!cookies) return null;
			const _cookies = cookies.find(
				(c) => c.name.toLowerCase() === 't'
			);
			console.log('cookies: ', JSON.stringify(_cookies, null, 2));
			return _cookies;
		};

		return new Promise((resolve, reject) => {
			(async () => {
				try {
					// Electron API access
					let electron, BrowserWindow;
					try {
						electron = (window as any).require?.('electron');
						BrowserWindow = electron.remote?.BrowserWindow || electron.BrowserWindow;
					} catch {
					}
					if (!BrowserWindow) throw new Error('Electron API not available');

					win = new BrowserWindow({
						width: 800,
						height: 600,
						show: true,
						webPreferences: {
							nodeIntegration: false,
							contextIsolation: true,
							webSecurity: true
						}
					});

					// Inject floating finish button on every load
					win.webContents.on('did-finish-load', async () => {
						try {
							await win.webContents.executeJavaScript(`
                (() => {
                  if (document.getElementById('__obs_finish_btn')) return;
                  const btn = document.createElement('button');
                  btn.id = '__obs_finish_btn';
                  btn.textContent = 'Finish & Save';
                  btn.style.position = 'fixed';
                  btn.style.bottom = '32px';
                  btn.style.right = '32px';
                  btn.style.zIndex = 99999;
                  btn.style.padding = '12px 24px';
                  btn.style.background = '#4b8bf4';
                  btn.style.color = '#fff';
                  btn.style.fontWeight = 'bold';
                  btn.style.border = 'none';
                  btn.style.borderRadius = '7px';
                  btn.style.boxShadow = '0 3px 12px #0007';
                  btn.style.cursor = 'pointer';
                  btn.onclick = () => { window.__obsidianFinish = true; };
                  document.body.appendChild(btn);
                })();
              `);
						} catch {
						}
					});

					// Poll for button being pressed (only way in secure context)
					pollId = setInterval(async () => {
						if (finished || !win || win.isDestroyed()) return;
						try {
							const userClicked = await win.webContents.executeJavaScript('window.__obsidianFinish === true');
							if (userClicked) {
								const cookies = await tryGetCookies();
								const cookie = pickcookie(cookies || []);
								if (cookie) {
									new Notice('TickTick cookies collected!');
									finish(resolve, cookie);
								} else {
									// new Notice("No TickTick cookies found yet.");
								}
							}
						} catch {
						}
					}, 600);

					// Detect navigation into app
					win.webContents.on('did-navigate', async (_event: any, url: string) => {
						if (finished) return;
						if (url.includes(`${this.host}/#/`) || url.includes('ticktick.com/main')) {
							const cookies = await tryGetCookies();
							const cookie = pickcookie(cookies || []);
							if (cookie) {
								finish(resolve, cookie);
							}
						}
					});

					win.on('closed', async () => {
						try {
							if (finished) return;
							const cookies = await tryGetCookies();
							const cookie = pickcookie(cookies || []);
							if (cookie) {
								finish(resolve, cookie);
							} else {
								finish(reject, new Error('Login cancelled or could not collect authentication cookies.'));
							}
						} catch(error) {
							//don't care... it's closing.
						}
					});

					timeoutId = setTimeout(async () => {
						if (finished) return;
						const cookies = await tryGetCookies();
						const cookie = pickcookie(cookies || []);
						if (cookie) {
							finish(resolve, cookie);
						} else {
							finish(reject, new Error('Login timeout.'));
						}
					}, 120000);

					await win.loadURL(`https://${this.host}/signin`);
				} catch (error) {
					finish(reject, error);
				}
			})();
		});
	}
}
