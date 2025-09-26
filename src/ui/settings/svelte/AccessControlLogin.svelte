<script lang="ts">
	import type TickTickSync from '@/main';
	import { Notice } from 'obsidian';
	import { onMount } from 'svelte';
	import { settingsStore } from '@/ui/settings/settingsstore';
	import { getSettings, updateSettings } from '@/settings';
	import { DesktopAuth } from '@/utils/login/desktop-auth'
	import log from 'loglevel';
	import { Tick } from '@/api';

	export let plugin: TickTickSync;

	const PROVIDER_OPTIONS = { 'ticktick.com': 'TickTick', 'dida365.com': 'Dida365' };
	let userLogin: string;
	let userPassword: string;

	let baseURL: string;
	let isWorking: boolean = false;
	let loggedIn: boolean = false;

	async function saveLoginInfo(info: { inboxId: string; token: string }) {
		const oldInboxId = $settingsStore.inboxID;
		if (oldInboxId.length > 0 && oldInboxId != info.inboxId) {
			//they've logged in with a different user id ask user about it.
			new Notice('You are logged in with a different user ID.');
		}
		//if oldInboxId same as info.inboxId ask user about full re-syncing. set checkPoint to 0 to force full sync.
		settingsStore.update(s => ({ ...s, token: info.token, inboxID: info.inboxId, checkPoint: 0 }));

		updateSettings({
			token: info.token,
			inboxID: info.inboxId,
			inboxName: 'Inbox', //TODO: In the fullness of time find out how to get the Dida inbox name.
			checkPoint: 0
		});
		loggedIn = !!$settingsStore.token;
		if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) {
			plugin.tickTickRestAPI!.api!.checkpoint = 0;
			plugin.tickTickRestAPI!.api!.token = info.token;
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

	async function loginToTickTick() {
		try {
			new Notice('Opening TickTick login...');
			const desktopAuth = new DesktopAuth(plugin, baseURL	);
			const cookie = await desktopAuth.authenticate();

			if (cookie) {
				log.log('token received:', cookie.value);

				new Notice('Login successful! Cookies saved.');

				// Test API access
				let info;
				if (plugin.service.api) {
					plugin.tickTickRestAPI!.api!.checkpoint = 0;
					plugin.tickTickRestAPI!.api!.token = cookie.value;
					log.debug("API: ", JSON.stringify(plugin.tickTickRestAPI!.api));
					info = await plugin.service.api.getUserStatus()
					log.debug('there was an API info', info);
				} else {
					plugin.service.api = new Tick({
						username: "",
						password: "",
						baseUrl: $settingsStore.baseURL,
						token: cookie.value,
						checkPoint: 0
					});
					info = await plugin.service.api.getUserStatus()
					log.debug('there wasn\'t an API info', info);
				}
				if (info) {
					log.debug("info token: " + info.token);
					await saveLoginInfo(info);
				}
			} else {
				log.debug('No cookies received.');
				throw new Error("Failed to fetch cookies.")
			}
		} catch (error) {
			new Notice('Login failed: ' + error.message, 5000);
			log.error('Authentication error:', error);
		}
	}
	onMount(async () => {
		loggedIn = !!$settingsStore.token;
		baseURL = $settingsStore.baseURL;
	});


</script>

<div class="access-control">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">TickTick/Dida</div>
			<div class="setting-item-description">Select home server</div>
		</div>
		<div class="setting-item-control">
			<select
				value={getSettings().baseURL}
				on:change={async (e) => {
					baseURL = e.target.value;
					$settingsStore.baseURL = baseURL;
					updateSettings({ baseURL: baseURL });
					await plugin.saveSettings();
				}}>
				{#each Object.entries(PROVIDER_OPTIONS) as [value, label]}
					<option {value}>{label}</option>
				{/each}
			</select>
		</div>
	</div>
	<div class="setting-item">

		<div class="setting-item-control">
			<button disabled={isWorking}
					class="mod-cta ts_login_button"
					on:click={loginToTickTick}>
				Login with TickTick
			</button>
		</div>
	</div>
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">Username</div>
			<div class="setting-item-description">Your TickTick/Dida account username</div>
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
			<div class="setting-item-description">Your TickTick/Dida account password</div>
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
