<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import { activeNavKey, mobileNavItems } from '$lib/nav';

	type Props = {
		user?: { name?: string | null; role?: string | null } | null;
	};

	let { user = null }: Props = $props();

	let items = $derived(mobileNavItems(user?.role === 'admin'));
	let activeKey = $derived(activeNavKey(page.url.pathname));
</script>

<nav class="mobile-nav" class:drawer-open={sidebar.mobileOpen} aria-label="Primary">
	{#each items as item (item.key)}
		<a
			class="mobile-nav-item"
			class:active={item.key === activeKey}
			href={resolve(item.href)}
			aria-current={item.key === activeKey ? 'page' : undefined}
			onclick={() => sidebar.closeMobile()}
		>
			<item.icon size={20} />
			<span>{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	/* Desktop always uses the sidebar; this is the narrow-screen fast path. */
	.mobile-nav {
		display: none;
	}
	@media (max-width: 760px) {
		.mobile-nav {
			display: flex;
			position: fixed;
			inset: auto 0 0 0;
			height: var(--mobile-nav-h);
			/* Below the drawer (50) and its backdrop (45), above page content. */
			z-index: 40;
			background: var(--surface);
			border-top: 1px solid var(--border);
		}
		.mobile-nav.drawer-open {
			display: none;
		}
		.mobile-nav-item {
			flex: 1 1 0;
			min-width: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 2px;
			color: var(--text-muted);
			text-decoration: none;
			font-size: var(--text-label-sm);
			line-height: var(--text-label-sm--line-height);
			letter-spacing: var(--text-label-sm--letter-spacing);
			font-weight: 500;
			transition: color 0.15s ease;
		}
		.mobile-nav-item span {
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.mobile-nav-item.active {
			color: var(--text-strong);
		}
		.mobile-nav-item.active :global(svg) {
			stroke-width: 2.2;
		}
	}
</style>
