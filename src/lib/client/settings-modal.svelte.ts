export const SETTINGS_TABS = [
	'models',
	'instructions',
	'web-search',
	'browser-extension',
	'preferences',
	'users'
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: string | null | undefined): value is SettingsTab {
	return typeof value === 'string' && (SETTINGS_TABS as readonly string[]).includes(value);
}

class SettingsModalState {
	open = $state(false);
	activeTab = $state<SettingsTab>('models');

	show(tab: SettingsTab = 'models') {
		this.activeTab = tab;
		this.open = true;
	}

	close() {
		this.open = false;
	}

	setTab(tab: SettingsTab) {
		this.activeTab = tab;
	}
}

export const settingsModal = new SettingsModalState();
