export const CANVAS_SCENE_DRAFTS_STORAGE_KEY = 'mimin_canvas_scene_drafts';

export type CanvasSceneDraft = {
	tab: 'html' | 'css' | 'js';
	html: string;
	css: string;
	js: string;
};

type DraftMap = Record<string, CanvasSceneDraft>;

function draftKey(canvasId: string, sceneId: string) {
	return `${canvasId}:${sceneId}`;
}

function readDrafts(): DraftMap {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const drafts: DraftMap = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
			const candidate = value as Partial<CanvasSceneDraft>;
			if (
				(candidate.tab === 'html' || candidate.tab === 'css' || candidate.tab === 'js') &&
				typeof candidate.html === 'string' &&
				typeof candidate.css === 'string' &&
				typeof candidate.js === 'string'
			) {
				drafts[key] = {
					tab: candidate.tab,
					html: candidate.html,
					css: candidate.css,
					js: candidate.js
				};
			}
		}
		return drafts;
	} catch {
		return {};
	}
}

function writeDrafts(drafts: DraftMap) {
	if (typeof window === 'undefined') return;
	try {
		if (Object.keys(drafts).length === 0) localStorage.removeItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY);
		else localStorage.setItem(CANVAS_SCENE_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
	} catch {
		/* Storage is best effort. */
	}
}

export function getCanvasSceneDraft(
	canvasId: string | null | undefined,
	sceneId: string | null | undefined
): CanvasSceneDraft | null {
	if (!canvasId || !sceneId) return null;
	return readDrafts()[draftKey(canvasId, sceneId)] ?? null;
}

export function setCanvasSceneDraft(
	canvasId: string | null | undefined,
	sceneId: string | null | undefined,
	draft: CanvasSceneDraft
) {
	if (!canvasId || !sceneId) return;
	const drafts = readDrafts();
	drafts[draftKey(canvasId, sceneId)] = draft;
	writeDrafts(drafts);
}

export function clearCanvasSceneDraft(
	canvasId: string | null | undefined,
	sceneId: string | null | undefined
) {
	if (!canvasId || !sceneId) return;
	const drafts = readDrafts();
	delete drafts[draftKey(canvasId, sceneId)];
	writeDrafts(drafts);
}
