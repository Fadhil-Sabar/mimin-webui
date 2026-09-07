import type { Marked, Token } from 'marked';
import { isMermaidLanguage } from './mermaid';

export type MarkdownSegment =
	{ type: 'html'; html: string; id: string } | { type: 'mermaid'; code: string; id: string };

/**
 * Strips outer ```markdown or ```md document wrapper fences that LLMs frequently
 * produce around multi-section documents (e.g. PRDs or full markdown reports).
 *
 * When an outer ```markdown fence contains inner code blocks (like ``` or ```mermaid),
 * CommonMark treats the first inner fence as terminating the outer block, inverting
 * all subsequent code blocks and trapping sections and diagrams inside raw code boxes.
 */
export function unwrapMarkdownDocument(text: string): string {
	if (!text || typeof text !== 'string') return text;

	const lines = text.split('\n');
	const fenceIndices: Array<{ index: number; raw: string; lang: string }> = [];

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (trimmed.startsWith('```')) {
			fenceIndices.push({
				index: i,
				raw: lines[i],
				lang: trimmed.slice(3).trim().toLowerCase()
			});
		}
	}

	if (fenceIndices.length === 0) return text;

	const linesToRemove = new Set<number>();

	for (let f = 0; f < fenceIndices.length; f++) {
		const fence = fenceIndices[f];
		if (linesToRemove.has(fence.index)) continue;

		if (fence.lang === 'markdown' || fence.lang === 'md') {
			const remainingFences = fenceIndices
				.slice(f + 1)
				.filter((fi) => !linesToRemove.has(fi.index));

			// Determine if this is a document wrapper:
			// 1. If there are inner code fences before the matching closing fence
			// 2. OR if there is document structure (markdown headings `# `, `## `, or task lists `- [ ]`)
			const hasInnerFences = remainingFences.length > 1;
			let hasDocumentStructure = false;
			const scanEnd =
				remainingFences.length > 0
					? remainingFences[remainingFences.length - 1].index
					: lines.length;

			for (let j = fence.index + 1; j < scanEnd; j++) {
				if (/^\s*(#{1,6}\s+|-\s+\[[ x]\])/.test(lines[j])) {
					hasDocumentStructure = true;
					break;
				}
			}

			if (hasInnerFences || hasDocumentStructure) {
				linesToRemove.add(fence.index);
				// If remainingFences length is odd (2K + 1), the last one is the closing fence for this outer block
				if (remainingFences.length % 2 === 1) {
					const closingFence = remainingFences[remainingFences.length - 1];
					linesToRemove.add(closingFence.index);
				}
			}
		}
	}

	if (linesToRemove.size === 0) return text;
	return lines.filter((_, idx) => !linesToRemove.has(idx)).join('\n');
}

export function parseMarkdownSegments(markdown: string, marked: Marked): MarkdownSegment[] {
	if (!markdown || typeof markdown !== 'string') {
		return [];
	}

	const cleaned = unwrapMarkdownDocument(markdown);
	const tokens = marked.lexer(cleaned);
	const segments: MarkdownSegment[] = [];
	let currentTokens: Token[] = [];
	let mermaidCounter = 0;

	for (const token of tokens) {
		if (token.type === 'code' && isMermaidLanguage(token.lang)) {
			if (currentTokens.length > 0) {
				const html = marked.parser(currentTokens);
				if (html.trim()) {
					segments.push({
						type: 'html' as const,
						html,
						id: `html-${segments.length}`
					});
				}
				currentTokens = [];
			}
			segments.push({
				type: 'mermaid' as const,
				code: token.text,
				id: `mermaid-${mermaidCounter++}`
			});
		} else {
			currentTokens.push(token);
		}
	}

	if (currentTokens.length > 0) {
		const html = marked.parser(currentTokens);
		if (html.trim() || segments.length === 0) {
			segments.push({
				type: 'html' as const,
				html,
				id: `html-${segments.length}`
			});
		}
	}

	return segments;
}
