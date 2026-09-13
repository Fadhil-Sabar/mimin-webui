import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { apiError, getOwnedProject, handleApiError, requireUser } from '$lib/server/api';
import { listTools } from '$lib/server/ai/tools/registry';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const projectId = event.url.searchParams.get('projectId');
		if (projectId) {
			const project = await getOwnedProject(projectId, user.id);
			if (!project) return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
			return json({ tools: listTools(project.id) });
		}

		const includeProjectTools = event.url.searchParams.get('includeProjectTools') === 'true';
		return json({ tools: listTools(undefined, { includeProjectTools }) });
	} catch (error) {
		return handleApiError(error);
	}
}
