import { tick } from 'svelte';

export function focusableElements(container: HTMLElement | undefined | null) {
	if (!container) return [];
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		)
	);
}

export async function focusModalPrimary(container: HTMLElement | undefined | null) {
	await tick();
	if (!container) return;
	const first =
		container.querySelector<HTMLElement>('[data-modal-primary]') ?? focusableElements(container)[0];
	first?.focus();
}

export function trapModalFocus(event: KeyboardEvent, container: HTMLElement | undefined | null) {
	if (event.key !== 'Tab') return;
	const focusable = focusableElements(container);
	if (focusable.length === 0) {
		event.preventDefault();
		return;
	}
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}
