<script lang="ts">
  export let title: string;
  export let open: boolean = false;
  export let shortDesc: string = ''; // Short description to show when collapsed
  let expanded = open;
</script>

<style>
  .collapsible-section {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    margin: 24px 0;
    box-shadow: 0 1px 6px 0 rgba(16,22,26,.08);
    color: var(--text-normal);
    transition: box-shadow 0.18s, background 0.18s;
    padding: 0;
    /* Ensure card looks good in all themes */
  }
  @media (prefers-color-scheme: dark) {
    .collapsible-section {
      background: var(--background-secondary);
      border-color: var(--background-modifier-border);
      color: var(--text-normal);
    }
    .collapsible-header {
      background: var(--background-tertiary);
      color: var(--text-normal);
    }
  }
  .collapsible-header {
    cursor: pointer;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: .5em;
    user-select: none;
    font-size: 1.1em;
    padding: 14px 22px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-tertiary);
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    transition: background 0.18s, color 0.18s;
  }
  .collapsible-header:hover {
    background: var(--background-modifier-hover);
  }
  .collapsible-body {
    padding: 18px 22px 14px 22px;
    animation: fadeIn .2s;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px);}
    to   { opacity: 1; transform: none;}
  }
  .short-desc {
    padding: 18px 22px 14px 22px;
    color: var(--text-muted);
    font-size: 0.98em;
    transition: color 0.18s;
    animation: fadeIn .2s;
  }
</style>

<div class="collapsible-section">
  <div class="collapsible-header" on:click={() => expanded = !expanded}>
    <span>{expanded ? '▼' : '▶'}</span>{title}
  </div>
  {#if expanded}
    <div class="collapsible-body">
      <slot />
    </div>
  {:else if shortDesc}
    <div class="short-desc">{shortDesc}</div>
  {/if}
</div>
