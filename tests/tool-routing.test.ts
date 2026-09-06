import { describe, expect, it } from 'vitest';
import { detectBrowserIntent, resolveTurnToolGating } from '../src/lib/server/ai/tool-routing';

describe('detectBrowserIntent', () => {
	it('classifies general research and search queries as none (default)', () => {
		const queries = [
			'cari berita terbaru OpenAI',
			'search latest React news',
			'cari informasi tentang WebMCP',
			'research agentic coding benchmark',
			'what is the latest news in AI?',
			'siapa penemu algoritma quicksort?',
			'explain quantum computing principles'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}
	});

	it('does not classify generic academic queries without Scholar as scholar-search', () => {
		const queries = [
			'cari penelitian tentang hallucination',
			'cari penelitian tentang LLM hallucination',
			'research academic papers on transformer architecture',
			'cari jurnal kedokteran tentang diabetes',
			'find empirical studies on reinforcement learning',
			'tinjauan literatur tentang distributed consensus'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}
	});

	it('classifies explicit Google search queries in Indonesian and English', () => {
		const queries = [
			'cari di Google tentang WebMCP',
			'search this on Google',
			'buka Google dan cari React 20',
			'Google search for latest svelte release',
			'cari lewat google: Svelte 5 runes',
			'googling tentang web components',
			'tolong google-kan tutorial vite',
			'coba cari di Google',
			'search on Google: deepseek'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'google-search' });
		}
	});

	it('does not classify definitional questions about Google as google-search', () => {
		const queries = [
			'what is Google?',
			'apa itu Google?',
			'who founded Google?',
			'siapa ceo google?',
			'jelaskan tentang Google sebagai perusahaan'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}
	});

	it('classifies explicit Google Scholar search queries in Indonesian and English', () => {
		const queries = [
			'cari paper ini di Google Scholar',
			'search Scholar for LLM hallucination',
			'cari jurnal tentang agentic coding di scholar',
			'cari penelitian tentang LLM hallucination di Google Scholar',
			'research this on google scholar',
			'cari di scholar tentang transformer attention',
			'Google Scholar search for quantum computing',
			'buka Google Scholar dan cari AI safety'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'scholar-search' });
		}
	});

	it('does not classify definitional questions about Google Scholar as scholar-search', () => {
		const queries = [
			'what is Google Scholar?',
			'apa itu Google Scholar?',
			'jelaskan google scholar'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}
	});

	it('classifies explicit browser open and navigation queries in Indonesian and English', () => {
		const queries = [
			'buka https://example.com',
			'open this URL in browser',
			'buka tab untuk halaman ini',
			'baca halaman ini lewat browser',
			'open https://news.ycombinator.com in browser',
			'buka link https://github.com/sveltejs/svelte',
			'navigate to https://vite.dev',
			'buka di browser: https://docs.python.org',
			'baca artikel di https://example.com/blog',
			'https://example.org'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'browser-open' });
		}
	});
});

describe('resolveTurnToolGating', () => {
	it('exposes web_search and hides browser tools for generic research when bridge is enabled', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari berita terbaru OpenAI',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(false);
		expect(gating.exposeBrowserOpen).toBe(false);
	});

	it('keeps generic academic queries on web_search', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari penelitian tentang LLM hallucination',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(false);
		expect(gating.exposeBrowserOpen).toBe(false);
	});

	it('exposes browser_search and browser_open and hides web_search for explicit Google search', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari di Google tentang WebMCP',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(false);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
	});

	it('exposes browser_search and browser_open and hides web_search for explicit Google Scholar search', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari paper ini di Google Scholar',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(false);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
	});

	it('exposes browser_open and hides browser_search and web_search for explicit browser navigation', () => {
		const gating = resolveTurnToolGating({
			prompt: 'buka https://example.com',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(false);
		expect(gating.exposeBrowserSearch).toBe(false);
		expect(gating.exposeBrowserOpen).toBe(true);
	});

	it('never exposes browser tools when browser bridge is unavailable', () => {
		const inputs = [
			'cari di Google tentang WebMCP',
			'cari paper ini di Google Scholar',
			'buka https://example.com',
			'cari berita terbaru OpenAI'
		];
		for (const prompt of inputs) {
			const gating = resolveTurnToolGating({
				prompt,
				browserBridgeEnabled: false,
				hasWebSearch: true
			});
			expect(gating.exposeBrowserSearch, `Prompt: "${prompt}"`).toBe(false);
			expect(gating.exposeBrowserOpen, `Prompt: "${prompt}"`).toBe(false);
			expect(gating.exposeWebSearch, `Prompt: "${prompt}"`).toBe(true);
		}
	});

	it('respects hasWebSearch=false when web_search is disabled in conversation', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari berita terbaru OpenAI',
			browserBridgeEnabled: false,
			hasWebSearch: false
		});
		expect(gating.exposeWebSearch).toBe(false);
		expect(gating.exposeBrowserSearch).toBe(false);
		expect(gating.exposeBrowserOpen).toBe(false);
	});
});
