import type { Component } from 'svelte';
import {
	FileText,
	FolderKanban,
	Globe,
	MessageSquare,
	Puzzle,
	Settings,
	Sparkles,
	User
} from '@lucide/svelte';

export type NavItem = {
	key: string;
	label: string;
	href: NavHref;
	icon: Component;
	/** Paths that should highlight this item. Predicates are mutually exclusive. */
	match: (pathname: string) => boolean;
	adminOnly?: boolean;
};

/** Literal pathnames the shell navigates to, so `resolve()` stays type-checked at the call site. */
export type NavHref =
	| '/chat'
	| '/projects'
	| '/admin/users'
	| '/settings'
	| '/settings/instructions'
	| '/skills'
	| '/settings/web-search'
	| '/settings/browser-extension';

export type NavSection = {
	label: string;
	items: NavItem[];
};

/** Workspace destinations and settings destinations share one source of truth. */
export const NAV_SECTIONS: NavSection[] = [
	{
		label: 'Workspace',
		items: [
			{
				key: 'chat',
				label: 'Chat',
				href: '/chat',
				icon: MessageSquare,
				// The home route is the chat landing surface.
				match: (pathname) => pathname === '/' || pathname.startsWith('/chat')
			},
			{
				key: 'projects',
				label: 'Projects',
				href: '/projects',
				icon: FolderKanban,
				match: (pathname) => pathname.startsWith('/projects')
			},
			{
				key: 'skills',
				label: 'Skills',
				href: '/skills',
				icon: Sparkles,
				match: (pathname) => pathname.startsWith('/skills')
			}
		]
	},
	{
		label: 'Settings',
		items: [
			{
				key: 'models',
				label: 'Models',
				href: '/settings',
				icon: Settings,
				match: (pathname) => pathname === '/settings'
			},
			{
				key: 'instructions',
				label: 'Instructions',
				href: '/settings/instructions',
				icon: FileText,
				match: (pathname) => pathname.startsWith('/settings/instructions')
			},
			{
				key: 'web-search',
				label: 'Web Search',
				href: '/settings/web-search',
				icon: Globe,
				match: (pathname) => pathname.startsWith('/settings/web-search')
			},
			{
				key: 'browser-extension',
				label: 'Browser Extension',
				href: '/settings/browser-extension',
				icon: Puzzle,
				match: (pathname) => pathname.startsWith('/settings/browser-extension')
			},
			{
				key: 'users',
				label: 'Users',
				href: '/admin/users',
				icon: User,
				match: (pathname) => pathname.startsWith('/admin'),
				adminOnly: true
			}
		]
	}
];

function allItems(): NavItem[] {
	return NAV_SECTIONS.flatMap((section) => section.items);
}

export function visibleNavSections(isAdmin: boolean): NavSection[] {
	return NAV_SECTIONS.map((section) => ({
		...section,
		items: section.items.filter((item) => !item.adminOnly || isAdmin)
	})).filter((section) => section.items.length > 0);
}

export function settingsNavItems(isAdmin: boolean): NavItem[] {
	return (
		NAV_SECTIONS.find((section) => section.label === 'Settings')?.items.filter(
			(item) => !item.adminOnly || isAdmin
		) ?? []
	);
}

export function activeNavKey(pathname: string): string | undefined {
	return allItems().find((item) => item.match(pathname))?.key;
}

/**
 * Destinations pinned to the mobile bottom bar. The drawer still exposes every
 * item; this is the fast path, and it reuses the same entries so the two never
 * disagree.
 */
export function mobileNavItems(isAdmin: boolean): NavItem[] {
	const byKey = new Map(allItems().map((item) => [item.key, item]));
	return ['chat', 'projects', 'skills', 'models', 'users']
		.map((key) => byKey.get(key))
		.filter((item): item is NavItem => !!item && (!item.adminOnly || isAdmin));
}
