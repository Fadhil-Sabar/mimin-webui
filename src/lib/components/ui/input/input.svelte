<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'md-body-md block min-h-[44px] w-full min-w-0 rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-[11px] py-[8px] text-[var(--text)] transition-[border-color,background-color] duration-(--duration-short3) ease-standard file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[var(--text)] placeholder:text-[var(--text-dim)] focus-visible:focus-outline disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-[var(--danger-bg)]',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'md-body-md block min-h-[44px] w-full min-w-0 rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-[11px] py-[8px] text-[var(--text)] transition-[border-color,background-color] duration-(--duration-short3) ease-standard file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[var(--text)] placeholder:text-[var(--text-dim)] focus-visible:focus-outline disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-[var(--danger-bg)]',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
