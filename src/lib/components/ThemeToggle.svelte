<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';

	let theme = $state<'light' | 'dark'>('light');

	$effect(() => {
		// The inline script in app.html has already applied the persisted/system
		// theme to <html data-theme> before hydration; mirror it here.
		const current = document.documentElement.getAttribute('data-theme');
		if (current === 'dark' || current === 'light') theme = current;
	});

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', theme);
		try {
			localStorage.setItem('theme', theme);
		} catch {
			/* private mode */
		}
	}
</script>

<button
	class="theme-toggle"
	onclick={toggle}
	aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if theme === 'dark'}
		<Sun size={17} />
	{:else}
		<Moon size={17} />
	{/if}
</button>
