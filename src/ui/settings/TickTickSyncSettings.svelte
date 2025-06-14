<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type TickTickSync from '@/main';
  import { getSettings, updateSettings } from '@/settings';
  import { PROVIDER_OPTIONS, TAGS_BEHAVIOR, LOG_LEVEL } from './svelte/constants.svelte.js'; // Create as needed

  // Props from Obsidian plugin
  export let plugin: TickTickSync;
  export let containerEl: HTMLElement; // To attach to Obsidian's settings DOM

  // Svelte tab state
  let activeTab = 0;

  // Local state for form inputs
  let userLogin: string = '';
  let userPassword: string = '';
  let syncProjects: Record<string, string> = {};;
  let syncTag: string = '';
  let syncProject: string = '';
  let tagAndOr: string = '';
  let baseURL: string = '';
  let defaultProjectId: string = '';

  // Options from plugin
  async function refreshProjects() {
    const projects = await plugin.service.getProjects();
    // make Record<string, string> from id/name
    syncProjects = {};
    for (const p of projects) {
      syncProjects[p.id] = p.name;
    }
  }

  // On mount, fetch project options
  onMount(async () => {
	  await refreshProjects();
	  // plugin is ready here!
	  syncTag = getSettings().SyncTag ?? '';
	  syncProject = getSettings().SyncProject ?? '';
	  tagAndOr = String(getSettings().tagAndOr ?? 1);
	  baseURL = getSettings().baseURL ?? Object.keys(PROVIDER_OPTIONS)[0];
	  defaultProjectId = getSettings().defaultProjectId ?? '';
  });

  // Settings updating functions (wrap for Svelte forms/buttons)
  const saveAuth = async () => {
    await plugin.saveSettings();
  };

  const loginHandler = async () => {
    // Use plugin.loginHandler or wire as needed here
    await plugin.loginHandler(getSettings().baseURL, userLogin, userPassword);
  };

  // ... More handlers as needed for other settings

  // For mounting: Attach yourself to containerEl
  let componentEl: HTMLDivElement;
  onMount(() => {
    if (containerEl && componentEl) {
      containerEl.empty?.();
      containerEl.appendChild(componentEl);
    }
  });
  onDestroy(() => {
    if (containerEl && componentEl && containerEl.contains(componentEl)) {
      containerEl.removeChild(componentEl);
    }
  });
</script>

<!-- TAB HEADERS -->
<div bind:this={componentEl} class="tickticksync-settings">
  <div class="tabs">
    <button class:active={activeTab === 0} on:click={() => (activeTab = 0)}>Access Control</button>
    <button class:active={activeTab === 1} on:click={() => (activeTab = 1)}>Sync Control</button>
    <button class:active={activeTab === 2} on:click={() => (activeTab = 2)}>Manual</button>
    <button class:active={activeTab === 3} on:click={() => (activeTab = 3)}>Debug</button>
  </div>

  <!-- TAB PANELS -->
  <div class="tabpanels">
    {#if activeTab === 0}
      <section>
        <h2>Access Control</h2>
        <!-- Provider dropdown -->
        <label>
          TickTick/Dida
          <select bind:value={baseURL} on:change={e => updateSettings({ baseURL: e.target.value })}>
            {#each Object.entries(PROVIDER_OPTIONS) as [value, label]}
              <option value={value}>{label}</option>
            {/each}
          </select>
        </label>
        <!-- Username/Password -->
        <label>
          Username
          <input type="text" bind:value={userLogin} placeholder="User Name" />
        </label>
        <label>
          Password
          <input type="password" bind:value={userPassword} placeholder="Password" />
        </label>
        <!-- Login button -->
        <button on:click={loginHandler}>Login</button>
      </section>
    {/if}

    {#if activeTab === 1}
      <section>
        <h2>Sync Control</h2>
        <!-- Example: Default project (dropdown) -->
        <label>
          Default project
          <select
            bind:value={defaultProjectId}
            on:change={async e => {
              defaultProjectId = e.target.value;
              updateSettings({ defaultProjectName: await plugin.cacheOperation?.getProjectNameByIdFromCache(e.target.value) });
              await plugin.saveSettings();
              await refreshProjects();
            }}>
            {#each Object.entries(syncProjects) as [id, name]}
              <option value={id}>{name}</option>
            {/each}
          </select>
        </label>
        <!-- ...repeat for your other sync block settings... -->
        <label>
          Tag
          <input type="text" bind:value={syncTag} on:blur={async () => { updateSettings({ SyncTag: syncTag.replace(/^#/, '') }); await plugin.saveSettings(); }} />
        </label>
        <!-- Further fields as per your existing logic! -->
      </section>
    {/if}

    {#if activeTab === 2}
      <section>
        <h2>Manual</h2>
        <!-- ... Manual settings UI ... -->
      </section>
    {/if}

    {#if activeTab === 3}
      <section>
        <h2>Debug</h2>
        <!-- ... Debug settings UI ... -->
      </section>
    {/if}
  </div>
</div>

<style>
.tickticksync-settings { padding: 10px; }
.tabs { display: flex; gap: 1em; margin-bottom: 1em; }
.tabs button { padding: 0.5em 1em; }
.tabs button.active { font-weight: bold; border-bottom: 2px solid var(--color-accent, #888); }
.tabpanels > section { animation: fadein 0.15s; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
label { display: block; margin: 10px 0; }
input, select { margin-left: 10px; }
</style>
