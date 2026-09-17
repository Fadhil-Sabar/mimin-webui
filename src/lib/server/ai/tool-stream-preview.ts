/**
 * Helpers for surfacing a tool call while the model is still writing it.
 *
 * pi streams tool-call arguments token by token, long before the tool executes.
 * `create_scene`/`edit_scene` put their whole HTML/CSS payload in the arguments, so
 * an unassisted UI shows nothing until the call is already finished. These helpers
 * read the partial call and bound what is forwarded to the browser.
 */

/**
 * Bound a streamed tool-call argument preview for the live tool card.
 *
 * Forwarding the raw values on every delta would resend the growing document
 * repeatedly, so long strings are truncated. The fields the card reads for its label
 * (scene name, viewport, url, query) are short and are left untouched.
 */
export function previewToolInput(value: unknown, maxStringLength = 200): unknown {
	if (typeof value === 'string')
		return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value;
	if (Array.isArray(value)) return value.map((item) => previewToolInput(item, maxStringLength));
	if (value && typeof value === 'object') {
		const preview: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			preview[key] = previewToolInput(item, maxStringLength);
		}
		return preview;
	}
	return value;
}

export type StreamingToolCallBlock = {
	id: string;
	name: string;
	arguments: unknown;
};

/**
 * Read the tool call block the assistant is currently streaming from a partial
 * message. Providers populate `arguments` best-effort while the call is generated,
 * so this yields the call as soon as its id and name exist.
 */
export function streamingToolCallBlock(
	partial: unknown,
	contentIndex: number | undefined
): StreamingToolCallBlock | null {
	if (!partial || typeof partial !== 'object') return null;
	const content = (partial as { content?: unknown }).content;
	if (!Array.isArray(content)) return null;
	const index =
		typeof contentIndex === 'number' && contentIndex >= 0 && contentIndex < content.length
			? contentIndex
			: content.length - 1;
	const block = content[index];
	if (!block || typeof block !== 'object') return null;
	const candidate = block as { type?: unknown; id?: unknown; name?: unknown; arguments?: unknown };
	if (candidate.type !== 'toolCall') return null;
	if (typeof candidate.id !== 'string' || !candidate.id) return null;
	return {
		id: candidate.id,
		name: typeof candidate.name === 'string' ? candidate.name : '',
		arguments: candidate.arguments
	};
}
