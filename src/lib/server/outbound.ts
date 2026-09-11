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

/**
 * Loopback, link-local (cloud metadata), and private-range addresses. A public HTTPS URL is
 * otherwise allowed automatically, so this is what keeps a model-chosen fetch away from the
 * server's own network and the host's metadata service.
 */
export function isPrivateAddress(value: string) {
	const host = value
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	return (
		host === '0.0.0.0' ||
		host === '::' ||
		host === '::1' ||
		host.startsWith('127.') ||
		host.startsWith('10.') ||
		host.startsWith('192.168.') ||
		/^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
		host.startsWith('169.254.') ||
		/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
		/^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/.test(
			host
		) ||
		/^(fc|fd)[0-9a-f]{2}:/i.test(host) ||
		/^fe8[0-9a-f]:/i.test(host)
	);
}

/** Names that only resolve inside a host, a local network, or a cloud metadata service. */
export function isPrivateHostname(value: string) {
	const hostname = value
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	return (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal') ||
		isPrivateAddress(hostname)
	);
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

	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	const isIpOrLocal =
		host === 'localhost' ||
		!host.includes('.') ||
		/^(\d+|0x[0-9a-f]+)(\.(\d+|0x[0-9a-f]+))*$/i.test(host) ||
		host.includes(':');

	if (url.protocol === 'https:' && !isIpOrLocal) return;

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
