<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Settings } from '@lucide/svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';

	function openSettings() {
		sidebar.closeMobile();
		goto(resolve('/settings'), {
			state: { settingsReturnTo: page.url.pathname + page.url.search, settingsStartAtList: true }
		});
	}
</script>

<button class="settings-btn" title="Settings" aria-label="Settings" onclick={openSettings}>
	<Settings size={16} aria-hidden="true" />
</button>

<style>
	.settings-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: 0 0 28px;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		padding: 0;
		transition: 0.16s ease;
	}
	.settings-btn:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
</style>
