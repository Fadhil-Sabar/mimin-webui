import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerBrowserConsent, revokeBrowserConsent } from '../src/lib/client/api';

describe('browser consent client', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(['once', 'conversation', 'deny'] as const)(
		'posts the %s decision to the conversation endpoint',
		async (decision) => {
			fetchMock.mockResolvedValue(
				new Response(JSON.stringify({ ok: true, decision }), { status: 200 })
			);

			const result = await answerBrowserConsent('conv-1', 'call-a', decision);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('/api/conversations/conv-1/browser-consent');
			expect(init.method).toBe('POST');
			expect(JSON.parse(String(init.body))).toEqual({ requestId: 'call-a', decision });
			expect(result).toEqual({ ok: true, decision });
		}
	);

	it('surfaces the server error message when the request expired', async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					error: {
						code: 'BROWSER_CONSENT_NOT_FOUND',
						message: 'The browser consent request is expired or invalid.'
					}
				}),
				{ status: 404 }
			)
		);

		await expect(answerBrowserConsent('conv-1', 'gone', 'once')).rejects.toThrow(
			'The browser consent request is expired or invalid.'
		);
	});

	it('falls back to a generic error message when the body is not JSON', async () => {
		fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
		await expect(answerBrowserConsent('conv-1', 'call-a', 'once')).rejects.toThrow(
			'Failed to submit browser permission'
		);
	});

	it('revokes a conversation grant with DELETE', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true, revoked: true }), { status: 200 })
		);

		await expect(revokeBrowserConsent('conv-1')).resolves.toBe(true);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/conversations/conv-1/browser-consent');
		expect(init.method).toBe('DELETE');
	});

	it('reports a failed revoke without throwing', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true, revoked: false }), { status: 200 })
		);
		await expect(revokeBrowserConsent('conv-1')).resolves.toBe(false);

		fetchMock.mockResolvedValue(new Response('', { status: 403 }));
		await expect(revokeBrowserConsent('conv-1')).resolves.toBe(false);
	});
});
