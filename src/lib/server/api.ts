import { json } from '@sveltejs/kit';

export function apiError(code: string, message: string, status = 400) {
	return json({ error: { code, message } }, { status });
}

export function handleApiError(error: unknown) {
	console.error(error);
	return apiError('INTERNAL_ERROR', 'The request could not be completed.', 500);
}
