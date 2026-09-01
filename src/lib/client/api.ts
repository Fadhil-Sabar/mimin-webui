export type SseEvent = { type: string; [key: string]: unknown };

export async function createConversation(input: { projectId?: string | null; model?: string; enabledTools?: string[] } = {}) {
	const response = await fetch('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
	if (!response.ok) throw new Error((await response.json()).error?.message ?? 'Could not create conversation');
	return (await response.json()).conversation;
}

export async function stopConversation(id: string) { await fetch(`/api/conversations/${id}/stop`, { method: 'POST' }); }

export async function streamMessage(id: string, content: string, onEvent: (event: SseEvent) => void, signal?: AbortSignal) {
	const response = await fetch(`/api/conversations/${id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ content }), signal });
	if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error?.message ?? 'Could not send message');
	const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
	while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let boundary = buffer.indexOf('\n\n'); while (boundary !== -1) { const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); const data = block.split('\n').find((line) => line.startsWith('data: ')); if (data) onEvent(JSON.parse(data.slice(6))); boundary = buffer.indexOf('\n\n'); } }
	if (buffer.trim()) { const data = buffer.split('\n').find((line) => line.startsWith('data: ')); if (data) onEvent(JSON.parse(data.slice(6))); }
}
