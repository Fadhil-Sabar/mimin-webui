<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();
</script>

<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	class={cn(
		'fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] duration-(--duration-medium1) ease-emphasized-decelerate data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0',
		className
	)}
	{...restProps}
/>
