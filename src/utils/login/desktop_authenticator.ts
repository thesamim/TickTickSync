import { Notice } from 'obsidian';
import { CookieUtils } from './cookie-utils';
import log from 'loglevel';
import { getSettings } from '@/settings';

type SessionCookie = { name: string; value: string };

export class DesktopAuth {
	private host: string;

	constructor(private app: any, host: string) {
		this.host = host;
	}

	/**
	 * Flow:
	 * 1) Opens a BrowserWindow at https://{host}/signin
	 * 2) Injects two floating buttons: "Finish" and "Cancel"
	 * 3) If Finish is clicked, fetch Electron cookies, find 't' (or a session cookie), return it.
	 * 4) If Cancel is clicked or window is closed/destroyed, resolve with null (no throw).
	 */
	async authenticate(): Promise<SessionCookie | null> {
		return new Promise<SessionCookie | null>(async (resolve) => {
			let finished = false;
			const settle = (value: SessionCookie | null) => {
				if (finished) return;
				finished = true;
				try {
					tryCleanup();
				} catch {
				}
				resolve(value);
			};

			// Acquire Electron
			let electron: any;
			let BrowserWindow: any;
			try {
				electron = (window as any).require?.('electron');
				BrowserWindow = electron?.remote?.BrowserWindow || electron?.BrowserWindow;
			} catch {
			}
			if (!BrowserWindow) {
				new Notice('Desktop login is not available in this environment.', 5000);
				settle(null);
				return;
			}

			// Window references
			let win: any;
			let pollId: ReturnType<typeof setInterval> | null = null;

			// Cleanup that never throws outward
			const tryCleanup = () => {
				try {
					if (pollId) {
						clearInterval(pollId);
						pollId = null;
					}
				} catch {
				}
				try {
					if (win) {
						try {
							win.removeAllListeners?.('closed');
						} catch {
						}
						try {
							win.removeAllListeners?.('close');
						} catch {
						}
						try {
							win.webContents?.removeAllListeners?.('did-finish-load');
						} catch {
						}
						try {
							win.webContents?.removeAllListeners?.('did-navigate');
						} catch {
						}
						try {
							win.webContents?.removeAllListeners?.('destroyed');
						} catch {
						}
						try {
							if (!win.isDestroyed?.()) {
								// Don’t force-close here; caller actions (Cancel) already requested it.
							}
						} catch {
						}
					}
				} catch {
				}
			};

			// Safe cookie fetch while window is alive
			const tryGetCookies = async (): Promise<any[] | null> => {
				try {
					if (!win || win.isDestroyed?.()) return null;
					const wc = win.webContents;
					// @ts-ignore types may not expose isDestroyed
					if (!wc || wc.isDestroyed?.()) return null;
					const cookies = await wc.session.cookies.get({ url: `https://${this.host}/` });
					return cookies ?? null;
				} catch {
					return null;
				}
			};

			// Build the window
			try {
				win = new BrowserWindow({
					width: 900,
					height: 680,
					show: true,
					webPreferences: {
						nodeIntegration: false,
						contextIsolation: true,
						webSecurity: true
					}
				});

				// Inject UI on every load
				win.webContents.on('did-finish-load', async () => {
					try {
						await win.webContents.executeJavaScript(`
              (function () {
                if (document.getElementById('__tts_auth_bar')) return;
                const bar = document.createElement('div');
                bar.id = '__tts_auth_bar';
                bar.style.position = 'fixed';
                bar.style.right = '24px';
                bar.style.bottom = '24px';
                bar.style.display = 'flex';
                bar.style.gap = '8px';
                bar.style.zIndex = '999999';
                bar.style.pointerEvents = 'none';

                const mkBtn = (id, text, bg) => {
                  const b = document.createElement('button');
                  b.id = id;
                  b.textContent = text;
                  b.style.pointerEvents = 'auto';
                  b.style.padding = '10px 16px';
                  b.style.border = 'none';
                  b.style.borderRadius = '6px';
                  b.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
                  b.style.color = '#fff';
                  b.style.fontWeight = '600';
                  b.style.cursor = 'pointer';
                  b.style.background = bg;
                  return b;
                };

                const finishBtn = mkBtn('__tts_finish', 'Finish', '#4b8bf4');
                const cancelBtn = mkBtn('__tts_cancel', 'Cancel', '#666');

                finishBtn.onclick = () => { window.__TTS_FINISH = true; };
                cancelBtn.onclick = () => { window.__TTS_CANCEL = true; };

                bar.appendChild(cancelBtn);
                bar.appendChild(finishBtn);
                document.body.appendChild(bar);
              })();
            `);
					} catch {
					}
				});

				// Poll for Finish/Cancel flags
				pollId = setInterval(async () => {
					if (!win || win.isDestroyed?.() || finished) return;
					try {
						const flags = await win.webContents.executeJavaScript(`({ f: !!window.__TTS_FINISH, c: !!window.__TTS_CANCEL })`);
						if (flags?.c) {
							// User cancelled
							tryCleanup();
							try {
								win.close?.();
							} catch {
							}
							settle(null);
							return;
						}
						if (flags?.f) {
							// User finished; grab cookies
							const cookies = await tryGetCookies();
							const found = cookies ? CookieUtils.findSessionCookie(cookies) : null;
							if (!found) {
								new Notice('Could not detect session cookie. Are you signed in?', 5000);
								// still resolve null so caller can decide next steps
								tryCleanup();
								try {
									win.close?.();
								} catch {
								}
								settle(null);
								return;
							}
							tryCleanup();
							try {
								win.close?.();
							} catch {
							}
							settle({ name: found.name, value: found.value });
							return;
						}
					} catch {
						// ignore poll errors
					}
				}, 400);

				// In normal mode, if they are already signed in, we can grab the cookie immediately.
				// In debug mode, we need to wait for the user to click Finish.
				if (!getSettings().debugMode) {
					// Navigation heuristic: if user lands inside app, attempt cookie grab automatically
					win.webContents.on('did-navigate', async (_e: any, url: string) => {
						if (finished) return;
						if (!url) return;

						try {
							const inApp = url.includes(`${this.host}/#/`) || url.includes(`${this.host}/webapp`);
							if (inApp) {
								const cookies = await tryGetCookies();
								const found = cookies ? CookieUtils.findSessionCookie(cookies) : null;
								if (found) {
									tryCleanup();
									try {
										win.close?.();
									} catch {
									}
									settle({ name: found.name, value: found.value });
								}
							}
						} catch {
						}
					});
				}

				// Resolve null on any close/destroy path
				win.on('close', () => {
					if (!finished) settle(null);
				});
				win.on('closed', () => {
					if (!finished) settle(null);
				});
				win.webContents.on('destroyed', () => {
					if (!finished) settle(null);
				});

				// Load login
				await win.loadURL(`https://${this.host}/signin`);
				new Notice('Please sign in, then click Finish or Cancel.', 5000);
			} catch {
				// If we can’t open the window, resolve gracefully
				settle(null);
			}
		});
	}
}
