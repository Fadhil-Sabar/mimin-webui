import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { stopConversation } from '$lib/server/ai/agent.service';
export const POST: RequestHandler = async ({ params }) => json({ stopped: stopConversation(params.id ?? '') });
