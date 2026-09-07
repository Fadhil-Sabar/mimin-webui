import { browser } from '$app/environment';

class ThemeState {
	current = $state<'light' | 'dark'>('light');

	constructor() {
		if (browser) {
			const initTheme = document.documentElement.getAttribute('data-theme');
			if (initTheme === 'dark' || initTheme === 'light') {
				this.current = initTheme;
			}
			const observer = new MutationObserver(() => {
				const next = document.documentElement.getAttribute('data-theme');
				if (next === 'dark' || next === 'light') {
					this.current = next;
				}
			});
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['data-theme']
			});
		}
	}

	get isDark(): boolean {
		return this.current === 'dark';
	}
}

export const themeState = new ThemeState();
