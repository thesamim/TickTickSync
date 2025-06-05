<script lang="ts">
  import { getSettings } from '@/settings';
  import type TickTickSync from '@/main';
  import { Notice } from 'obsidian';
  
  export let plugin: TickTickSync;
  
  async function handleManualSync() {
    if (!getSettings().token) {
      new Notice('Please log in from settings first');
      return;
    }
    try {
      await plugin.scheduledSynchronization();
      new Notice('Sync completed.');
    } catch (error) {
      new Notice(`An error occurred while syncing: ${error}`);
    }
  }
</script>

<div class="manual-operations">
  {#if getSettings().token}
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">Manual sync</div>
        <div class="setting-item-description">Manually perform a synchronization task</div>
      </div>
      <div class="setting-item-control">
        <button class="mod-cta" on:click={handleManualSync}>
          Sync
        </button>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">Check database</div>
        <div class="setting-item-description">
          Check for possible issues: sync error, file renaming not updated, or missed tasks not synchronized
        </div>
      </div>
      <div class="setting-item-control">
        <button 
          class="mod-cta"
          on:click={() => plugin.service.checkDataBase()}>
          Check Database
        </button>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">Backup TickTick data</div>
        <div class="setting-item-description">
          Click to backup TickTick data. The backed-up files will be stored in the root directory of the Obsidian vault
        </div>
      </div>
      <div class="setting-item-control">
        <button 
          class="mod-cta"
          on:click={() => plugin.service.backup()}>
          Backup
        </button>
      </div>
    </div>
  {/if}
</div>
