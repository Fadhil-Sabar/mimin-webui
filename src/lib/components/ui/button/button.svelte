<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	export const buttonVariants = tv({
		base: "state-layer focus-visible:focus-outline md-label-lg inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding whitespace-nowrap outline-none transition-[color,background-color,border-color,transform] duration-(--duration-short4) disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default:
					'border-[var(--accent-bg)] bg-[var(--accent-bg)] text-[var(--accent-fg)] hover:bg-[var(--accent-bg-hover)]',
				outline:
					'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-body)] hover:border-[var(--text-dim)] hover:text-[var(--text)]',
				secondary:
					'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-body)] hover:bg-[var(--surface-hover)]',
				ghost:
					'border-transparent bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
				destructive:
					'border-[var(--danger-bg)] bg-[var(--danger-bg)] text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--danger-bg)_85%,var(--text-strong))]',
				link: 'border-transparent bg-transparent text-[var(--text-strong)] underline-offset-4 hover:underline'
			},
			size: {
				default: 'min-h-[38px] px-3 py-[9px]',
				sm: 'min-h-[32px] px-2.5 py-1.5',
				lg: 'min-h-[42px] px-4 py-2.5',
				icon: 'size-9',
				'icon-sm': 'size-8',
				'icon-xs': 'size-7',
				'icon-lg': 'size-10'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
