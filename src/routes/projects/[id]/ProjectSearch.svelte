<script lang="ts">
	import { Search } from '@lucide/svelte';

	let { value = $bindable('') }: { value?: string } = $props();
</script>

<label class="project-search">
	<Search size={15} aria-hidden="true" />
	<span id="project-search-note" class="sr-only"
		>Search filters the loaded files and conversations only.</span
	>
	<input
		bind:value
		placeholder="Search project"
		aria-label="Search files and conversations"
		aria-describedby="project-search-note"
	/>
</label>

<style>
	.project-search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 200px;
		padding: 7px 10px;
		color: var(--text-dim);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		transition: border-color 0.15s ease;
	}
	.project-search input {
		width: 100%;
		min-width: 0;
		padding: 0;
		border: 0;
		outline: 0;
		color: var(--text-strong);
		background: transparent;
		font-family: var(--font-body);
		font-size: var(--text-sm);
	}
	.project-search:focus-within {
		border-color: var(--focus);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 760px) {
		.project-search {
			width: min(190px, 42vw);
		}
	}
</style>
