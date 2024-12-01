<script lang="ts">
	import type {Query} from "@/query/query";
	import type {QueryWarning} from "@/query/parser";
	import type {TickTickService} from "@/services";
	import store from "@/store";

	export let query: Query;
	export let warnings: QueryWarning[];

	let service: TickTickService;
	store.service.subscribe((s) => (service = s));

	let tasksPromise = getTasks(query);
	async function getTasks(query: Query) {
		return service.getProjects();
	}
</script>

<div class="break-words">
	<h1 class="">Tasks</h1>
	<p>
		{#await tasksPromise}
			Loading tasks...
		{:then tasks}
			{#each tasks as task}
				{task.name}<br/>
			{/each}
		{:catch someError}
			System error: {someError.message}.
		{/await}
	</p>
	{#if warnings.length > 0}
		<div class="warning">
			<h2>Warnings</h2>
			{#each warnings as warning}
				<p>{warning}</p>
			{/each}
		</div>
	{/if}
</div>
