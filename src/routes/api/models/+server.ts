import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { listModels } from '$lib/server/ai/model.service';
import { requireUser } from '$lib/server/api';
import { handleApiError } from '$lib/server/api';

/**
 * The catalog is rebuilt per request (provider credentials, discovery caches, custom
 * providers), so the response carries an ETag: a client that already holds this exact
 * list gets a 304 instead of another ~20 KB body.
 */
export async function GET(event: RequestEvent) {
	try {
		const user = await requireUser(event);
		const payload = await listModels(user?.id);
		const etag = `"${createHash('sha256')
			.update(user?.id ?? 'anonymous')
			.update(JSON.stringify(payload))
			.digest('base64url')}"`;
		const headers = { etag, 'cache-control': 'private, no-cache' };
		const ifNoneMatch = event.request.headers.get('if-none-match');
		if (
			ifNoneMatch &&
			ifNoneMatch
				.split(',')
				.map((value) => value.trim())
				.includes(etag)
		) {
			return new Response(null, { status: 304, headers });
		}
		return json(payload, { headers });
	} catch (error) {
		return handleApiError(error);
	}
}
