export const CONVERSATION_DRAFTS_STORAGE_KEY = 'mimin_conversation_drafts';
export const HOME_DRAFT_STORAGE_KEY = 'mimin_home_draft';

type DraftMap = Record<string, string>;

function readDrafts(): DraftMap {
	if (typeof window === 'undefined') return {};
	try {
		const value = localStorage.getItem(CONVERSATION_DRAFTS_STORAGE_KEY);
		if (!value) return {};
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === 'object' ? (parsed as DraftMap) : {};
	} catch {
		return {};
	}
}

function writeDrafts(drafts: DraftMap) {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(CONVERSATION_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
	} catch {
		/* Storage is best effort. */
	}
}

export function getConversationDraft(conversationId: string | null | undefined): string {
	if (!conversationId) return '';
	const draft = readDrafts()[conversationId];
	return typeof draft === 'string' ? draft : '';
}

export function setConversationDraft(conversationId: string | null | undefined, draft: string) {
	if (!conversationId) return;
	const drafts = readDrafts();
	if (draft) drafts[conversationId] = draft;
	else delete drafts[conversationId];
	writeDrafts(drafts);
}

export function clearConversationDraft(conversationId: string | null | undefined) {
	setConversationDraft(conversationId, '');
}

export function getHomeDraft(): string {
	if (typeof window === 'undefined') return '';
	try {
		return localStorage.getItem(HOME_DRAFT_STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

export function setHomeDraft(draft: string) {
	if (typeof window === 'undefined') return;
	try {
		if (draft) localStorage.setItem(HOME_DRAFT_STORAGE_KEY, draft);
		else localStorage.removeItem(HOME_DRAFT_STORAGE_KEY);
	} catch {
		/* Storage is best effort. */
	}
}

export function clearHomeDraft() {
	setHomeDraft('');
}
