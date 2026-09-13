<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Sparkles } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let {
		title,
		subtitle = '',
		children
	}: { title: string; subtitle?: string; children: Snippet } = $props();
</script>

<div class="auth-page">
	<div class="auth-theme-toggle"><ThemeToggle /></div>
	<div class="auth-card">
		<div class="auth-brand">
			<span class="auth-brand-mark"><Sparkles size={14} /></span>
			<span>mimin</span>
			<span class="auth-brand-muted">/ workbench</span>
		</div>
		<h1 class="auth-title">{title}</h1>
		{#if subtitle}<p class="auth-subtitle">{subtitle}</p>{/if}
		{@render children()}
	</div>
</div>
