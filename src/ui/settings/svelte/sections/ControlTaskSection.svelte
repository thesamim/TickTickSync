<script lang="ts">
  import CollapsibleSection from '@/ui/settings/svelte/sections/CollapsibleSection.svelte';
  import { createEventDispatcher, onMount } from 'svelte';
  import { Notice } from 'obsidian';
  import { settingsStore } from '@/ui/settings/settingsstore';
  import { getSettings, updateSettings } from '@/settings';
  import log from '@/utils/logger';

  export let open = false;
  export let plugin;

  const dispatch = createEventDispatcher();
  function handleHeaderClick() {
    dispatch('toggle');
  }

  let projects: Array<{ id: string; name: string }> = [];
  let myProjectsOptions: Record<string, string> = {};
  let isEnsuring = false;

  // Local reactive bindings from store
  $: trackingListId = $settingsStore.trackingListId ?? '';
  $: trackingTaskName = $settingsStore.trackingTaskName ?? 'Obsidian Tracking';
  $: deviceNameOverride = $settingsStore.deviceNameOverride ?? '';
  $: currentTaskId = plugin?.db?.getTrackingTaskId?.() ?? '';

  function getMyProjectsOptions() {
    return projects.reduce((obj, item) => {
      obj[item.id] = item.name;
      return obj;
    }, {} as Record<string, string>);
  }

  async function handleListChangeValue(value: string) {
    settingsStore.update((s) => ({ ...s, trackingListId: value }));
    await plugin.saveSettings();
  }

  async function handleTaskNameChangeValue(value: string) {
    settingsStore.update((s) => ({ ...s, trackingTaskName: value }));
    await plugin.saveSettings();
  }

  async function handleDeviceNameChangeValue(value: string) {
    settingsStore.update((s) => ({ ...s, deviceNameOverride: value }));
    await plugin.saveSettings();
  }

  function onChangeList(e: Event) {
    const el = e.target as HTMLSelectElement;
    if (!el) return;
    void handleListChangeValue(el.value);
  }

  function onChangeTaskName(e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el) return;
    void handleTaskNameChangeValue(el.value);
  }

  function onChangeDeviceName(e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el) return;
    void handleDeviceNameChangeValue(el.value);
  }

  async function createOrLocateNow() {
    if (!plugin?.service) return;
    try {
      isEnsuring = true;
      // Ensure settings are up-to-date before calling ensure
      // (they are persisted via store already, but just in case)
      await plugin.saveSettings();
      const ensured = await plugin.service.ensureControlListAndTask();
      if (ensured && ensured.taskId) {
        new Notice('TickTickSync: Control task is ready.');
      } else {
        new Notice('TickTickSync: Failed to create/locate control task. See logs.', 5000);
      }
      // refresh reactive values
      currentTaskId = plugin?.db?.getTrackingTaskId?.() ?? '';
      // trackingListId may have been updated by ensure()
      trackingListId = getSettings().trackingListId ?? trackingListId;
    } catch (e) {
      log.error('Error ensuring control task', e);
      new Notice('TickTickSync: Error ensuring control task. See logs.', 5000);
    } finally {
      isEnsuring = false;
    }
  }

  onMount(async () => {
    try {
      // Prefer service.getProjects which reads from settings cache
      projects = await plugin.service.getProjects?.() ?? [];
      // If empty, try fetching and saving projects via service.saveProjectsToCache
      if (!projects || projects.length === 0) {
        try {
          await plugin.saveProjectsToCache();
          projects = await plugin.service.getProjects?.() ?? [];
        } catch (e) {
          // ignore
        }
      }
      myProjectsOptions = getMyProjectsOptions();
    } catch (e) {
      log.error('Failed to load projects for Control Task section', e);
    }
  });
</script>

<CollapsibleSection
  title="Control Task"
  shortDesc="Configure a TickTick task that controls whether sync runs."
  open={open}
  on:headerClick={handleHeaderClick}
>
  <div class="setting-item-description">
    Sync runs when the control task is open; it pauses when the task is completed. You can choose the list, task name, and create/locate the task.
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">List</div>
      <div class="setting-item-description">TickTick project to host the control task.</div>
    </div>
    <div class="setting-item-control">
      <select
        class="dropdown"
        id="control-task-list"
        bind:value={trackingListId}
        on:change={onChangeList}
      >
        <option value="">(choose)</option>
        {#each Object.entries(myProjectsOptions) as [id, name]}
          <option value={id}>{name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Task name</div>
      <div class="setting-item-description">Name of the control task (created if missing).</div>
    </div>
    <div class="setting-item-control">
      <input
        id="control-task-name"
        type="text"
        bind:value={trackingTaskName}
        placeholder="Obsidian Tracking"
        on:change={onChangeTaskName}
      />
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Device name override</div>
      <div class="setting-item-description">Optional label for this device (reserved for future use).</div>
    </div>
    <div class="setting-item-control">
      <input
        id="device-name-override"
        type="text"
        bind:value={deviceNameOverride}
        placeholder="(optional)"
        on:change={onChangeDeviceName}
      />
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Create/Locate Now</div>
      <div class="setting-item-description">Ensure the control list/task exist and cache the task id.</div>
    </div>
    <div class="setting-item-control">
      <button class="mod-cta" disabled={isEnsuring} on:click={createOrLocateNow}>
        {isEnsuring ? 'Working…' : 'Create/Locate Now'}
      </button>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Current tracking task</div>
      <div class="setting-item-description">
        {#if currentTaskId}
          Task ID: <code>{currentTaskId}</code>
        {:else}
          Not set yet.
        {/if}
      </div>
    </div>
    <div class="setting-item-control">
      {#if trackingListId}
        <span>{myProjectsOptions[trackingListId] ?? '(unknown list)'}</span>
      {:else}
        <span>(no list selected)</span>
      {/if}
    </div>
  </div>

</CollapsibleSection>
