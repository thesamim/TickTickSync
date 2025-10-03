<script lang="ts">
	import type TickTickSync from '@/main';
	import { Notice, Platform } from 'obsidian';
	import { onMount } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import { getSettings, updateSettings } from '@/settings';
	import log from 'loglevel';
	import { getTick } from '@/api/tick_singleton_factory';
	import { DesktopAuth2 } from '@/utils/login/desktop_authenticator';

	export let plugin: TickTickSync;

	const PROVIDER_OPTIONS = { 'ticktick.com': 'TickTick', 'dida365.com': 'Dida365' };
	let userLogin: string;
	let userPassword: string;

	let baseURL: string;
	let isWorking: boolean = false;
	let loggedIn: boolean = false;
	let desktoApp: boolean = false;
	let providerString: string = '';

	async function saveLoginInfo(info: { inboxId: string; token: string }) {
		const oldInboxId = $settingsStore.inboxID;
		if (oldInboxId.length > 0 && oldInboxId != info.inboxId) {
			new Notice('You are logged in with a different user ID.');
		}

		settingsStore.update(s => ({ ...s, token: info.token, inboxID: info.inboxId, checkPoint: 0 }));

		updateSettings({
			token: info.token,
			inboxID: info.inboxId,
			inboxName: 'Inbox',
			checkPoint: 0
		});
		loggedIn = !!$settingsStore.token;

		// Ensure the shared Tick instance reflects new token/checkpoint
		const api = getTick({
			baseUrl: $settingsStore.baseURL,
			token: info.token,
			checkPoint: 0
		});
		// Keep plugin references coherent if they were already pointing at a Tick
		if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) {
			plugin.tickTickRestAPI.api = api;
		}
		if (plugin.service) {
			plugin.service.api = api;
		}

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

		const info = await plugin.service.login(baseURL, userLogin, userPassword);
		if (!info) {
			new Notice('Login Failed. ');
			isWorking = false;
			return;
		}
		await saveLoginInfo(info);
		isWorking = false;
	}

	async function webBasedLogin() {
		try {
			isWorking = true;
			new Notice('Opening TickTick login...');
			// const desktopAuth = new DesktopAuth(plugin, baseURL);
			// const cookie = await desktopAuth.authenticate();

			const desktopAut = new DesktopAuth2(plugin, baseURL);
			const cookie = await desktopAut.authenticate();
			if (cookie) {
				new Notice('Login successful! Cookies saved.');

				// Configure singleton Tick with the new cookie
				const api = getTick({
					username: '',
					password: '',
					baseUrl: $settingsStore.baseURL,
					token: cookie.value,
					checkPoint: 0
				});
				// Wire references to the singleton
				if (plugin.tickTickRestAPI) {
					plugin.tickTickRestAPI.api = api;
				}
				plugin.service.api = api;

				// Test API access using the singleton
				const info = await api.getUserStatus();
				if (info) {
					await saveLoginInfo(info);
				} else {
					new Notice('Failed to verify login with API.', 5000);
				}
			} else {
				isWorking = false;
				throw new Error('Failed to fetch cookies.');
			}
			isWorking = false;
		} catch (error) {
			new Notice('Login failed: ' + error.message, 5000);
			log.error('Authentication error:', error);
			isWorking = false;
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
				<br>If you have your { providerString } account is set up with SSO/2FA, login using SSO/2FA.<br>If
				you have your { providerString } account set up with a username and password, login using Regular Login.<br>
			</div>
		{:else }
			<div class="login-status-banner-actions">
				<br>Mobile only allows for Regular Login.<br>
				If you have your { providerString } account is set up with SSO/2FA, please login from desktop first, synchronize your vault to this device and you will be logged in.<br>
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
					updateSettings({ baseURL: baseURL });

					// Update singleton baseUrl if already logged in
					if ($settingsStore.token) {
						const api = getTick({
							baseUrl: baseURL,
							token: $settingsStore.token,
							checkPoint: $settingsStore.checkPoint ?? 0
						});
						if (plugin.tickTickRestAPI) {
							plugin.tickTickRestAPI.api = api;
						}
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
					<div class="setting-item-description">
					</div>
				</div>

				<div class="setting-item-control">
					<button disabled={isWorking}
							class="mod-cta ts_login_button"
							on:click={webBasedLogin}>
						Login with {providerString}
					</button>
				</div>
			</div>
		</div>
	{/if}
	<div class='card-section'>
		<!--		<div class ='card-header'>Regular login</div>-->
		<div class="setting-item-info">
			<div class="setting-item-name">Regular Login</div>
			<div class="setting-item-description">
			</div>
		</div>
		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Username</div>
				<div class="setting-item-description">Your {providerString} account username</div>
			</div>
			<div class="setting-item-control">
				<input
					type="text"
					placeholder="Username"
					bind:value={userLogin}
				/>
			</div>
		</div>

		<div class="setting-item">
			<div class="setting-item-info">
				<div class="setting-item-name">Password</div>
				<div class="setting-item-description">Your { providerString } account password</div>
			</div>
			<div class="setting-item-control">
				<input
					type="password"
					placeholder="Password"
					bind:value={userPassword}
				/>
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
				<button disabled={isWorking}
						class="mod-cta ts_login_button"
						on:click={handleLogin}>
					Login
				</button>
			</div>
		</div>
	</div>
</div>
