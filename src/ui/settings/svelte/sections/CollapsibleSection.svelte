<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import '../SettingsStyles.css';
	export let title: string;
	export let open: boolean = false;
	export let shortDesc: string = ''; // Short description to show when collapsed

	const dispatch = createEventDispatcher();

	function toggle() {
		dispatch('headerClick');
	}

</script>

<div class="collapsible-section">
	<div class="collapsible-header" on:click={toggle}>
		<span>{open ? '▼' : '▶'}</span>{title}
	</div>
	{#if open}
		<div class="collapsible-body">
			<slot />
		</div>
	{:else if shortDesc}
		<div class="short-desc">{shortDesc}</div>
	{/if}
</div>
