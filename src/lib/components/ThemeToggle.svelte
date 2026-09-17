<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	let theme = $state<'light' | 'dark'>(
		typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
			? 'dark'
			: 'light'
	);

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

<Button
	variant="ghost"
	size="icon-lg"
	onclick={toggle}
	aria-pressed={theme === 'dark'}
	aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if theme === 'dark'}
		<Sun size={17} class="theme-icon" />
	{:else}
		<Moon size={17} class="theme-icon" />
	{/if}
</Button>

<style>
	/* The icon lives inside the Sun/Moon components, so it carries their scope, not
	 * this one -- hence the global hook. */
	:global(.theme-icon) {
		display: block;
		animation: icon-in var(--duration-short4) var(--ease-emphasized-decelerate);
	}
</style>
