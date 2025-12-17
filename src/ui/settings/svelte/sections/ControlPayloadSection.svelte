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

  const PAYLOAD_PREFIX = 'TTS-PAYLOAD:';

  // Reactive bindings from settings store
  $: preferredDeviceId = $settingsStore.preferredDeviceId ?? '';
  $: deviceNameOverride = $settingsStore.deviceNameOverride ?? '';
  $: deleteGraceSeconds = $settingsStore.deleteGraceSeconds ?? 30;

  // Display fields
  let deviceId: string = '';
  let deviceName: string = '';
  let lastWriteTime: string = '';
  let payloadSize: number = 0;
  let tasksCount: number = 0;

  async function refreshPayloadInfo() {
    try {
      deviceId = plugin?.db?.getDeviceId?.() || preferredDeviceId || '';
      deviceName = getSettings().deviceNameOverride || plugin?.db?.getDeviceName?.() || '';
      const ts = plugin?.db?.getLastPayloadWriteTs?.();
      lastWriteTime = ts ? new Date(ts).toLocaleString() : '(n/a)';

      // Try to load current payload from control task desc
      const ensured = await plugin.service?.ensureControlListAndTask();
      if (!ensured) {
        payloadSize = 0;
        tasksCount = 0;
        return;
      }
      const task = await plugin.service?.api?.getTask(ensured.taskId, ensured.listId);
      const desc: string = task?.desc || '';
      const idx = desc.indexOf(PAYLOAD_PREFIX);
      if (idx < 0) {
        payloadSize = 0;
        tasksCount = 0;
        return;
      }
      const jsonText = desc.substring(idx + PAYLOAD_PREFIX.length).trim();
      payloadSize = jsonText.length;
      try {
        const obj = JSON.parse(jsonText);
        tasksCount = obj?.tasks ? Object.keys(obj.tasks).length : 0;
      } catch {
        tasksCount = 0;
      }
    } catch (e) {
      log.warn('Failed to refresh payload info', e);
    }
  }

  async function onChangePreferredDeviceId(value: string) {
    settingsStore.update((s) => ({ ...s, preferredDeviceId: value }));
    updateSettings({ preferredDeviceId: value });
    await plugin.saveSettings();
    await refreshPayloadInfo();
  }

  async function onChangeDeviceNameOverride(value: string) {
    settingsStore.update((s) => ({ ...s, deviceNameOverride: value }));
    updateSettings({ deviceNameOverride: value });
    await plugin.saveSettings();
    await refreshPayloadInfo();
  }

  async function onChangeDeleteGraceSeconds(value: string) {
    const num = Math.max(0, parseInt(value || '0', 10));
    settingsStore.update((s) => ({ ...s, deleteGraceSeconds: num }));
    updateSettings({ deleteGraceSeconds: num });
    await plugin.saveSettings();
  }

  async function exportPayload() {
    try {
      const ensured = await plugin.service?.ensureControlListAndTask();
      if (!ensured) {
        new Notice('Control task not available.');
        return;
      }
      const task = await plugin.service?.api?.getTask(ensured.taskId, ensured.listId);
      const desc: string = task?.desc || '';
      const idx = desc.indexOf(PAYLOAD_PREFIX);
      if (idx < 0) {
        new Notice('No payload found in control task.');
        return;
      }
      const jsonText = desc.substring(idx + PAYLOAD_PREFIX.length).trim();
      const pretty = (() => { try { return JSON.stringify(JSON.parse(jsonText), null, 2); } catch { return jsonText; } })();
      const folder = 'TickTickSync';
      const fileName = `control-payload-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      try {
        if (!(await plugin.app.vault.adapter.exists(folder))) {
          await plugin.app.vault.createFolder(folder);
        }
      } catch {}
      await plugin.app.vault.create(`${folder}/${fileName}`, pretty);
      new Notice(`Payload exported to ${folder}/${fileName}`);
    } catch (e) {
      log.error('Export payload failed', e);
      new Notice('Export failed. See logs.', 5000);
    }
  }

  async function resetPayload() {
    try {
      const ok = confirm('Reset payload on control task? This clears recorded operations.');
      if (!ok) return;
      const ensured = await plugin.service?.ensureControlListAndTask();
      if (!ensured) {
        new Notice('Control task not available.');
        return;
      }
      const task = await plugin.service?.api?.getTask(ensured.taskId, ensured.listId);
      const desc: string = task?.desc || '';
      const idx = desc.indexOf(PAYLOAD_PREFIX);
      const newDesc = idx >= 0 ? desc.substring(0, idx).trim() : desc;
      await plugin.service?.api?.updateTask({ id: ensured.taskId, projectId: ensured.listId, desc: newDesc });
      new Notice('Control payload reset.');
      await refreshPayloadInfo();
    } catch (e) {
      log.error('Reset payload failed', e);
      new Notice('Reset failed. See logs.', 5000);
    }
  }

  onMount(async () => {
    await refreshPayloadInfo();
  });
</script>

<CollapsibleSection
  title="Control Payload"
  shortDesc="Conflict tracking payload stored in the control task."
  open={open}
  on:headerClick={handleHeaderClick}
>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Device ID</div>
      <div class="setting-item-description">Stable ID for this install (overridden by Preferred Device ID below if set).</div>
    </div>
    <div class="setting-item-control">
      <code>{deviceId || '(unset)'}</code>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Preferred Device ID</div>
      <div class="setting-item-description">Optional ID to use when recording operations.</div>
    </div>
    <div class="setting-item-control">
      <input type="text" bind:value={preferredDeviceId} on:change={() => onChangePreferredDeviceId(preferredDeviceId)} placeholder="(optional)"/>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Device name</div>
      <div class="setting-item-description">Label for this device recorded in payload entries.</div>
    </div>
    <div class="setting-item-control">
      <input type="text" bind:value={deviceNameOverride} on:change={() => onChangeDeviceNameOverride(deviceNameOverride)} placeholder="(optional)"/>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Delete grace (seconds)</div>
      <div class="setting-item-description">Within this window, newer deletes win over competing updates.</div>
    </div>
    <div class="setting-item-control">
      <input type="number" min="0" bind:value={deleteGraceSeconds} on:change={() => onChangeDeleteGraceSeconds(String(deleteGraceSeconds))} />
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Last payload write</div>
      <div class="setting-item-description">Time of last successful write to control task.</div>
    </div>
    <div class="setting-item-control">
      <span>{lastWriteTime}</span>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Payload size</div>
      <div class="setting-item-description">Length of JSON payload in task description; includes only minified JSON after prefix.</div>
    </div>
    <div class="setting-item-control">
      <span>{payloadSize} bytes, {tasksCount} tasks</span>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Export / Reset</div>
      <div class="setting-item-description">Export the current payload to a file or reset it on the control task.</div>
    </div>
    <div class="setting-item-control">
      <button on:click={exportPayload}>Export</button>
      <button class="mod-warning" style="margin-left: 0.75em;" on:click={resetPayload}>Reset</button>
      <button style="margin-left: 0.75em;" on:click={refreshPayloadInfo}>Refresh</button>
    </div>
  </div>

</CollapsibleSection>
