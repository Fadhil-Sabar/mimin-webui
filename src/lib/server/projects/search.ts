import { apiError } from '$lib/server/api';

export const PROJECT_FILE_QUERY_MAX_LENGTH = 200;

export function parseProjectSearchQuery(
	value: string | null,
	parameter = 'fileQuery'
): string | Response {
	const query = value?.trim() ?? '';
	if (query.length > PROJECT_FILE_QUERY_MAX_LENGTH)
		return apiError(
			'INVALID_INPUT',
			`${parameter} must be at most ${PROJECT_FILE_QUERY_MAX_LENGTH} characters.`
		);
	return query;
}

export function parseProjectFileQuery(value: string | null): string | Response {
	return parseProjectSearchQuery(value);
}

export function escapeLikePattern(value: string) {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
