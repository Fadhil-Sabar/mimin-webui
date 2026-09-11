import { describe, expect, it, vi } from 'vitest';
import {
	classifyContentType,
	createWebFetchTool,
	decodeEntities,
	extractHtmlTitle,
	fetchWebPage,
	htmlToReadableText,
	WEB_FETCH_MAX_BYTES,
	WebFetchError
} from '../src/lib/server/ai/tools/web-fetch.tool';

const PUBLIC_HOST = '93.184.216.34';
const lookupPublic = async () => [PUBLIC_HOST];

function response(
	body: string | Uint8Array,
	init: { status?: number; headers?: Record<string, string> } = {}
) {
	return new Response(body as BodyInit, {
		status: init.status ?? 200,
		headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers }
	});
}

function redirect(location: string) {
	return new Response(null, { status: 302, headers: { location } });
}

function failingFetcher() {
	return vi.fn(async () => {
		throw new Error('the network should not be reached');
	});
}

async function rejection(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return error as WebFetchError;
	}
	throw new Error('expected the promise to reject');
}

describe('web fetch text extraction', () => {
	const document = `<!doctype html>
<html>
	<head>
		<title>  Escaping &amp; Entities | Docs  </title>
		<style>p { color: red }</style>
		<script>window.tracker = "load";</script>
	</head>
	<body>
		<nav><a href="/home">Menu item</a></nav>
		<main>
			<h1>Getting started</h1>
			<p>First &mdash; install it.  Second&nbsp;step.</p>
			<ul><li>Alpha</li><li>Beta</li></ul>
			<footer>Copyright 2026</footer>
		</main>
	</body>
</html>`;

	it('reads the title and drops non-content elements', () => {
		expect(extractHtmlTitle(document)).toBe('Escaping & Entities | Docs');
		const text = htmlToReadableText(document);
		expect(text).toContain('Getting started');
		expect(text).toContain('First — install it. Second step.');
		expect(text).toContain('Alpha');
		expect(text).not.toContain('color: red');
		expect(text).not.toContain('window.tracker');
		expect(text).not.toContain('Menu item');
		expect(text).not.toContain('Copyright 2026');
		expect(text).not.toContain('<p>');
	});

	it('decodes numeric, hex, and named entities and leaves unknown ones alone', () => {
		expect(decodeEntities('&#65;&#x42;&amp;&nbsp;&unknown;')).toBe('AB& &unknown;');
		expect(decodeEntities('&#999999999;')).toBe('');
	});

	it.each([
		['text/html', '<p>hi</p>', 'html'],
		['text/html; charset=utf-8', 'hi', 'html'],
		['application/xhtml+xml', '<p>hi</p>', 'html'],
		['application/json', '{"a":1}', 'json'],
		['application/ld+json', '{"a":1}', 'json'],
		['text/plain', 'hi', 'text'],
		['application/xml', '<a/>', 'text'],
		['application/atom+xml', '<feed/>', 'text'],
		['image/png', 'binary', 'binary'],
		['application/pdf', '%PDF-1.7', 'binary'],
		['', '<p>hi</p>', 'html'],
		['application/octet-stream', 'hi\u0000', 'binary']
	])('classifies %s as %s', (contentType, body, kind) => {
		expect(classifyContentType(contentType, body)).toBe(kind);
	});
});

describe('fetchWebPage', () => {
	it('returns readable text, title, and content type for an HTML page', async () => {
		const fetcher = vi.fn(async () =>
			response('<html><head><title>Docs</title></head><body><h1>Hello</h1></body></html>')
		);
		const result = await fetchWebPage(
			{ url: 'https://example.com/docs' },
			{ fetcher, lookupHost: lookupPublic }
		);
		expect(result.title).toBe('Docs');
		expect(result.text).toBe('Hello');
		expect(result.contentType).toBe('text/html');
		expect(result.truncated).toBe(false);
		expect(result.notice).toBeUndefined();
		expect(fetcher).toHaveBeenCalledWith(
			'https://example.com/docs',
			expect.objectContaining({ redirect: 'manual' })
		);
	});

	it('pretty-prints JSON and leaves plain text untouched', async () => {
		const json = await fetchWebPage(
			{ url: 'https://example.com/data.json' },
			{
				fetcher: async () =>
					response('{"b":2,"a":1}', { headers: { 'content-type': 'application/json' } }),
				lookupHost: lookupPublic
			}
		);
		expect(json.text).toBe('{\n  "b": 2,\n  "a": 1\n}');
		expect(json.title).toBeNull();

		const text = await fetchWebPage(
			{ url: 'https://example.com/robots.txt' },
			{
				fetcher: async () =>
					response('User-agent: *', { headers: { 'content-type': 'text/plain' } }),
				lookupHost: lookupPublic
			}
		);
		expect(text.text).toBe('User-agent: *');
	});

	it('honors the declared charset', async () => {
		const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
		const result = await fetchWebPage(
			{ url: 'https://example.com/latin1' },
			{
				fetcher: async () =>
					response(latin1, { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }),
				lookupHost: lookupPublic
			}
		);
		expect(result.text).toBe('café');
	});

	it('marks a page it truncated and keeps the limit', async () => {
		const body = `<p>${'long content '.repeat(300)}</p>`;
		const result = await fetchWebPage(
			{ url: 'https://example.com/long', maxChars: 500 },
			{ fetcher: async () => response(body), lookupHost: lookupPublic }
		);
		expect(result.text.length).toBe(500);
		expect(result.truncated).toBe(true);
	});

	it('refuses a page larger than the byte budget instead of reporting half a document', async () => {
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://example.com/huge' },
				{
					fetcher: async () =>
						response('x'.repeat(WEB_FETCH_MAX_BYTES + 1), {
							headers: { 'content-type': 'text/plain' }
						}),
					lookupHost: lookupPublic
				}
			)
		);
		expect(error.code).toBe('WEB_FETCH_TOO_LARGE');
	});

	it('follows redirects and reports the final URL', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(redirect('https://cdn.example.com/final'))
			.mockResolvedValueOnce(response('<title>Final</title><p>Arrived</p>'));
		const result = await fetchWebPage(
			{ url: 'https://example.com/start' },
			{ fetcher, lookupHost: lookupPublic }
		);
		expect(result.url).toBe('https://cdn.example.com/final');
		expect(result.text).toBe('Arrived');
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('resolves a relative redirect against the current URL', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(redirect('/moved'))
			.mockResolvedValueOnce(response('<p>Moved</p>'));
		const result = await fetchWebPage(
			{ url: 'https://example.com/a/b' },
			{ fetcher, lookupHost: lookupPublic }
		);
		expect(result.url).toBe('https://example.com/moved');
	});

	it('validates every redirect hop instead of trusting the first URL', async () => {
		const fetcher = vi.fn(async () => redirect('http://169.254.169.254/latest/meta-data'));
		const error = await rejection(
			fetchWebPage({ url: 'https://example.com/start' }, { fetcher, lookupHost: lookupPublic })
		);
		expect(error.code).toBe('WEB_FETCH_URL_NOT_ALLOWED');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('stops a redirect chain that never ends', async () => {
		const fetcher = vi.fn(async (target: string) => redirect(`${target}/next`));
		const error = await rejection(
			fetchWebPage({ url: 'https://example.com/1' }, { fetcher, lookupHost: lookupPublic })
		);
		expect(error.code).toBe('WEB_FETCH_TOO_MANY_REDIRECTS');
		expect(fetcher).toHaveBeenCalledTimes(6);
	});

	it.each([
		['https://127.0.0.1/admin', 'WEB_FETCH_URL_NOT_ALLOWED'],
		['https://localhost/admin', 'WEB_FETCH_URL_NOT_ALLOWED'],
		['https://192.168.0.1/router', 'WEB_FETCH_URL_NOT_ALLOWED'],
		['file:///etc/passwd', 'WEB_FETCH_URL_NOT_ALLOWED'],
		['https://user:secret@example.com/', 'WEB_FETCH_URL_NOT_ALLOWED'],
		['https://metadata.google.internal/computeMetadata/v1/', 'WEB_FETCH_PRIVATE_ADDRESS'],
		['https://router.local/', 'WEB_FETCH_PRIVATE_ADDRESS']
	])('refuses %s without sending a request', async (url, code) => {
		const fetcher = failingFetcher();
		const error = await rejection(fetchWebPage({ url }, { fetcher, lookupHost: lookupPublic }));
		expect(error.code).toBe(code);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('refuses a public name that resolves to a private address', async () => {
		const fetcher = failingFetcher();
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://wiki.corp.example/page' },
				{ fetcher, lookupHost: async () => ['10.4.0.9'] }
			)
		);
		expect(error.code).toBe('WEB_FETCH_PRIVATE_ADDRESS');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('refuses a host that does not resolve', async () => {
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://missing.example/page' },
				{
					fetcher: failingFetcher(),
					lookupHost: async () => {
						throw new Error('ENOTFOUND');
					}
				}
			)
		);
		expect(error.code).toBe('WEB_FETCH_DNS_FAILED');
	});

	it('reports an HTTP error status', async () => {
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://example.com/missing' },
				{ fetcher: async () => response('gone', { status: 404 }), lookupHost: lookupPublic }
			)
		);
		expect(error.code).toBe('WEB_FETCH_HTTP_STATUS');
		expect(error.message).toContain('404');
	});

	it('names a binary content type instead of returning noise', async () => {
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://example.com/scan.pdf' },
				{
					fetcher: async () =>
						response('%PDF-1.7 binary', { headers: { 'content-type': 'application/pdf' } }),
					lookupHost: lookupPublic
				}
			)
		);
		expect(error.code).toBe('WEB_FETCH_UNSUPPORTED_CONTENT');
		expect(error.message).toContain('application/pdf');
	});

	it('reports a page with no readable body text without failing the turn', async () => {
		const result = await fetchWebPage(
			{ url: 'https://example.com/empty' },
			{ fetcher: async () => response('<html><body></body></html>'), lookupHost: lookupPublic }
		);
		expect(result.text).toBe('');
		expect(result.notice).toContain('browser bridge');
	});

	it('drops head, title, and script text from a client-rendered shell', async () => {
		const result = await fetchWebPage(
			{ url: 'https://example.com/app' },
			{
				fetcher: async () =>
					response(
						'<html><head><title>App</title><script src="/app.js"></script></head><body><div id="root">Loading…</div></body></html>'
					),
				lookupHost: lookupPublic
			}
		);
		expect(result.text).toBe('Loading…');
		expect(result.title).toBe('App');
	});

	it('tells the model the page could not be read without inventing it', async () => {
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://example.com/missing' },
				{ fetcher: async () => response('gone', { status: 500 }), lookupHost: lookupPublic }
			)
		);
		expect(error.message).toContain('WEB_FETCH_FAILED (WEB_FETCH_HTTP_STATUS)');
		expect(error.message).toContain('Do not describe or summarize this page from memory');
	});

	it('turns a caller abort into a timeout error', async () => {
		const controller = new AbortController();
		controller.abort();
		const error = await rejection(
			fetchWebPage(
				{ url: 'https://example.com/slow' },
				{
					signal: controller.signal,
					fetcher: async () => {
						throw Object.assign(new Error('aborted'), { name: 'AbortError' });
					},
					lookupHost: lookupPublic
				}
			)
		);
		expect(error.code).toBe('WEB_FETCH_TIMEOUT');
	});
});

describe('web_fetch tool', () => {
	it('describes itself as a server-side reader that cannot run JavaScript', () => {
		const tool = createWebFetchTool();
		expect(tool.name).toBe('web_fetch');
		expect(tool.description).toMatch(/read/i);
		expect(tool.description).toMatch(/JavaScript/);
	});

	it('returns the page text with the URL and title as tool details', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				response(
					'<html><head><title>Release notes</title></head><body><p>v2 is out.</p></body></html>'
				)
			)
		);
		try {
			const tool = createWebFetchTool();
			const result = (await tool.execute(
				'call-1',
				{ url: 'https://example.com/notes' },
				undefined as unknown as AbortSignal
			)) as { content: Array<{ text: string }>; details: Record<string, unknown> };
			expect(result.content[0]?.text).toContain('Fetched page: https://example.com/notes');
			expect(result.content[0]?.text).toContain('Release notes');
			expect(result.content[0]?.text).toContain('v2 is out.');
			expect(result.details).toEqual({
				url: 'https://example.com/notes',
				title: 'Release notes',
				contentType: 'text/html',
				truncated: false
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
