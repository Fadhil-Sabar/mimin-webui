<script lang="ts">
	import { Settings } from '@lucide/svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { settingsModal } from '$lib/client/settings-modal.svelte';

	function openSettings() {
		sidebar.closeMobile();
		settingsModal.show('models');
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
