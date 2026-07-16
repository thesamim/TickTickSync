import { Notice } from 'obsidian';
import { CookieUtils, type CookieData } from './cookie-utils';
import { getSettings } from '@/settings';

type SessionCookie = { name: string; value: string };

interface ElectronWebContents {
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeAllListeners?(event: string): void;
  executeJavaScript(code: string): Promise<unknown>;
  isDestroyed?(): boolean;
  session: {
    cookies: {
      get(opts: { url: string }): Promise<{ name: string; value: string }[]>;
    };
  };
}

interface ElectronBrowserWindowInstance {
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeAllListeners?(event: string): void;
  isDestroyed?(): boolean;
  webContents?: ElectronWebContents;
  close?(): void;
  loadURL(url: string): Promise<void>;
}

type BrowserWindowConstructor = new (opts: Record<string, unknown>) => ElectronBrowserWindowInstance;

export class DesktopAuth {
	private host: string;

	constructor(private app: unknown, host: string) {
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
		return new Promise<SessionCookie | null>((resolve) => {
			let finished = false;
			const settle = (value: SessionCookie | null) => {
				if (finished) return;
				finished = true;
				try {
					tryCleanup();
				} catch {
					// ignore
				}
				resolve(value);
			};

			// Acquire Electron
			let BrowserWindow: BrowserWindowConstructor | undefined;
			try {
				const win = window as unknown as { require?: (mod: string) => unknown };
				const electron = win.require?.('electron') as Record<string, unknown> | undefined;
				const electronModule = electron as { remote?: { BrowserWindow?: unknown }; BrowserWindow?: unknown } | undefined;
				BrowserWindow = (electronModule?.remote?.BrowserWindow || electronModule?.BrowserWindow) as BrowserWindowConstructor | undefined;
			} catch {
				// ignore
			}
			if (!BrowserWindow) {
				new Notice('Desktop login is not available in this environment.', 5000);
				settle(null);
				return;
			}

			// Window references
			let win: ElectronBrowserWindowInstance | null = null;
			let pollId: number | null = null;

			// Cleanup that never throws outward
			const tryCleanup = () => {
				try {
					if (pollId) {
						window.clearInterval(pollId);
						pollId = null;
					}
				} catch {
					// ignore
				}
				try {
					if (win) {
						try {
							win.removeAllListeners?.('closed');
						} catch {
							// ignore
						}
						try {
							win.removeAllListeners?.('close');
						} catch {
							// ignore
						}
						try {
							win.webContents?.removeAllListeners?.('did-finish-load');
						} catch {
							// ignore
						}
						try {
							win.webContents?.removeAllListeners?.('did-navigate');
						} catch {
							// ignore
						}
						try {
							win.webContents?.removeAllListeners?.('destroyed');
						} catch {
							// ignore
						}
						try {
							if (!win.isDestroyed?.()) {
								// Don't force-close here; caller actions (Cancel) already requested it.
							}
						} catch {
							// ignore
						}
					}
				} catch {
					// ignore
				}
			};

			// Safe cookie fetch while window is alive
			const tryGetCookies = async (): Promise<CookieData[] | null> => {
				try {
					if (!win || win.isDestroyed?.()) return null;
					const wc = win.webContents;
					if (!wc || wc.isDestroyed?.()) return null;
					const cookies = await wc.session.cookies.get({ url: `https://${this.host}/` });
					return cookies ?? null;
				} catch {
					return null;
				}
			};

			// Build the window
			void (async () => {
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
					const w = win;

					// Inject UI on every load
					w.webContents?.on('did-finish-load', () => {
						w.webContents?.executeJavaScript(`
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
            `).catch(() => {
						// ignore
					});
					});

					// Poll for Finish/Cancel flags
					pollId = window.setInterval(() => {
						if (!win || w.isDestroyed?.() || finished) return;
						w.webContents?.executeJavaScript(`({ f: !!window.__TTS_FINISH, c: !!window.__TTS_CANCEL })`).then(flags => {
							const f = flags as { f?: boolean; c?: boolean } | undefined;
							if (f?.c) {
								// User cancelled
								tryCleanup();
								w.close?.();
								settle(null);
								return;
							}
							if (f?.f) {
								// User finished; grab cookies
								tryGetCookies().then(cookies => {
									const found = cookies ? CookieUtils.findSessionCookie(cookies) : null;
									if (!found) {
										new Notice('Could not detect session cookie. Are you signed in?', 5000);
										// still resolve null so caller can decide next steps
										tryCleanup();
										w.close?.();
										settle(null);
										return;
									}
									tryCleanup();
									w.close?.();
									settle({ name: found.name, value: found.value });
								}).catch(() => {
									// ignore
								});
							}
						}).catch(() => {
							// ignore poll errors
						});
					}, 400);

					// In normal mode, if they are already signed in, we can grab the cookie immediately.
					// In debug mode, we need to wait for the user to click Finish.
					if (!getSettings().debugMode) {
						// Navigation heuristic: if user lands inside app, attempt cookie grab automatically
						w.webContents?.on('did-navigate', (...args: unknown[]) => {
							if (finished) return;
							const url = typeof args[1] === 'string' ? args[1] : '';
							if (!url) return;

							const inApp = url.includes(`${this.host}/#/`) || url.includes(`${this.host}/webapp`);
							if (inApp) {
								tryGetCookies().then(cookies => {
									const found = cookies ? CookieUtils.findSessionCookie(cookies) : null;
									if (found) {
										tryCleanup();
										w.close?.();
										settle({ name: found.name, value: found.value });
									}
								}).catch(() => {
									// ignore
								});
							}
						});
					}

					// Resolve null on any close/destroy path
					w.on('close', () => {
						if (!finished) settle(null);
					});
					w.on('closed', () => {
						if (!finished) settle(null);
					});
					w.webContents?.on('destroyed', () => {
						if (!finished) settle(null);
					});

					// Load login
					await w.loadURL(`https://${this.host}/signin`);
					new Notice('Please sign in, then click finish or cancel.', 5000);
				} catch {
					// If we can't open the window, resolve gracefully
					settle(null);
				}
			})();
		});
	}
}
