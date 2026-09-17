<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		'md-body-md block min-h-[80px] w-full resize-y rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-[11px] py-[8px] text-[var(--text)] transition-[border-color,background-color] duration-(--duration-short3) ease-standard placeholder:text-[var(--text-dim)] focus-visible:focus-outline disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-[var(--danger-bg)]',
		className
	)}
	bind:value
	{...restProps}></textarea>
