import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const BROWSER_BRIDGE_TIMEOUT_MS = 45_000;
export const BROWSER_BRIDGE_HEADER = 'x-mimin-browser-bridge';

export type BrowserBridgeAction = 'browser_open' | 'browser_search';

export type BrowserPageLink = {
	title: string;
	url: string;
};

export type BrowserSearchResult = {
	title: string;
	url: string;
	snippet: string;
};

export type BrowserPageResult = {
	url: string;
	readable: boolean;
	title?: string;
	text?: string;
	links?: BrowserPageLink[];
	results?: BrowserSearchResult[];
	tabId?: string | number;
	reason?: string;
	captcha?: boolean;
};

export type BrowserBridgeEvent = {
	type: 'browser.request';
	requestId: string;
	token: string;
	action: BrowserBridgeAction;
	args: Record<string, unknown>;
};

export type BrowserBridgeContext = {
	userId: string;
	conversationId: string;
	turnToken: string;
};

export function assertPublicHttpUrl(value: string) {
	if (value.length > 2_048) throw browserError('INVALID_URL');
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw browserError('INVALID_URL');
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) throw browserError('INVALID_URL');
	if (parsed.username || parsed.password) throw browserError('INVALID_URL');
	const hostname = parsed.hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	const privateHost =
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal') ||
		hostname === '0.0.0.0' ||
		hostname === '::1' ||
		hostname === '::' ||
		hostname.startsWith('127.') ||
		hostname.startsWith('10.') ||
		hostname.startsWith('192.168.') ||
		/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
		hostname.startsWith('169.254.') ||
		/^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.)/.test(hostname) ||
		/^(fc|fd)[0-9a-f]{2}:/i.test(hostname) ||
		/^fe8[0-9a-f]:/i.test(hostname);
	if (privateHost) throw browserError('PRIVATE_URL');
	return parsed.href;
}

type PendingRequest = BrowserBridgeContext & {
	requestId: string;
	token: string;
	action: BrowserBridgeAction;
	resolve: (result: BrowserPageResult) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

export type BrowserSession = {
	tabId: string | number;
	updatedAt: number;
};

export const BROWSER_SESSION_TTL_MS = 60 * 60 * 1000;
const browserSessions = new Map<string, BrowserSession>();

export function browserSessionKey(context: { userId: string; conversationId: string }): string {
	return `${context.userId}:${context.conversationId}`;
}

export function getBrowserSession(
	userId: string,
	conversationId: string
): BrowserSession | undefined {
	const key = `${userId}:${conversationId}`;
	const session = browserSessions.get(key);
	if (!session) return undefined;
	if (Date.now() - session.updatedAt > BROWSER_SESSION_TTL_MS) {
		browserSessions.delete(key);
		return undefined;
	}
	return session;
}

export function setBrowserSession(
	userId: string,
	conversationId: string,
	tabId: string | number
): void {
	const key = `${userId}:${conversationId}`;
	browserSessions.set(key, {
		tabId,
		updatedAt: Date.now()
	});
}

export function clearBrowserSession(userId: string, conversationId: string): void {
	const key = `${userId}:${conversationId}`;
	browserSessions.delete(key);
}

export function clearStaleBrowserSessions(): void {
	const now = Date.now();
	for (const [key, session] of browserSessions.entries()) {
		if (now - session.updatedAt > BROWSER_SESSION_TTL_MS) {
			browserSessions.delete(key);
		}
	}
}

const httpUrlSchema = z
	.string()
	.url()
	.max(4_000)
	.refine((value) => /^https?:\/\//i.test(value), 'Only HTTP(S) URLs are accepted.');

const linkSchema = z.object({
	title: z.string().trim().max(500),
	url: httpUrlSchema
});

const searchResultSchema = z.object({
	title: z.string().trim().max(500),
	url: httpUrlSchema,
	snippet: z.string().max(4_000)
});

export const browserPageResultSchema = z
	.object({
		url: httpUrlSchema,
		title: z.string().trim().max(500).optional(),
		text: z.string().max(50_000).optional(),
		links: z.array(linkSchema).max(100).optional(),
		results: z.array(searchResultSchema).max(100).optional(),
		tabId: z.union([z.string().max(200), z.number().int().nonnegative()]).optional(),
		readable: z.boolean(),
		reason: z.string().trim().max(1_000).optional(),
		captcha: z.boolean().optional()
	})
	.strict();

export const browserResultSchema = z
	.object({
		requestId: z.string().uuid(),
		token: z.string().uuid(),
		ok: z.boolean(),
		result: browserPageResultSchema.optional(),
		error: z.string().trim().max(1_000).optional()
	})
	.strict()
	.refine((value) => (value.ok ? Boolean(value.result) : Boolean(value.error)), {
		message: 'A successful browser result needs result data; a failed result needs an error.'
	});

function browserError(message: string) {
	return new Error(`BROWSER_BRIDGE_${message}`);
}

function clearPending(request: PendingRequest) {
	clearTimeout(request.timer);
	pendingRequests.delete(request.requestId);
}

function rejectPending(request: PendingRequest, error: Error) {
	clearPending(request);
	request.reject(error);
}

function isAbortError(error: unknown) {
	return error instanceof Error && error.name === 'AbortError';
}

/**
 * Send one browser command to the connected page and wait for its acknowledgement.
 * The request is bound to the authenticated user, conversation and turn token so a
 * late or cross-conversation response cannot settle another agent turn.
 */
export function requestBrowserAction(
	context: BrowserBridgeContext,
	action: BrowserBridgeAction,
	args: Record<string, unknown>,
	emit: (event: BrowserBridgeEvent) => void,
	signal?: AbortSignal
) {
	if (signal?.aborted) return Promise.reject(browserError('CANCELED'));

	const requestId = randomUUID();
	const token = randomUUID();

	const session = getBrowserSession(context.userId, context.conversationId);
	const browserArgs: Record<string, unknown> = {
		...args,
		...(session?.tabId !== undefined ? { preferredTabId: session.tabId } : {})
	};

	return new Promise<BrowserPageResult>((resolve, reject) => {
		const timer = setTimeout(() => {
			const request = pendingRequests.get(requestId);
			if (request) rejectPending(request, browserError('TIMEOUT'));
		}, BROWSER_BRIDGE_TIMEOUT_MS);
		const request: PendingRequest = {
			...context,
			requestId,
			token,
			action,
			resolve: (result) => {
				clearPending(request);
				if (result.tabId !== undefined) {
					setBrowserSession(request.userId, request.conversationId, result.tabId);
				}
				resolve(result);
			},
			reject: (error) => {
				clearPending(request);
				if (error && /INVALID_TAB|TAB_CLOSED|TAB_NOT_FOUND/.test(error.message)) {
					clearBrowserSession(request.userId, request.conversationId);
				}
				reject(error);
			},
			timer
		};
		pendingRequests.set(requestId, request);
		if (signal) {
			const abort = () => {
				const current = pendingRequests.get(requestId);
				if (current) rejectPending(current, browserError('CANCELED'));
			};
			signal.addEventListener('abort', abort, { once: true });
			const removeAbortListener = () => signal.removeEventListener('abort', abort);
			request.resolve = (result) => {
				removeAbortListener();
				clearPending(request);
				if (result.tabId !== undefined) {
					setBrowserSession(request.userId, request.conversationId, result.tabId);
				}
				resolve(result);
			};
			request.reject = (error) => {
				removeAbortListener();
				clearPending(request);
				if (error && /INVALID_TAB|TAB_CLOSED|TAB_NOT_FOUND/.test(error.message)) {
					clearBrowserSession(request.userId, request.conversationId);
				}
				reject(error);
			};
		}
		try {
			emit({ type: 'browser.request', requestId, token, action, args: browserArgs });
		} catch (error) {
			const current = pendingRequests.get(requestId);
			if (current)
				rejectPending(current, error instanceof Error ? error : browserError('DISPATCH_FAILED'));
		}
	});
}

/** Settle a request from the authenticated browser-result endpoint. */
export function settleBrowserRequest(
	userId: string,
	requestId: string,
	token: string,
	ok: boolean,
	result?: BrowserPageResult,
	error?: string
) {
	const request = pendingRequests.get(requestId);
	if (!request || request.userId !== userId || request.token !== token) return false;
	if (ok && result) request.resolve(result);
	else request.reject(browserError(error?.trim() || 'FAILED'));
	return true;
}

/** Reject all requests owned by a turn when the stream is canceled or finalized. */
export function cancelBrowserRequests(conversationId: string, turnToken: string) {
	for (const request of [...pendingRequests.values()]) {
		if (request.conversationId === conversationId && request.turnToken === turnToken) {
			rejectPending(request, browserError('CANCELED'));
		}
	}
}

export function pendingBrowserRequestCount() {
	return pendingRequests.size;
}

export function isBrowserBridgeAbortError(error: unknown) {
	return (
		isAbortError(error) ||
		(error instanceof Error && /BROWSER_BRIDGE_(CANCELED|TIMEOUT)/.test(error.message))
	);
}
