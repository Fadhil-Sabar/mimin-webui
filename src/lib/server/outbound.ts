import { env } from '$env/dynamic/private';

const BUILTIN_ORIGINS = new Set([
	'https://api.openai.com',
	'https://api.anthropic.com',
	'https://generativelanguage.googleapis.com',
	'https://api.deepseek.com',
	'https://api.commandcode.ai',
	'https://api.tavily.com',
	'https://html.duckduckgo.com',
	'https://duckduckgo.com',
	'https://lite.duckduckgo.com',
	'https://searx.be',
	'https://cloudflare-dns.com',
	'https://dns.google',
	'https://en.wikipedia.org'
]);

export class OutboundUrlError extends Error {
	constructor() {
		super(
			'OUTBOUND_URL_NOT_ALLOWED: Ask the server administrator to approve this endpoint in OUTBOUND_ALLOWED_ORIGINS. URLs must use HTTP or HTTPS without embedded credentials.'
		);
		this.name = 'OutboundUrlError';
	}
}

function configuredOrigins() {
	const values = [
		process.env.OUTBOUND_ALLOWED_ORIGINS,
		env.OUTBOUND_ALLOWED_ORIGINS,
		process.env.SEARXNG_URL,
		env.SEARXNG_URL,
		process.env.WEB_SEARCH_URL,
		env.WEB_SEARCH_URL
	];
	return values
		.flatMap((value) => (value ?? '').split(','))
		.map((value) => {
			try {
				return new URL(value.trim()).origin;
			} catch {
				return '';
			}
		})
		.filter(Boolean);
}

export function assertAllowedOutboundUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new OutboundUrlError();
	}
	if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new OutboundUrlError();
	const allowed = new Set([...BUILTIN_ORIGINS, ...configuredOrigins()]);
	if (!allowed.has(url.origin)) throw new OutboundUrlError();
}

export function outboundOrigin(value: string) {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}
