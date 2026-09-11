import { describe, expect, it } from 'vitest';
import {
	detectBrowserIntent,
	getBrowserUnavailableInstruction,
	getPendingBrowserAction,
	getPendingBrowserActionInstruction,
	getTurnRoutingInstruction,
	resolveTurnToolGating
} from '../src/lib/server/ai/tool-routing';

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
			'https://example.org',
			'open paper 1',
			'buka link pertama',
			'read this page',
			'baca artikel ini'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'browser-open' });
		}
	});

	it('classifies explicit references to an already-open tab', () => {
		const queries = [
			'baca tab ini',
			'lihat tab saya yang terbuka',
			'klik tombol login di tab itu',
			'read my current tab',
			'use the other tab to finish this',
			'isi form di tab aktif'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'browser-tab' });
		}
	});

	it('keeps opening a new tab on browser-open instead of tab tools', () => {
		expect(detectBrowserIntent('buka tab baru untuk halaman ini')).toEqual({
			type: 'browser-open'
		});
		expect(detectBrowserIntent('open a new tab')).not.toEqual({ type: 'browser-tab' });
	});

	it('does not read the non-browser senses of "tab" as browser intent', () => {
		const queries = [
			'how do I use the tab key in vim?',
			'what does the tab character mean in YAML?',
			'read the tab-separated file please',
			'my tab is broken in the spreadsheet',
			'explain the tab order in HTML forms',
			'set the tab width to four spaces',
			'what is a tab stop in typography?'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}
	});

	it('does not treat Google products as Google Search', () => {
		const queries = [
			'cari di google drive file laporan',
			'open google docs and find the budget',
			'share the google sheet with me',
			'check my google calendar for tomorrow',
			'translate this with google translate'
		];
		for (const q of queries) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}
	});

	it('ignores negated clauses but keeps the request around them', () => {
		const negated = [
			'jangan pakai google, cari pakai web search biasa',
			"don't search on google, just answer from your knowledge",
			'jangan baca tab saya, itu privat',
			'tanpa google, jelaskan tentang WebMCP'
		];
		for (const q of negated) {
			expect(detectBrowserIntent(q), `Query: "${q}"`).toEqual({ type: 'none' });
		}

		// Only the negated clause is dropped; the rest of the prompt still routes.
		expect(detectBrowserIntent('cari di google, bukan di bing')).toEqual({
			type: 'google-search'
		});
		// "jangan lupa" is politeness, not negation.
		expect(detectBrowserIntent('tolong jangan lupa cari di google ya')).toEqual({
			type: 'google-search'
		});
	});

	it('never lets keyword routing withhold web_search when the bridge is unavailable', () => {
		const routingRisks = [
			'how do I use the tab key in vim?',
			'read the tab-separated file please',
			'cari di google drive file laporan',
			"don't search on google",
			'jangan baca tab saya',
			'explain the tab order in HTML forms'
		];
		for (const prompt of routingRisks) {
			const gating = resolveTurnToolGating({
				prompt,
				browserBridgeEnabled: false,
				hasWebSearch: true
			});
			expect(gating.exposeWebSearch, `Prompt: "${prompt}"`).toBe(true);
			expect(gating.blockedReason, `Prompt: "${prompt}"`).toBeUndefined();
		}
	});
});

describe('resolveTurnToolGating', () => {
	it('exposes all connected search capabilities for generic research', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari berita terbaru OpenAI',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
	});

	it('keeps generic academic queries on web_search', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari penelitian tentang LLM hallucination',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
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

	it('exposes connected browser tools and hides web_search for explicit browser navigation', () => {
		const gating = resolveTurnToolGating({
			prompt: 'buka https://example.com',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(false);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
	});

	it('degrades explicit browser intent to web_search when the bridge is unavailable', () => {
		const blockedQueries = [
			'cari di Google tentang OpenAI',
			'cari di Google tentang WebMCP',
			'cari paper ini di Google Scholar',
			'cari di Google Scholar tentang LLM',
			'buka https://example.com di browser',
			'buka tab untuk halaman ini',
			'search this on Google'
		];
		for (const prompt of blockedQueries) {
			const gating = resolveTurnToolGating({
				prompt,
				browserBridgeEnabled: false,
				hasWebSearch: true
			});
			expect(gating.exposeBrowserSearch, `Prompt: "${prompt}"`).toBe(false);
			expect(gating.exposeBrowserOpen, `Prompt: "${prompt}"`).toBe(false);
			expect(gating.exposeBrowserTabs, `Prompt: "${prompt}"`).toBe(false);
			// Intent detection is a keyword guess, so it must never fail the turn or hide
			// web_search; the model explains the missing bridge instead.
			expect(gating.exposeWebSearch, `Prompt: "${prompt}"`).toBe(true);
			expect(gating.blockedReason, `Prompt: "${prompt}"`).toBe('browser_bridge_unavailable');
		}

		// Non-browser queries still expose web_search
		const normalGating = resolveTurnToolGating({
			prompt: 'cari berita terbaru OpenAI',
			browserBridgeEnabled: false,
			hasWebSearch: true
		});
		expect(normalGating.exposeWebSearch).toBe(true);
		expect(normalGating.blockedReason).toBeUndefined();
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
		expect(gating.blockedReason).toBeUndefined();
	});

	it('keeps connected browser tools available for natural follow-up prompts', () => {
		const gating = resolveTurnToolGating({
			prompt: 'i already enabled it',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
		expect(gating.browserIntent).toEqual({ type: 'none' });
	});

	it('does not need keyword routing to expose browser capabilities', () => {
		const gating = resolveTurnToolGating({
			prompt: 'coba lagi sekarang',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
		expect(gating.browserIntent).toEqual({ type: 'none' });
	});

	it('switches to web_search when user explicitly asks for web search even in active browser session', () => {
		const gating = resolveTurnToolGating({
			prompt: 'cari di web saja tentang benchmark lain',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.exposeBrowserSearch).toBe(true);
		expect(gating.exposeBrowserOpen).toBe(true);
		expect(gating.browserIntent).toEqual({ type: 'none' });
	});

	it('uses capability state rather than follow-up wording when bridge is unavailable', () => {
		const gating = resolveTurnToolGating({
			prompt: 'yes, dig it all',
			browserBridgeEnabled: false,
			hasWebSearch: true
		});
		expect(gating.exposeBrowserSearch).toBe(false);
		expect(gating.exposeBrowserOpen).toBe(false);
		expect(gating.exposeBrowserTabs).toBe(false);
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.blockedReason).toBeUndefined();
	});

	it('exposes the tab tools with the rest of a connected bridge', () => {
		const generic = resolveTurnToolGating({
			prompt: 'cari berita terbaru OpenAI',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(generic.exposeBrowserTabs).toBe(true);

		const tabIntent = resolveTurnToolGating({
			prompt: 'klik tombol login di tab saya',
			browserBridgeEnabled: true,
			hasWebSearch: true
		});
		expect(tabIntent.browserIntent).toEqual({ type: 'browser-tab' });
		expect(tabIntent.exposeBrowserTabs).toBe(true);
		expect(tabIntent.exposeWebSearch).toBe(false);
		expect(tabIntent.exposeBrowserOpen).toBe(true);
	});

	it('degrades tab intent to web_search when the bridge is unavailable', () => {
		const gating = resolveTurnToolGating({
			prompt: 'baca tab ini',
			browserBridgeEnabled: false,
			hasWebSearch: true
		});
		expect(gating.exposeBrowserTabs).toBe(false);
		expect(gating.exposeBrowserOpen).toBe(false);
		expect(gating.exposeBrowserSearch).toBe(false);
		expect(gating.exposeWebSearch).toBe(true);
		expect(gating.blockedReason).toBe('browser_bridge_unavailable');
	});
});

describe('pending browser actions', () => {
	it('recovers an unreadable browser action without inspecting follow-up wording', () => {
		const action = getPendingBrowserAction([
			{
				toolName: 'browser_open',
				status: 'completed',
				input: { url: 'https://fedoraproject.org/start/' },
				output: {
					details: {
						url: 'https://fedoraproject.org/start/',
						readable: false,
						reason: 'host_permission_required'
					}
				}
			}
		]);

		expect(action).toEqual({
			toolName: 'browser_open',
			input: { url: 'https://fedoraproject.org/start/' },
			reason: 'host_permission_required'
		});
		expect(getPendingBrowserActionInstruction(action!)).toContain(
			'browser_open {"url":"https://fedoraproject.org/start/"}'
		);
	});

	it('does not mark successful browser reads as pending', () => {
		expect(
			getPendingBrowserAction([
				{
					toolName: 'browser_open',
					input: { url: 'https://example.com' },
					output: { details: { readable: true, url: 'https://example.com' } }
				}
			])
		).toBeNull();
	});

	it('does not revive an older permission failure after a successful retry', () => {
		expect(
			getPendingBrowserAction([
				{
					toolName: 'browser_open',
					input: { url: 'https://example.com' },
					output: { details: { readable: true, url: 'https://example.com' } }
				},
				{
					toolName: 'browser_open',
					input: { url: 'https://example.com' },
					output: {
						details: {
							readable: false,
							reason: 'host_permission_required',
							url: 'https://example.com'
						}
					}
				}
			])
		).toBeNull();
	});
});

describe('getTurnRoutingInstruction', () => {
	it('generates specific instructions for explicit browser intents', () => {
		expect(getTurnRoutingInstruction({ type: 'google-search' })).toBe(
			'The user explicitly requested Google Search. Use browser_search with engine="google". Do not substitute another search provider.'
		);
		expect(getTurnRoutingInstruction({ type: 'scholar-search' })).toBe(
			'The user explicitly requested Google Scholar. Use browser_search with engine="scholar". Do not substitute another search provider.'
		);
		expect(getTurnRoutingInstruction({ type: 'browser-open' })).toBe(
			'The user explicitly requested browser navigation. Use browser_open.'
		);
		expect(getTurnRoutingInstruction({ type: 'browser-tab' })).toContain('browser_read_tab');
		expect(getTurnRoutingInstruction({ type: 'none' })).toBeNull();
	});
});

describe('getBrowserUnavailableInstruction', () => {
	it('names the bridge and admits the detection may be wrong', () => {
		const instruction = getBrowserUnavailableInstruction({ type: 'browser-tab' });
		expect(instruction).toContain('Browser Bridge is not connected');
		expect(instruction).toContain('may be wrong');
		expect(instruction).toContain('Do not claim to have used a browser');
		expect(instruction).toContain('web_search');
		expect(getBrowserUnavailableInstruction({ type: 'none' })).toBeNull();
	});
});
