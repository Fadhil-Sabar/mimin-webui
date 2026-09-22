<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { ChevronDown, ChevronRight, PanelLeft } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import type { NavHref } from '$lib/nav';

	type Crumb = {
		label: string;
		href?: NavHref;
		/** Emphasised crumb. Defaults to the first crumb when no href is given. */
		strong?: boolean;
	};

	type Props = {
		/** Rendered only when there are two or more: a lone crumb echoes the page title. */
		breadcrumbs?: Crumb[];
		separator?: 'slash' | 'chevron-right' | 'chevron-down';
		actions?: Snippet;
		/** Rendered after the theme toggle, on the far right. */
		trailingActions?: Snippet;
	};

	let { breadcrumbs = [], separator = 'slash', actions, trailingActions }: Props = $props();
</script>

<header class="topbar">
	<div class="topbar-left">
		<!-- Visibility is owned by the global `.topbar-toggle` rules: it depends on the
		     `.app-shell` ancestor's collapsed state, which no utility can express. -->
		<Button
			variant="ghost"
			size="icon-sm"
			class="topbar-toggle hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
			onclick={() => sidebar.toggle()}
			title="Toggle sidebar"
			aria-label="Toggle sidebar"><PanelLeft size={16} /></Button
		>
		{#if breadcrumbs.length > 1}
			<nav class="breadcrumb" aria-label="Breadcrumb">
				{#each breadcrumbs as crumb, index (crumb.label)}
					{#if index > 0}
						{#if separator === 'chevron-right'}
							<ChevronRight size={14} />
						{:else if separator === 'chevron-down'}
							<ChevronDown size={14} />
						{:else}
							<span class="crumb-sep">/</span>
						{/if}
					{/if}
					{#if crumb.href}
						<a href={resolve(crumb.href as '/chat')}>{crumb.label}</a>
					{:else if crumb.strong ?? index === 0}
						<strong>{crumb.label}</strong>
					{:else}
						<span>{crumb.label}</span>
					{/if}
				{/each}
			</nav>
		{/if}
	</div>
	<div class="top-actions">
		{@render actions?.()}
		<ThemeToggle />
		{@render trailingActions?.()}
	</div>
</header>

<style>
	.crumb-sep {
		color: var(--text-faint);
		margin: 0 3px;
	}
	.breadcrumb a {
		color: var(--text-dim);
		text-decoration: none;
		transition: color var(--duration-short3) var(--ease-standard);
	}
	.breadcrumb a:hover {
		color: var(--text-strong);
	}
</style>
