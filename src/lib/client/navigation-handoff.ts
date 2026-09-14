export const NAVIGATION_HANDOFF_STORAGE_KEY = 'mimin_navigation_handoff';

export type NavigationHandoff = {
	prompt: string;
	returnTo: string;
};

function storage() {
	return typeof window === 'undefined' ? null : sessionStorage;
}

export function createNavigationHandoff(handoff: NavigationHandoff) {
	try {
		storage()?.setItem(NAVIGATION_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
	} catch {
		/* sessionStorage is best effort. */
	}
}

export function peekNavigationHandoff(): NavigationHandoff | null {
	try {
		const value = storage()?.getItem(NAVIGATION_HANDOFF_STORAGE_KEY);
		if (!value) return null;
		const parsed: unknown = JSON.parse(value);
		if (
			parsed &&
			typeof parsed === 'object' &&
			typeof (parsed as NavigationHandoff).prompt === 'string' &&
			typeof (parsed as NavigationHandoff).returnTo === 'string'
		)
			return parsed as NavigationHandoff;
	} catch {
		/* Ignore malformed or unavailable handoffs. */
	}
	return null;
}

export function consumeNavigationHandoff(): NavigationHandoff | null {
	const handoff = peekNavigationHandoff();
	try {
		storage()?.removeItem(NAVIGATION_HANDOFF_STORAGE_KEY);
	} catch {
		/* sessionStorage is best effort. */
	}
	return handoff;
}
