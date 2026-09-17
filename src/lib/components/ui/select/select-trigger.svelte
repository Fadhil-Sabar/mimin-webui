<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithoutChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: 'sm' | 'default';
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"md-body-md flex w-fit items-center justify-between gap-1.5 rounded-md border border-[var(--input-border)] bg-[var(--surface)] py-[9px] pr-[10px] pl-[11px] whitespace-nowrap transition-[border-color,background-color] duration-(--duration-short3) ease-standard select-none placeholder:text-[var(--text-dim)] focus-visible:focus-outline disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-[var(--danger-bg)] data-placeholder:text-[var(--text-dim)] data-[size=default]:min-h-[44px] data-[size=sm]:min-h-[38px] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="pointer-events-none size-4 text-muted-foreground" />
</SelectPrimitive.Trigger>
