<script lang="ts">
	import { getSettings, updateSettings } from '@/settings';
	import type TickTickSync from '@/main';
	import { Notice } from 'obsidian';
	import { onMount } from 'svelte';

	export let plugin: TickTickSync;

	const PROVIDER_OPTIONS = { 'ticktick.com': 'TickTick', 'dida365.com': 'Dida365' };
	let userLogin = '';
	let userPassword = '';
	let baseURL: string;
	let isWorking: boolean = false;
	let loggedIn: boolean = false;
	
	async function handleLogin() {
		isWorking = true;
		if (!getSettings().baseURL || !userLogin || !userPassword) {
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

		const oldInboxId = getSettings().inboxID;
		if (oldInboxId.length > 0 && oldInboxId != info.inboxId) {
			//they've logged in with a different user id ask user about it.
			new Notice('You are logged in with a different user ID.');
		}
		//if oldInboxId same as info.inboxId ask user about full re-syncing. set checkPoint to 0 to force full sync.

		updateSettings({
			token: info.token,
			inboxID: info.inboxId,
			inboxName: 'Inbox', //TODO: In the fullness of time find out how to get the Dida inbox name.
			checkPoint: 0
		});
		loggedIn = getSettings().token ? true : false;
		if (plugin.tickTickRestAPI && plugin.tickTickRestAPI.api) {
			plugin.tickTickRestAPI!.api!.checkpoint = 0;
		}
		await plugin.saveProjectsToCache();
		await plugin.saveSettings(true);
	  isWorking = false;
	}
	onMount(async () => {
		loggedIn = getSettings().token ? true : false;
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
					updateSettings({ baseURL: e.target.value });
					await plugin.saveSettings();
				}}>
				{#each Object.entries(PROVIDER_OPTIONS) as [value, label]}
					<option {value}>{label}</option>
				{/each}
			</select>
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
