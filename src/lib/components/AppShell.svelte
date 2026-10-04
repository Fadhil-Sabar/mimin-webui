<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import SidebarBackdrop from '$lib/components/SidebarBackdrop.svelte';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type Props = {
		user?: { id?: string | null; name?: string | null; role?: string | null } | null;
		children: Snippet;
	};

	let { user = null, children }: Props = $props();
	let shellElement = $state<HTMLDivElement>();
	let isMobile = $state(false);
	let drawerOpen = $derived(isMobile && sidebar.mobileOpen);
	let drawerWasOpen = false;

	onMount(() => {
		const media = window.matchMedia('(max-width: 760px)');
		isMobile = media.matches;
		const update = (event: MediaQueryListEvent) => {
			isMobile = event.matches;
			if (!isMobile) sidebar.closeMobile();
		};
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});

	$effect(() => {
		const open = drawerOpen;
		const element = shellElement;
		if (!element || open === drawerWasOpen) return;
		drawerWasOpen = open;
		void tick().then(() => {
			if (open !== drawerOpen) return;
			const toggle = element.querySelector<HTMLElement>('.topbar-toggle');
			const target = open
				? element.querySelector<HTMLElement>('.dock-panel-head button')
				: toggle?.getClientRects().length
					? toggle
					: element.querySelector<HTMLElement>('.topbar-brand');
			if (target?.getClientRects().length) target.focus({ preventScroll: true });
		});
	});

	function keepDrawerFocus(event: KeyboardEvent) {
		if (!drawerOpen || event.key !== 'Tab') return;
		const controls = Array.from(
			shellElement?.querySelectorAll<HTMLElement>(
				'.sidebar a[href], .sidebar button:not(:disabled), .sidebar input:not(:disabled), .sidebar [tabindex="0"]'
			) ?? []
		).filter((element) => element.getClientRects().length && !element.closest('[inert]'));
		const first = controls[0];
		const last = controls.at(-1);
		const focused = document.activeElement;
		if (
			first &&
			last &&
			(!controls.includes(focused as HTMLElement) || focused === (event.shiftKey ? first : last))
		) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		}
	}
</script>

<svelte:window onkeydown={keepDrawerFocus} />

<div
	bind:this={shellElement}
	class="app-shell"
	class:sidebar-collapsed={sidebar.collapsed}
	class:mobile-open={sidebar.mobileOpen}
>
	<SidebarBackdrop />
	<AppSidebar {user} inactive={isMobile && !sidebar.mobileOpen} />
	<main class="main-content" inert={drawerOpen}>
		{@render children()}
	</main>
</div>
