<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { ...restProps }: SonnerProps = $props();
</script>

<!--
	Sonner reads its colours from these CSS vars, so they are pointed at the
	project's own tokens. That keeps toasts identical to the `.toast` element they
	replace (--accent-bg pill, --accent-fg text, 8px radius) and makes them follow
	[data-theme] without any JS theme wiring. The generated component's
	`mode-watcher` dependency is deliberately not used: this project drives dark
	mode with the data-theme attribute, not mode-watcher.
-->
<Sonner
	class="toaster group"
	offset={24}
	style="--normal-bg: var(--accent-bg); --normal-text: var(--accent-fg); --normal-border: var(--accent-bg); --border-radius: 8px;"
	toastOptions={{
		classes: {
			toast: 'cn-toast'
		}
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
