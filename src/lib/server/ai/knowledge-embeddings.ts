import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { assertAllowedOutboundUrl } from '../outbound';

export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_BATCH_SIZE = 32;

/** Explicit opt-in: project content is sent only to the administrator's chosen endpoint. */
export function embeddingConfig() {
	if (env.KNOWLEDGE_EMBEDDINGS_ENABLED !== 'true') return null;
	const endpoint = env.KNOWLEDGE_EMBEDDING_URL || 'https://api.openai.com/v1/embeddings';
	assertAllowedOutboundUrl(endpoint);
	const model = env.KNOWLEDGE_EMBEDDING_MODEL || 'text-embedding-3-small';
	const key = env.KNOWLEDGE_EMBEDDING_API_KEY || env.OPENAI_API_KEY;
	if (!key) throw new Error('KNOWLEDGE_EMBEDDING_KEY_MISSING');
	// Changing endpoint/model never compares vectors from different embedding spaces.
	const identity = createHash('sha256')
		.update(`${endpoint}\n${model}\n${EMBEDDING_DIMENSIONS}`)
		.digest('hex');
	return { endpoint, model, key, identity };
}

export function validateEmbedding(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.length === EMBEDDING_DIMENSIONS &&
		value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 3.4e38) &&
		value.some((n) => n !== 0)
	);
}

export async function embedKnowledge(input: string[], signal?: AbortSignal) {
	const config = embeddingConfig();
	if (!config) return null;
	if (
		!input.length ||
		input.length > EMBEDDING_BATCH_SIZE ||
		input.some((text) => !text.trim() || text.length > 8000)
	)
		throw new Error('KNOWLEDGE_EMBEDDING_INPUT_INVALID');
	const timeout = AbortSignal.timeout(15_000);
	const response = await fetch(config.endpoint, {
		method: 'POST',
		redirect: 'error',
		headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: config.model,
			input,
			dimensions: EMBEDDING_DIMENSIONS,
			encoding_format: 'float'
		}),
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout
	});
	if (!response.ok) throw new Error(`KNOWLEDGE_EMBEDDING_HTTP_${response.status}`);
	// Bound provider responses as well as request size (32 float vectors fit comfortably).
	const reader = response.body?.getReader();
	if (!reader) throw new Error('KNOWLEDGE_EMBEDDING_RESPONSE_INVALID');
	let bytes = 0;
	const parts: Uint8Array[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > 4 * 1024 * 1024) throw new Error('KNOWLEDGE_EMBEDDING_RESPONSE_TOO_LARGE');
			parts.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as {
		data?: Array<{ index: number; embedding: unknown }>;
	};
	if (!Array.isArray(body.data) || body.data.length !== input.length)
		throw new Error('KNOWLEDGE_EMBEDDING_RESPONSE_INVALID');
	const vectors: number[][] = new Array(input.length);
	for (const item of body.data) {
		if (
			!Number.isInteger(item.index) ||
			item.index < 0 ||
			item.index >= input.length ||
			vectors[item.index] ||
			!validateEmbedding(item.embedding)
		)
			throw new Error('KNOWLEDGE_EMBEDDING_RESPONSE_INVALID');
		vectors[item.index] = item.embedding;
	}
	return { vectors, identity: config.identity };
}
