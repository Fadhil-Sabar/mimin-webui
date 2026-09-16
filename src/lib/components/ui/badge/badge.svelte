<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'group/badge inline-flex min-h-5 shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-[7px] py-[2px] text-label-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-0 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!',
		variants: {
			variant: {
				default: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]',
				success: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--status-ok-text)]',
				warning: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--status-working-text)]',
				secondary: 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-body)]',
				destructive:
					'border-[color-mix(in_srgb,var(--danger-text)_30%,transparent)] bg-transparent text-[var(--danger-text)]',
				outline: 'border-[var(--border-strong)] bg-transparent text-[var(--text-body)]',
				ghost: 'border-transparent bg-transparent text-[var(--text-muted)]',
				link: 'border-transparent bg-transparent text-[var(--text-strong)] underline-offset-4 hover:underline'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
