<script lang="ts">
	import type TickTickSync from '@/main';
	import { Notice, Platform } from 'obsidian';
	import { onMount } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import { getSettings, updateSettings } from '@/settings';
 import log from '@/utils/logger';
	import { getTick } from '@/api/tick_singleton_factory';

	export let plugin: TickTickSync;

	let loginBusy = false;
	const PROVIDER_OPTIONS = { 'ticktick.com': 'TickTick', 'dida365.com': 'Dida365' };
	let userLogin: string;
	let userPassword: string;

	let baseURL: string;
	let isWorking: boolean = false;
	let loggedIn: boolean = false;
	let desktoApp: boolean = false;
	let providerString: string = '';

	async function saveLoginInfo(info: { inboxId: string | null; token: string | null }) {
		const oldInboxId = $settingsStore.inboxID;
		if (oldInboxId &&  oldInboxId.length > 0 && oldInboxId != info.inboxId) {
			new Notice('You are logged in with a different user ID.');
		}
		settingsStore.update(s => ({ ...s, token: info.token, inboxID: info.inboxId, checkPoint: 0 }));
		updateSettings({ token: info.token, inboxID: info.inboxId, inboxName: 'Inbox', checkPoint: 0 });
		loggedIn = !!$settingsStore.token;

		const api = getTick({ baseUrl: $settingsStore.baseURL, token: info.token, checkPoint: 0 });
		if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) plugin.tickTickRestAPI.api = api;
		if (plugin.service) plugin.service.api = api;

		await plugin.saveProjectsToCache();
		await plugin.saveSettings(true);
	}

	async function handleLogin() {
		isWorking = true;
		if (!$settingsStore.baseURL || !userLogin || !userPassword) {
			new Notice('Please fill in both Username and Password');
			isWorking = false;
			return;
		}

		try {
			const info = await plugin.service.login(baseURL, userLogin, userPassword);
			if (!info) {
				new Notice('Login Failed. ');
				await saveLoginInfo({ inboxId: null, token: null });
				isWorking = false;
				return;
			}
			await saveLoginInfo(info);
		} catch (e: any) {
			await saveLoginInfo({ inboxId: null, token: null });
			log.error('Authentication error:', e);
		}
		isWorking = false;
	}

	async function webBasedLogin() {
		if (loginBusy) return;
		loginBusy = true;
		isWorking = true;
		try {
			new Notice('Opening login...');
			const isMobile = Platform.isAndroidApp || Platform.isIosApp;

			let cookie: { name: string; value: string } | null = null;
			if (Platform.isDesktopApp) {
				const { DesktopAuth } = await import('@/utils/login/desktop_authenticator');
				cookie = await new DesktopAuth(plugin, baseURL).authenticate();
			} else if (isMobile) {
				new Notice('Mobile only allows for Regular Login.', 5000);
			}

			if (!cookie?.value) throw new Error('No cookie received.');

			const api = getTick({
				username: '',
				password: '',
				baseUrl: $settingsStore.baseURL,
				token: cookie.value,
				checkPoint: 0
			});
			if (plugin.tickTickRestAPI) plugin.tickTickRestAPI.api = api;
			plugin.service.api = api;

			const info = await api.getUserStatus();
			if (!info) throw new Error('Failed to verify login with API.');
			await saveLoginInfo(info);
			new Notice('Login successful.');
		} catch (e: any) {
			new Notice('Login failed: ' + (e?.message || e), 5000);
			await saveLoginInfo({ inboxId: null, token: null });
			log.error('Authentication error:', e);
		} finally {
			isWorking = false;
			loginBusy = false;
		}
	}

	onMount(async () => {
		loggedIn = !!$settingsStore.token;
		baseURL = $settingsStore.baseURL;
		desktoApp = Platform.isDesktopApp;
		providerString = PROVIDER_OPTIONS[baseURL] || 'Not Selected';
	});
</script>

<div class="access-control">
	<div class="login-status-banner">
		{loggedIn ? 'You are logged in. You can re-login here.' : 'Please login here.'}
		<div class="login-status-banner-actions">
			<br>Regardless of login option, TickTickSync will not save your User ID or your Password anywhere.<br>
		</div>
		{#if desktoApp}
			<div class="login-status-banner-actions">
				<br>If your { providerString } account is set up with SSO/2FA, login using SSO/2FA.<br>If
				your { providerString } account set up with a username and password, login using Regular Login.<br>
			</div>
		{:else }
			<div class="login-status-banner-actions">
				<br>Mobile only allows Regular Login.<br>
				If your { providerString } account is set up with SSO/2FA, please login from desktop first,
				synchronize your vault to this device and you will be logged in.<br>
			</div>
		{/if}
	</div>

	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">{ providerString }</div>
			<div class="setting-item-description">Select home server</div>
		</div>
		<div class="setting-item-control">
			<select disabled={isWorking}
					value={getSettings().baseURL}
					on:change={async (e) => {
					baseURL = e.target.value;
					providerString = PROVIDER_OPTIONS[baseURL];
					$settingsStore.baseURL = baseURL;
					updateSettings({ baseURL });
					if ($settingsStore.token) {
						const api = getTick({ baseUrl: baseURL, token: $settingsStore.token, checkPoint: $settingsStore.checkPoint ?? 0 });
						if (plugin.tickTickRestAPI) plugin.tickTickRestAPI.api = api;
						plugin.service.api = api;
					}
					await plugin.saveSettings();
				}}>
				{#each Object.entries(PROVIDER_OPTIONS) as [value, label]}
					<option {value}>{label}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if desktoApp}
		<div class='card-section'>
			<div class="setting-item">
				<div class="setting-item-info">
					<div class="setting-item-name">SSO/2FA Login</div>
					<div class="setting-item-description"></div>
				</div>
				<div class="setting-item-control">
					<button disabled={isWorking} class="mod-cta ts_login_button" on:click={webBasedLogin}>
						Login with {providerString}
					</button>
				</div>
			</div>
		</div>
	{/if}
	<div class='card-section'>
		<div class="setting-item-info">
			<div class="setting-item-name">Regular Login</div>
			<div class="setting-item-description"></div>
		</div>
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Username</div>
				<div class="setting-item-description">Your {providerString} account username</div>
			</div>
			<div class="setting-item-control">
				<input type="text" placeholder="Username" bind:value={userLogin} />
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Password</div>
				<div class="setting-item-description">Your { providerString } account password</div>
			</div>
			<div class="setting-item-control">
				<input type="password" placeholder="Password" bind:value={userPassword} />
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Login</div>
				<div class="setting-item-description">
					{loggedIn ? 'You are logged in. You can re-login here.' : 'Please login here.'}
				</div>
			</div>
			<div class="setting-item-control">
				<button disabled={isWorking} class="mod-cta ts_login_button" on:click={handleLogin}>
					Login
				</button>
			</div>
		</div>
	</div>
</div>
