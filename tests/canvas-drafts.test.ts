import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearCanvasSceneDraft,
	getCanvasSceneDraft,
	setCanvasSceneDraft
} from '../src/lib/client/canvas-drafts';

function storage() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key))
	};
}

describe('persistent canvas scene drafts', () => {
	let store: ReturnType<typeof storage>;
	beforeEach(() => {
		store = storage();
		vi.stubGlobal('window', {});
		vi.stubGlobal('localStorage', store);
	});

	it('keeps drafts isolated by canvas and scene', () => {
		const htmlDraft = { tab: 'html' as const, html: '<main>A</main>', css: '', js: '' };
		const cssDraft = { tab: 'css' as const, html: '', css: 'main { color: red; }', js: '' };
		setCanvasSceneDraft('canvas-a', 'scene-a', htmlDraft);
		setCanvasSceneDraft('canvas-a', 'scene-b', cssDraft);

		expect(getCanvasSceneDraft('canvas-a', 'scene-a')).toEqual(htmlDraft);
		expect(getCanvasSceneDraft('canvas-a', 'scene-b')).toEqual(cssDraft);
		expect(getCanvasSceneDraft('canvas-b', 'scene-a')).toBeNull();
	});

	it('ignores malformed persisted drafts', () => {
		store.setItem(
			'mimin_canvas_scene_drafts',
			JSON.stringify({
				'canvas-a:scene-a': { tab: 'html', html: 42, css: '', js: '' },
				'canvas-a:scene-b': { tab: 'wat', html: '', css: '', js: '' }
			})
		);

		expect(getCanvasSceneDraft('canvas-a', 'scene-a')).toBeNull();
		expect(getCanvasSceneDraft('canvas-a', 'scene-b')).toBeNull();
	});

	it('clears a saved scene draft without removing other drafts', () => {
		const draft = { tab: 'js' as const, html: '', css: '', js: 'return true;' };
		setCanvasSceneDraft('canvas-a', 'scene-a', draft);
		setCanvasSceneDraft('canvas-a', 'scene-b', draft);
		clearCanvasSceneDraft('canvas-a', 'scene-a');

		expect(getCanvasSceneDraft('canvas-a', 'scene-a')).toBeNull();
		expect(getCanvasSceneDraft('canvas-a', 'scene-b')).toEqual(draft);
	});
});
