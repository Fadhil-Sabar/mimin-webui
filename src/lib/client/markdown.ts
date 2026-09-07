import type { Marked, Token } from 'marked';
import { isMermaidLanguage } from './mermaid';

export type MarkdownSegment =
	{ type: 'html'; html: string; id: string } | { type: 'mermaid'; code: string; id: string };

export function parseMarkdownSegments(markdown: string, marked: Marked): MarkdownSegment[] {
	if (!markdown || typeof markdown !== 'string') {
		return [];
	}

	const tokens = marked.lexer(markdown);
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
