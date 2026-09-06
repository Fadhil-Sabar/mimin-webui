import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildSearchUrl, SEARCH_ENGINES } from '../browser-extension/src/search.js';

describe('Mimin Search browser extension', () => {
	it('builds encoded Google and Scholar searches', () => {
		expect(buildSearchUrl('google', 'svelte runes & signals')).toBe(
			'https://www.google.com/search?q=svelte+runes+%26+signals'
		);
		expect(buildSearchUrl('scholar', 'large language models')).toBe(
			'https://scholar.google.com/scholar?q=large+language+models'
		);
	});

	it('opens a homepage for a blank query', () => {
		expect(buildSearchUrl('google', '   ')).toBe('https://www.google.com/');
		expect(buildSearchUrl('scholar', '')).toBe('https://scholar.google.com/');
	});

	it('rejects unknown engines', () => {
		expect(() => buildSearchUrl('bing' as keyof typeof SEARCH_ENGINES, 'query')).toThrow(
			'Unsupported search engine'
		);
	});

	it.each(['chrome', 'firefox'])('ships a minimal Manifest V3 file for %s', async (browser) => {
		const manifest = JSON.parse(
			await readFile(
				new URL(`../browser-extension/src/manifest.${browser}.json`, import.meta.url),
				'utf8'
			)
		);
		expect(manifest.manifest_version).toBe(3);
		expect(manifest.action.default_popup).toBe('popup.html');
		expect(manifest.permissions).toEqual(['scripting', 'storage']);
		expect(manifest.host_permissions).toEqual([
			'https://www.google.com/*',
			'https://scholar.google.com/*'
		]);
	});

	it('declares that the Firefox build collects only website content', async () => {
		const manifest = JSON.parse(
			await readFile(
				new URL('../browser-extension/src/manifest.firefox.json', import.meta.url),
				'utf8'
			)
		);
		expect(manifest.browser_specific_settings.gecko.data_collection_permissions.required).toEqual([
			'websiteContent'
		]);
	});
});
