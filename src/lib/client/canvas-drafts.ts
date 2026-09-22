export const CANVAS_SCENE_DRAFTS_STORAGE_KEY = 'mimin_canvas_scene_drafts';

export type CanvasSceneDraft = {
	tab: 'html' | 'css' | 'js';
	html: string;
	css: string;
	js: string;
};

type DraftMap = Record<string, CanvasSceneDraft>;
type ScopedDrafts = { version: 1; users: Record<string, DraftMap> };
let legacyMemory: DraftMap = {};
let lastStorage: unknown;

function storage(): Storage | null {
	if (typeof window === 'undefined') return null;
	const current = localStorage;
	if (current !== lastStorage) {
		lastStorage = current;
		legacyMemory = {};
	}
	return current;
}

function discardUnscoped() {
	const store = storage();
	if (!store) return;
	try {
		const parsed = JSON.parse(store.getItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY) ?? 'null') as {
			version?: unknown;
		} | null;
		if (!parsed || parsed.version !== 1) store.removeItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY);
	} catch {
		store.removeItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY);
	}
}

function draftKey(canvasId: string, sceneId: string) {
	return `${canvasId}:${sceneId}`;
}

function isDraft(value: unknown): value is CanvasSceneDraft {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const candidate = value as Partial<CanvasSceneDraft>;
	return (
		(candidate.tab === 'html' || candidate.tab === 'css' || candidate.tab === 'js') &&
		typeof candidate.html === 'string' &&
		typeof candidate.css === 'string' &&
		typeof candidate.js === 'string'
	);
}

function readScopedDrafts(userId: string): DraftMap {
	discardUnscoped();
	const store = storage();
	if (!store) return {};
	try {
		const parsed: unknown = JSON.parse(store.getItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY) ?? 'null');
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			(parsed as Partial<ScopedDrafts>).version !== 1 ||
			!(parsed as Partial<ScopedDrafts>).users ||
			typeof (parsed as Partial<ScopedDrafts>).users !== 'object'
		)
			return {};
		const values = (parsed as ScopedDrafts).users[userId];
		if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
		const drafts: DraftMap = {};
		for (const [key, value] of Object.entries(values)) if (isDraft(value)) drafts[key] = value;
		return drafts;
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
				store.getItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY) ?? 'null'
			) as Partial<ScopedDrafts>;
			if (parsed.version === 1 && parsed.users && typeof parsed.users === 'object')
				all.users = parsed.users as ScopedDrafts['users'];
		} catch {
			// Old unscoped values are intentionally discarded.
		}
		if (Object.keys(drafts).length) all.users[userId] = drafts;
		else delete all.users[userId];
		if (Object.keys(all.users).length)
			store.setItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY, JSON.stringify(all));
		else store.removeItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY);
	} catch {
		/* Storage is best effort. */
	}
}

export function getCanvasSceneDraft(
	userId: string | null | undefined,
	canvasId: string | null | undefined,
	sceneId?: string | null | undefined
): CanvasSceneDraft | null {
	storage();
	if (sceneId === undefined) {
		sceneId = canvasId;
		canvasId = userId;
		userId = null;
	}
	if (!canvasId || !sceneId) return null;
	const drafts = userId ? readScopedDrafts(userId) : legacyMemory;
	return drafts[draftKey(canvasId, sceneId)] ?? null;
}

export function setCanvasSceneDraft(
	userId: string | null | undefined,
	canvasId: string | null | undefined,
	sceneId: string | null | CanvasSceneDraft | undefined,
	draft?: CanvasSceneDraft
) {
	storage();
	discardUnscoped();
	if (draft === undefined) {
		draft = sceneId as CanvasSceneDraft;
		sceneId = canvasId;
		canvasId = userId;
		userId = null;
	}
	if (!canvasId || typeof sceneId !== 'string' || !draft || !isDraft(draft)) return;
	if (!userId) {
		legacyMemory[draftKey(canvasId, sceneId)] = draft;
		return;
	}
	const drafts = readScopedDrafts(userId);
	drafts[draftKey(canvasId, sceneId)] = draft;
	writeScopedDrafts(userId, drafts);
}

export function clearCanvasSceneDraft(
	userId: string | null | undefined,
	canvasId: string | null | undefined,
	sceneId?: string | null | undefined
) {
	storage();
	discardUnscoped();
	if (sceneId === undefined) {
		sceneId = canvasId;
		canvasId = userId;
		userId = null;
	}
	if (!canvasId || !sceneId) return;
	if (!userId) {
		delete legacyMemory[draftKey(canvasId, sceneId)];
		return;
	}
	const drafts = readScopedDrafts(userId);
	delete drafts[draftKey(canvasId, sceneId)];
	writeScopedDrafts(userId, drafts);
}

export function clearAllCanvasDrafts() {
	legacyMemory = {};
	try {
		storage()?.removeItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY);
	} catch {
		/* Storage is best effort. */
	}
}
