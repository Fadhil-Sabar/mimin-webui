import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { listModels } from '$lib/server/ai/model.service';
import { requireUser } from '$lib/server/api';
import { handleApiError } from '$lib/server/api';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireUser(event);
		return json(await listModels(user?.id));
	} catch (error) {
		return handleApiError(error);
	}
}
