<script lang="ts">
  import { App } from 'obsidian';
  import type TickTickSync from '@/main';
  import AccessControlLogin from './AccessControlLogin.svelte';
  // import SyncControlSettings from './SyncControlSettings.svelte';
  import ManualSyncOperations from './ManualSyncOperations.svelte';
  import DebugOptionsSettings from './DebugOptionsSettings.svelte';
  import SyncControlSettingsComponent from '@/ui/settings/svelte/SyncControlSettingsComponent.svelte';
  
  export let app: App;
  export let plugin: TickTickSync;

  const vaultName = app.vault.getName();
  
  let activeTab = 'access';
  
  const tabs = {
    access: 'Access Control',
    sync: 'Sync Control',
    manual: 'Manual Operations',
    debug: 'Debug Options'
  };
</script>
<div class="ticktick-settings">
	{vaultName}
</div>

<div class="ticktick-settings">
  <nav class="settings-tabs">
    {#each Object.entries(tabs) as [id, label]}
      <button 
        class="tab-button {activeTab === id ? 'active' : ''}"
        on:click={() => activeTab = id}>
        {label}
      </button>
    {/each}
  </nav>

  <div class="tab-content">
    {#if activeTab === 'access'}
      <AccessControlLogin {plugin} />
    {:else if activeTab === 'sync'}
      <SyncControlSettingsComponent {plugin} {app} />
    {:else if activeTab === 'manual'}
      <ManualSyncOperations {plugin} />
    {:else if activeTab === 'debug'}
      <DebugOptionsSettings {plugin} />
    {/if}
  </div>
</div>

<style>
  .ticktick-settings {
    padding: 1rem;
  }
  
  .settings-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 2px solid var(--background-modifier-border);
  }
  
  .tab-button {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
  }
  
  .tab-button.active {
    color: var(--text-normal);
    border-bottom-color: var(--interactive-accent);
  }
  
  .tab-content {
    padding: 1rem 0;
  }
</style>
