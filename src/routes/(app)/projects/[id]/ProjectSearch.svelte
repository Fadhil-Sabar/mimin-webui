<script lang="ts">
	import { Search } from '@lucide/svelte';

	let { value = $bindable('') }: { value?: string } = $props();
</script>

<label class="project-search">
	<Search size={15} aria-hidden="true" />
	<span id="project-search-note" class="sr-only"
		>Searches all project files on the server and filters loaded conversations.</span
	>
	<input
		bind:value
		placeholder="Search project"
		maxlength="200"
		aria-label="Search files and conversations"
		aria-describedby="project-search-note"
	/>
</label>

<style>
	.project-search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 200px;
		padding: 7px 10px;
		color: var(--text-dim);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		transition: border-color var(--duration-short3) var(--ease-standard);
	}
	.project-search input {
		width: 100%;
		min-width: 0;
		padding: 0;
		border: 0;
		color: var(--text-strong);
		background: transparent;
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
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
