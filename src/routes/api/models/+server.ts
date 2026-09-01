import { json } from '@sveltejs/kit';
import { listModels } from '$lib/server/ai/model.service';
import { handleApiError } from '$lib/server/api';
export async function GET() { try { return json({ models: await listModels() }); } catch (error) { return handleApiError(error); } }
