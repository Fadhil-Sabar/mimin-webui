import type { Marked, Token } from 'marked';
import { isMermaidLanguage } from './mermaid';

export type MarkdownSegment =
	{ type: 'html'; html: string; id: string } | { type: 'mermaid'; code: string; id: string };

interface FenceLine {
	index: number;
	marker: '`' | '~';
	length: number;
	lang: string;
	bare: boolean;
}

const FENCE_LINE = /^(`{3,}|~{3,})(.*)$/;

function parseFenceLine(line: string): Omit<FenceLine, 'index'> | null {
	const match = FENCE_LINE.exec(line.trim());
	if (!match) return null;
	const info = match[2].trim();
	return {
		marker: match[1][0] as '`' | '~',
		length: match[1].length,
		lang: info.split(/\s+/)[0]?.toLowerCase() ?? '',
		bare: info.length === 0
	};
}

function collectFenceLines(lines: string[]): FenceLine[] {
	const fences: FenceLine[] = [];
	for (let i = 0; i < lines.length; i++) {
		const parsed = parseFenceLine(lines[i]);
		if (parsed) fences.push({ index: i, ...parsed });
	}
	return fences;
}

function hasDocumentStructure(lines: string[], start: number, end: number): boolean {
	for (let i = start; i < end; i++) {
		if (/^\s*(#{1,6}\s+|-\s+\[[ x]\])/.test(lines[i])) return true;
	}
	return false;
}

/**
 * Whether the given fences can all be paired up (info-string fences opened, bare
 * fences closed, bare fences with nothing open counting as openers).
 */
function fencesPairUp(fences: FenceLine[]): boolean {
	let depth = 0;
	for (const fence of fences) {
		if (!fence.bare) depth++;
		else if (depth > 0) depth--;
		else depth++;
	}
	return depth === 0;
}

/**
 * Strips outer ```markdown or ```md document wrapper fences that LLMs frequently
 * produce around multi-section documents (e.g. PRDs or full markdown reports).
 *
 * When an outer ```markdown fence contains inner code blocks (like ``` or ```mermaid),
 * CommonMark treats the first inner fence as terminating the outer block, inverting
 * all subsequent code blocks and trapping sections and diagrams inside raw code boxes.
 *
 * Fences are matched by marker character and length, so an outer ````markdown wrapper
 * (four backticks, the standard way to embed three-backtick fences) is closed by the
 * next bare ```` fence and the inner ``` fences stay nested and keep rendering.
 */
export function unwrapMarkdownDocument(text: string): string {
	if (!text || typeof text !== 'string') return text;

	let lines = text.split('\n');

	// Repeat so wrappers nested inside other wrappers are unwrapped outside-in.
	for (let pass = 0; pass < 4; pass++) {
		const fences = collectFenceLines(lines);
		if (fences.length === 0) break;

		const linesToRemove = new Set<number>();
		const isRemoved = (fence: FenceLine) => linesToRemove.has(fence.index);
		const fencesBetween = (start: number, end: number) =>
			fences.filter((f) => f.index > start && f.index < end && !isRemoved(f));

		for (const wrapper of fences) {
			if (isRemoved(wrapper)) continue;
			if (wrapper.lang !== 'markdown' && wrapper.lang !== 'md') continue;

			// A closing fence uses the same marker and is at least as long as the opener.
			const candidates = fences.filter(
				(f) =>
					f.index > wrapper.index &&
					!isRemoved(f) &&
					f.bare &&
					f.marker === wrapper.marker &&
					f.length >= wrapper.length
			);

			const firstCandidate = candidates[0];

			if (!firstCandidate) {
				// Unclosed wrapper (e.g. still streaming). Strip the opening fence only for
				// bodies that plainly hold a document, so a plain ```markdown sample stays put.
				const enclosed = fencesBetween(wrapper.index, lines.length);
				if (hasDocumentStructure(lines, wrapper.index + 1, lines.length) || enclosed.length >= 2) {
					linesToRemove.add(wrapper.index);
				}
				continue;
			}

			const fencedBody = fencesBetween(wrapper.index, firstCandidate.index);
			const holdsDocument =
				hasDocumentStructure(lines, wrapper.index + 1, firstCandidate.index) ||
				fencedBody.length > 0;
			// A short ```markdown sample of prose only is content the author wants verbatim.
			if (!holdsDocument) continue;

			// An unbalanced body means the first candidate closes an inner block, so this
			// wrapper's own closing fence has to be a later candidate.
			if (!fencesPairUp(fencedBody)) {
				if (candidates.length < 2) {
					// Malformed wrapper (never closed): drop the opening fence only.
					if (hasDocumentStructure(lines, wrapper.index + 1, lines.length)) {
						linesToRemove.add(wrapper.index);
					}
					continue;
				}
			} else {
				// Properly nested fences (e.g. ````markdown holding ```mermaid) close at the
				// first candidate whose body is made only of strictly shorter fences.
				const nested = candidates.find((candidate) => {
					const body = fencesBetween(wrapper.index, candidate.index);
					return body.length > 0 && body.every((f) => f.length < wrapper.length);
				});
				if (nested) {
					linesToRemove.add(wrapper.index);
					linesToRemove.add(nested.index);
					continue;
				}
			}

			// Otherwise the wrapper swallows everything up to the last bare fence, which is
			// what "whole document wrapped in one fence" LLM output looks like.
			linesToRemove.add(wrapper.index);
			linesToRemove.add(candidates[candidates.length - 1].index);
		}

		if (linesToRemove.size === 0) break;
		lines = lines.filter((_, index) => !linesToRemove.has(index));
	}

	return lines.join('\n');
}

export interface ParseSegmentsOptions {
	/**
	 * Distinguishes cached HTML that depends on render-time state outside the token
	 * text — citation pills built from the caller's sources — from plain renders.
	 */
	cacheKey?: string;
}

/**
 * Rendered HTML keyed by token raw, cached per `Marked` instance: each Markdown
 * component builds its own instance with its own renderers, so the same token can
 * render to different HTML under different configurations and caches must not be
 * shared between them. Streaming only appends to the trailing block, so every
 * finished block hits this and skips marked/Prism/KaTeX — per-frame cost stops
 * growing with reply length. Bounded FIFO, and weakly held so an unmounted
 * component's cache goes with it.
 */
const SEGMENT_CACHE_LIMIT = 400;
const segmentCaches = new WeakMap<Marked, Map<string, string>>();

function renderSegmentHtml(token: Token, marked: Marked, cacheKey: string): string {
	let cache = segmentCaches.get(marked);
	if (!cache) {
		cache = new Map<string, string>();
		segmentCaches.set(marked, cache);
	}
	// Length-prefix the cache key so key/raw boundaries can never collide.
	const key = `${cacheKey.length}:${cacheKey}${token.raw}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;

	const html = marked.parser([token]);
	if (cache.size >= SEGMENT_CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, html);
	return html;
}

/** Drops a parser's segment cache after its configuration changes at runtime. */
export function invalidateSegmentCache(marked: Marked): void {
	segmentCaches.delete(marked);
}

export function parseMarkdownSegments(
	markdown: string,
	marked: Marked,
	options: ParseSegmentsOptions = {}
): MarkdownSegment[] {
	if (!markdown || typeof markdown !== 'string') {
		return [];
	}

	const cacheKey = options.cacheKey ?? '';
	const cleaned = unwrapMarkdownDocument(markdown);
	const tokens = marked.lexer(cleaned);
	const segments: MarkdownSegment[] = [];
	let mermaidCounter = 0;

	// Each top-level block renders as its own segment. Block boundaries are stable
	// while text streams into the trailing block, so the cache above absorbs every
	// finished block and only the trailing one re-renders per frame.
	for (const token of tokens) {
		if (token.type === 'code' && isMermaidLanguage(token.lang)) {
			segments.push({
				type: 'mermaid' as const,
				code: token.text,
				id: `mermaid-${mermaidCounter++}`
			});
			continue;
		}
		const html = renderSegmentHtml(token, marked, cacheKey);
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
