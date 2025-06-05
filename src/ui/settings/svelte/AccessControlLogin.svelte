<script lang="ts">
  import { getSettings, updateSettings } from '@/settings';
  import type TickTickSync from '@/main';
  import { Notice } from 'obsidian';
  
  export let plugin: TickTickSync;
  
  const PROVIDER_OPTIONS = { 'ticktick.com': 'TickTick', 'dida365.com': 'Dida365' };
  let userLogin = '';
  let userPassword = '';
  
  async function handleLogin() {
    if (!getSettings().baseURL || !userLogin || !userPassword) {
      new Notice('Please fill in both Username and Password');
      return;
    }
    await plugin.service.login(getSettings().baseURL, userLogin, userPassword);
  }
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
        {getSettings().token ? 'You are logged in. You can re-login here.' : 'Please login here.'}
      </div>
    </div>
    <div class="setting-item-control">
      <button 
        class="mod-cta ts_login_button"
        on:click={handleLogin}>
        Login
      </button>
    </div>
  </div>
</div>
