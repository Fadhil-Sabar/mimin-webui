export const CONVERSATION_DRAFTS_STORAGE_KEY = 'mimin_conversation_drafts';
export const HOME_DRAFT_STORAGE_KEY = 'mimin_home_draft';

type DraftMap = Record<string, string>;
type ScopedDrafts = { version: 1; users: Record<string, DraftMap> };
type ScopedHomeDrafts = { version: 1; users: Record<string, string> };

// Optional user arguments are retained for older embedders. They never write to
// browser storage, so an unscoped caller cannot expose one account's draft to
// another account. The application always supplies the authenticated user id.
let legacyMemory: { conversation: DraftMap; home: string } = { conversation: {}, home: '' };
let lastStorage: unknown;

function storage(): Storage | null {
	if (typeof window === 'undefined') return null;
	const current = localStorage;
	if (current !== lastStorage) {
		lastStorage = current;
		legacyMemory = { conversation: {}, home: '' };
	}
	return current;
}

function discardUnscoped(key: string) {
	const store = storage();
	if (!store) return;
	try {
		const parsed = JSON.parse(store.getItem(key) ?? 'null') as { version?: unknown } | null;
		if (!parsed || parsed.version !== 1) store.removeItem(key);
	} catch {
		store.removeItem(key);
	}
}

function readScopedDrafts(userId: string): DraftMap {
	const store = storage();
	if (!store) return {};
	try {
		const parsed: unknown = JSON.parse(store.getItem(CONVERSATION_DRAFTS_STORAGE_KEY) ?? 'null');
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			(parsed as Partial<ScopedDrafts>).version !== 1 ||
			!(parsed as Partial<ScopedDrafts>).users ||
			typeof (parsed as Partial<ScopedDrafts>).users !== 'object'
		)
			return {};
		const drafts = (parsed as ScopedDrafts).users[userId];
		if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) return {};
		return Object.fromEntries(
			Object.entries(drafts).filter(([, draft]) => typeof draft === 'string')
		);
	} catch {
		return {};
	}
}

function writeScopedDrafts(userId: string, drafts: DraftMap) {
	const store = storage();
	if (!store) return;
	try {
		const all: ScopedDrafts = { version: 1, users: {} };
		try {
			const parsed = JSON.parse(
				store.getItem(CONVERSATION_DRAFTS_STORAGE_KEY) ?? 'null'
			) as Partial<ScopedDrafts>;
			if (parsed.version === 1 && parsed.users && typeof parsed.users === 'object')
				all.users = parsed.users as ScopedDrafts['users'];
		} catch {
			// Old unscoped values are intentionally discarded.
		}
		if (Object.keys(drafts).length) all.users[userId] = drafts;
		else delete all.users[userId];
		if (Object.keys(all.users).length)
			store.setItem(CONVERSATION_DRAFTS_STORAGE_KEY, JSON.stringify(all));
		else store.removeItem(CONVERSATION_DRAFTS_STORAGE_KEY);
	} catch {
		/* Storage is best effort. */
	}
}

export function getConversationDraft(
	userId: string | null | undefined,
	conversationId?: string | null | undefined
): string {
	discardUnscoped(CONVERSATION_DRAFTS_STORAGE_KEY);
	if (conversationId === undefined) {
		conversationId = userId;
		userId = null;
	}
	if (!conversationId) return '';
	const drafts = userId ? readScopedDrafts(userId) : legacyMemory.conversation;
	return drafts[conversationId] ?? '';
}

export function setConversationDraft(
	userId: string | null | undefined,
	conversationId: string | null | undefined,
	draft?: string
) {
	discardUnscoped(CONVERSATION_DRAFTS_STORAGE_KEY);
	if (draft === undefined) {
		draft = conversationId ?? '';
		conversationId = userId;
		userId = null;
	}
	if (!conversationId) return;
	if (!userId) {
		if (draft) legacyMemory.conversation[conversationId] = draft;
		else delete legacyMemory.conversation[conversationId];
		return;
	}
	const drafts = readScopedDrafts(userId);
	if (draft) drafts[conversationId] = draft;
	else delete drafts[conversationId];
	writeScopedDrafts(userId, drafts);
}

export function clearConversationDraft(
	userId: string | null | undefined,
	conversationId?: string | null | undefined
) {
	if (conversationId === undefined) {
		conversationId = userId;
		userId = null;
	}
	setConversationDraft(userId, conversationId, '');
}

export function getHomeDraft(userId?: string | null): string {
	discardUnscoped(HOME_DRAFT_STORAGE_KEY);
	if (!userId) return legacyMemory.home;
	const store = storage();
	if (!store) return '';
	try {
		const parsed = JSON.parse(
			store.getItem(HOME_DRAFT_STORAGE_KEY) ?? 'null'
		) as Partial<ScopedHomeDrafts>;
		const value = parsed.version === 1 ? parsed.users?.[userId] : undefined;
		return typeof value === 'string' ? value : '';
	} catch {
		return '';
	}
}

export function setHomeDraft(draft: string, userId?: string | null) {
	discardUnscoped(HOME_DRAFT_STORAGE_KEY);
	if (!userId) {
		legacyMemory.home = draft;
		return;
	}
	const store = storage();
	if (!store) return;
	try {
		let all: ScopedHomeDrafts = { version: 1, users: {} };
		try {
			const parsed = JSON.parse(
				store.getItem(HOME_DRAFT_STORAGE_KEY) ?? 'null'
			) as Partial<ScopedHomeDrafts>;
			if (parsed.version === 1 && parsed.users && typeof parsed.users === 'object')
				all = { version: 1, users: parsed.users as Record<string, string> };
		} catch {
			// Old unscoped values are intentionally discarded.
		}
		if (draft) all.users[userId] = draft;
		else delete all.users[userId];
		if (Object.keys(all.users).length) store.setItem(HOME_DRAFT_STORAGE_KEY, JSON.stringify(all));
		else store.removeItem(HOME_DRAFT_STORAGE_KEY);
	} catch {
		/* Storage is best effort. */
	}
}

export function clearHomeDraft(userId?: string | null) {
	setHomeDraft('', userId);
}

/** Remove account drafts and the one time provider navigation handoff on logout. */
export function clearSensitiveDraftState() {
	legacyMemory = { conversation: {}, home: '' };
	try {
		storage()?.removeItem(CONVERSATION_DRAFTS_STORAGE_KEY);
		storage()?.removeItem(HOME_DRAFT_STORAGE_KEY);
		if (typeof sessionStorage !== 'undefined')
			sessionStorage.removeItem('mimin_navigation_handoff');
	} catch {
		/* Storage is best effort. */
	}
}
