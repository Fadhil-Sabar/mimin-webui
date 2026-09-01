import { json } from '@sveltejs/kit';
import { listTools } from '$lib/server/ai/tools/registry';
export function GET({ url }) { return json({ tools: listTools(url.searchParams.get('projectId') ?? undefined) }); }
