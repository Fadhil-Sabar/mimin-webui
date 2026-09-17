import { browser } from '$app/environment';

export const DISPLAY_PREFERENCES_STORAGE_KEY = 'mimin_display_preferences';

export type DisplayPreferences = {
	/** Show the per-answer context summary (tokens, duration, sources) under a reply. */
	showMessageContext: boolean;
};

export const DISPLAY_PREFERENCE_DEFAULTS: DisplayPreferences = {
	showMessageContext: true
};

function read(): DisplayPreferences {
	if (!browser) return { ...DISPLAY_PREFERENCE_DEFAULTS };
	try {
		const raw = localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
		if (!raw) return { ...DISPLAY_PREFERENCE_DEFAULTS };
		const parsed = JSON.parse(raw) as Partial<DisplayPreferences>;
		return {
			showMessageContext:
				typeof parsed.showMessageContext === 'boolean'
					? parsed.showMessageContext
					: DISPLAY_PREFERENCE_DEFAULTS.showMessageContext
		};
	} catch {
		// Unreadable or malformed storage falls back to the defaults.
		return { ...DISPLAY_PREFERENCE_DEFAULTS };
	}
}

/**
 * Display-only preferences. They live in the browser because nothing on the server
 * reads them, matching how the theme, drafts and last-used model are stored.
 */
class DisplayPreferencesState {
	#showMessageContext = $state(read().showMessageContext);

	get showMessageContext() {
		return this.#showMessageContext;
	}

	set showMessageContext(value: boolean) {
		this.#showMessageContext = value;
		this.#persist();
	}

	#persist() {
		if (!browser) return;
		try {
			localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(this.#snapshot()));
		} catch {
			/* storage is best effort */
		}
	}

	#snapshot(): DisplayPreferences {
		return { showMessageContext: this.#showMessageContext };
	}
}

export const displayPreferences = new DisplayPreferencesState();
