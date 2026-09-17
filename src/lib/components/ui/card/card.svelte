<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

	/**
	 * The app's one panel surface. Every settings panel and page card used to restate
	 * the same `background`/`border`/`border-radius` triple with a different radius
	 * each time; this is that treatment in one place. Padding and elevation stay
	 * variants because panels legitimately differ there.
	 */
	export const cardVariants = tv({
		base: 'rounded-xl border border-[var(--border)] bg-[var(--surface)]',
		variants: {
			padding: {
				none: '',
				sm: 'p-[var(--space-4)]',
				md: 'p-[var(--space-5)]'
			},
			shadow: {
				none: '',
				soft: 'shadow-[0_5px_20px_var(--shadow-softer)]',
				raised: 'shadow-[0_8px_24px_var(--shadow-soft)]'
			}
		},
		defaultVariants: {
			padding: 'md',
			shadow: 'none'
		}
	});

	export type CardPadding = VariantProps<typeof cardVariants>['padding'];
	export type CardShadow = VariantProps<typeof cardVariants>['shadow'];

	export type CardProps = WithElementRef<HTMLAttributes<HTMLDivElement>> &
		WithElementRef<HTMLAnchorAttributes> & {
			padding?: CardPadding;
			shadow?: CardShadow;
		};
</script>

<script lang="ts">
	let {
		class: className,
		padding = 'md',
		shadow = 'none',
		ref = $bindable(null),
		href = undefined,
		children,
		...restProps
	}: CardProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="card"
		class={cn(cardVariants({ padding, shadow }), className)}
		{href}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<div
		bind:this={ref}
		data-slot="card"
		class={cn(cardVariants({ padding, shadow }), className)}
		{...restProps}
	>
		{@render children?.()}
	</div>
{/if}
