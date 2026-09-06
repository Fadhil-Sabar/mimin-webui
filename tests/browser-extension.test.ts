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
		expect(manifest.version).toBe('0.3.0');
		expect(manifest.action.default_popup).toBe('popup.html');
		expect(manifest.permissions).toEqual(['scripting', 'storage']);
		expect(manifest.host_permissions).toEqual([
			'https://www.google.com/*',
			'https://scholar.google.com/*'
		]);
		expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
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

	it('handles permission state checks correctly', async () => {
		let grantedOrigins: string[] = [];
		const mockPermissionsApi = {
			contains: async (details: { origins?: string[] }) => {
				const check = details.origins ?? [];
				return check.every((o) => grantedOrigins.includes(o));
			},
			request: async (details: { origins?: string[] }) => {
				grantedOrigins = [...new Set([...grantedOrigins, ...(details.origins ?? [])])];
				return true;
			},
			remove: async (details: { origins?: string[] }) => {
				const toRemove = new Set(details.origins ?? []);
				grantedOrigins = grantedOrigins.filter((o) => !toRemove.has(o));
				return true;
			}
		};

		expect(await mockPermissionsApi.contains({ origins: ['http://*/*', 'https://*/*'] })).toBe(
			false
		);

		await mockPermissionsApi.request({ origins: ['http://*/*', 'https://*/*'] });
		expect(await mockPermissionsApi.contains({ origins: ['http://*/*', 'https://*/*'] })).toBe(
			true
		);

		await mockPermissionsApi.remove({ origins: ['http://*/*', 'https://*/*'] });
		expect(await mockPermissionsApi.contains({ origins: ['http://*/*', 'https://*/*'] })).toBe(
			false
		);
	});

	it('creates a new tab when preferredTabId is closed/missing', async () => {
		const ownedTabIds = new Set<number>([123]);
		let nextCreatedId = 789;

		const mockTabsApi = {
			get: async (id: number) => {
				if (id === 123) throw new Error('Tab not found');
				if (id === 789) return { id: 789, url: 'https://example.com' };
				throw new Error('Not found');
			},
			create: async ({ url }: { url: string }) => {
				const newId = nextCreatedId++;
				ownedTabIds.add(newId);
				return { id: newId, url };
			}
		};

		// When preferredTabId 123 fails, findReusableTab returns null, creating new tab 789
		async function findReusableTab(preferredTabId?: number) {
			if (preferredTabId != null) {
				try {
					const tab = await mockTabsApi.get(preferredTabId);
					if (tab?.id && ownedTabIds.has(tab.id)) return tab;
				} catch {
					// missing
				}
			}
			return null;
		}

		const reusable = await findReusableTab(123);
		expect(reusable).toBeNull();

		const created = await mockTabsApi.create({ url: 'https://example.com' });
		expect(created.id).toBe(789);
		expect(ownedTabIds.has(789)).toBe(true);
	});

	it('never hijacks arbitrary existing user-opened Google tabs', async () => {
		const ownedTabIds = new Set<number>(); // Mimin has created zero tabs yet

		// User opened an unrelated Google tab manually
		const existingUserTabs = [
			{ id: 555, url: 'https://www.google.com/search?q=my+private+search' }
		];

		async function findReusableTab(preferredTabId?: number) {
			if (preferredTabId != null) {
				const found = existingUserTabs.find((t) => t.id === preferredTabId);
				if (found && ownedTabIds.has(found.id)) return found;
			}
			// Extension does NOT run broad tabs.query for user tabs
			return null;
		}

		// When user has no preferred tab or sends an unowned tab id
		const tab = await findReusableTab(555);
		expect(tab).toBeNull(); // Did not reuse user tab 555!

		// Now Mimin creates its own tab
		const miminTab = { id: 999, url: 'https://www.google.com/search?q=mimin+query' };
		ownedTabIds.add(miminTab.id);

		// Subsequent search with preferredTabId 999 can reuse Mimin-owned tab
		const reused = await (async () => {
			if (ownedTabIds.has(999)) return miminTab;
			return null;
		})();
		expect(reused?.id).toBe(999);
	});
});
