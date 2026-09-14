import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import { canvasInput } from '$lib/server/validation';
import { createCanvas, listCanvases } from '$lib/server/canvas.service';
import type { StyleGuideline } from '$lib/canvas';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const projectId = event.url.searchParams.get('projectId');
		const conversationId = event.url.searchParams.get('conversationId');

		const canvases = await listCanvases(user.id, { projectId, conversationId });
		return json({ canvases });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', 'Authentication required.', 401);

		const body = await event.request.json();
		const parsed = canvasInput.safeParse(body);
		if (!parsed.success) {
			return apiError('INVALID_INPUT', 'Invalid canvas payload.');
		}

		const canvas = await createCanvas(user.id, {
			title: parsed.data.title,
			description: parsed.data.description,
			projectId: parsed.data.projectId,
			conversationId: parsed.data.conversationId,
			styleGuideline: parsed.data.styleGuideline as StyleGuideline | undefined
		});

		return json({ canvas }, { status: 201 });
	} catch (error) {
		if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
			return apiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
		}
		if (error instanceof Error && error.message === 'CONVERSATION_NOT_FOUND') {
			return apiError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
		}
		if (error instanceof Error && error.message === 'PROJECT_CONVERSATION_MISMATCH') {
			return apiError(
				'PROJECT_CONVERSATION_MISMATCH',
				'The specified project does not match the conversation project.',
				400
			);
		}
		return handleApiError(error);
	}
};
