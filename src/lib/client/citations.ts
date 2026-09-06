import { escapeHtml } from './highlighter';

export interface SourceItem {
	index: number;
	url: string;
	title: string;
	domain: string;
	faviconUrl: string;
}

export function extractDomain(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

export function getFaviconUrl(domain: string): string {
	if (!domain || domain === 'localhost') return '';
	return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export function extractCleanTitle(url: string, explicitTitle?: string): string {
	if (
		explicitTitle &&
		explicitTitle.trim() &&
		explicitTitle !== url &&
		!/^https?:\/\//i.test(explicitTitle)
	) {
		const stripped = explicitTitle
			.replace(/^[\p{Emoji}\u2000-\u3300\s—–:-]+/u, '')
			.replace(/[*_~`]/g, '')
			.trim();
		if (stripped) return stripped;
		return explicitTitle.trim();
	}
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname.replace(/\/+$/, '').split('/').pop() || '';
		if (pathname) {
			const cleaned = decodeURIComponent(pathname.replace(/[-_]/g, ' '));
			if (cleaned.length > 2 && !cleaned.includes('.')) {
				return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
			}
		}
		return parsed.hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

export function parseCitationsAndSources(
	rawMarkdown: string,
	fallbackSources?: Array<{ title?: string; url?: string; snippet?: string } | SourceItem>
): {
	cleanedMarkdown: string;
	sources: SourceItem[];
	sourcesMap: Map<number, SourceItem>;
} {
	if (!rawMarkdown || typeof rawMarkdown !== 'string') {
		return { cleanedMarkdown: '', sources: [], sourcesMap: new Map() };
	}

	const sourcesMap = new Map<number, SourceItem>();
	const sourcesList: SourceItem[] = [];
	let nextIndex = 1;

	function addSource(index: number | null, url: string, title?: string): SourceItem {
		const trimmedUrl = url.trim();
		if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
			return {
				index: index ?? 1,
				url: trimmedUrl,
				title: title || trimmedUrl,
				domain: '',
				faviconUrl: ''
			};
		}
		const domain = extractDomain(trimmedUrl);
		const faviconUrl = getFaviconUrl(domain);
		const cleanTitle = extractCleanTitle(trimmedUrl, title);

		if (index !== null && index > 0) {
			const existing = sourcesMap.get(index);
			if (existing) {
				if (trimmedUrl && trimmedUrl !== existing.url) {
					existing.url = trimmedUrl;
					existing.domain = domain;
					existing.faviconUrl = faviconUrl;
				}
				if (cleanTitle && cleanTitle !== existing.title) {
					existing.title = cleanTitle;
				}
				return existing;
			}
			const item: SourceItem = {
				index,
				url: trimmedUrl,
				title: cleanTitle,
				domain,
				faviconUrl
			};
			sourcesMap.set(index, item);
			sourcesList.push(item);
			if (index >= nextIndex) nextIndex = index + 1;
			return item;
		}

		// Find if url already exists in sourcesList
		const existing = sourcesList.find((s) => s.url === trimmedUrl);
		if (existing) {
			if (cleanTitle && cleanTitle !== existing.title && cleanTitle !== existing.domain) {
				existing.title = cleanTitle;
			}
			return existing;
		}

		const idx = nextIndex++;
		const item: SourceItem = {
			index: idx,
			url: trimmedUrl,
			title: cleanTitle,
			domain,
			faviconUrl
		};
		sourcesMap.set(idx, item);
		sourcesList.push(item);
		return item;
	}

	if (fallbackSources && fallbackSources.length > 0) {
		fallbackSources.forEach((s, i) => {
			if (s && s.url) {
				addSource(i + 1, s.url, s.title);
			}
		});
	}

	let text = rawMarkdown;

	// 1. Detect and parse Sources/References section (even if followed by conversational text)
	const headerRegex =
		/(?:^|\n)(#{1,6}\s+|(?:\*\*|__)?)(?:Sources|References|Citations|Source|Reference|Sumber|Referensi)(?:\*\*|__)?(?::)?\s*(?:\n|$)/i;

	const headerMatch = text.match(headerRegex);
	if (headerMatch && headerMatch.index !== undefined) {
		const headerStartIndex = headerMatch.index === 0 ? 0 : headerMatch.index + 1;
		const afterHeaderIndex = headerStartIndex + headerMatch[0].trimStart().length;
		const textAfterHeader = text.slice(afterHeaderIndex);
		const lines = textAfterHeader.split('\n');

		let consumedChars = 0;
		let sourcesFoundInSection = 0;
		let endOfSectionIndex = afterHeaderIndex;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			if (!trimmed) {
				consumedChars += line.length + 1;
				continue;
			}

			// If line starts another markdown heading, stop immediately
			if (/^#{1,6}\s+/.test(trimmed)) {
				break;
			}

			// Check if line looks like a source item
			const linkMatch = trimmed.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
			const bareUrlMatch = trimmed.match(/(https?:\/\/[^\s)]+)/i);

			if (linkMatch || bareUrlMatch) {
				const matchIndex = linkMatch ? linkMatch.index! : bareUrlMatch!.index!;
				const prefix = trimmed.slice(0, matchIndex);
				let index: number | null = null;
				const idxMatch = prefix.match(/(?:^|[-*•\s])(?:\[(\d+)\]|(\d+)[.:)]|\((\d+)\))/);
				if (idxMatch) {
					index = parseInt(idxMatch[1] || idxMatch[2] || idxMatch[3], 10);
				}

				if (linkMatch) {
					addSource(index, linkMatch[2], linkMatch[1]);
				} else if (bareUrlMatch) {
					const url = bareUrlMatch[1];
					const withoutUrl = trimmed
						.replace(url, '')
						.replace(/(?:^|[-*•\s])(?:\[(\d+)\]|(\d+)[.:)]|\((\d+)\))/, '')
						.replace(/^[-*•:\s—–]+|[-*•:\s—–]+$/g, '')
						.trim();
					addSource(index, url, withoutUrl || undefined);
				}

				sourcesFoundInSection++;
				consumedChars += line.length + 1;
				endOfSectionIndex = afterHeaderIndex + consumedChars;
			} else {
				// Not a source line; stop consuming lines
				break;
			}
		}

		if (sourcesFoundInSection > 0) {
			const beforeSection = text.slice(0, headerStartIndex).trimEnd();
			const afterSection = text.slice(endOfSectionIndex).trimStart();
			text = beforeSection
				? afterSection
					? `${beforeSection}\n\n${afterSection}`
					: beforeSection
				: afterSection;
		}
	}

	// 2. Parse markdown footnote definitions e.g. [1]: https://...
	const footnoteDefRegex = /(?:^|\n)\[(\d+)\]:\s*(https?:\/\/[^\s)]+)(?:\s+"([^"]+)")?/g;
	let fnMatch: RegExpExecArray | null;
	while ((fnMatch = footnoteDefRegex.exec(text)) !== null) {
		addSource(parseInt(fnMatch[1], 10), fnMatch[2], fnMatch[3]);
	}
	text = text.replace(/(?:^|\n)\[\d+\]:\s*https?:\/\/[^\n]+/g, '').trimEnd();

	// 3. Scan inline markdown links e.g. [1](https://...) or [Fedora](https://...)
	const inlineLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
	let linkMatch: RegExpExecArray | null;
	while ((linkMatch = inlineLinkRegex.exec(text)) !== null) {
		const linkText = linkMatch[1].trim();
		const linkUrl = linkMatch[2].trim();
		const numMatch = linkText.match(/^\[?\^?(\d+)\]?$/);
		if (numMatch) {
			addSource(parseInt(numMatch[1], 10), linkUrl);
		} else {
			addSource(null, linkUrl, linkText);
		}
	}

	sourcesList.sort((a, b) => a.index - b.index);

	return {
		cleanedMarkdown: text,
		sources: sourcesList,
		sourcesMap
	};
}

export function renderCitationPillHtml(
	index: number | string,
	url: string,
	domain: string,
	title: string,
	faviconUrl: string
): string {
	const safeUrl = url.startsWith('javascript:') ? '#' : url;
	const safeDomain = escapeHtml(domain || extractDomain(safeUrl));
	const safeTitle = escapeHtml(title || safeDomain || `Source ${index}`);
	const safeFavicon = escapeHtml(faviconUrl || (safeDomain ? getFaviconUrl(safeDomain) : ''));

	return `<span class="citation-pill-wrapper"><a href="${encodeURI(safeUrl)}" target="_blank" rel="noopener noreferrer" class="citation-pill" aria-label="${safeTitle} (${safeDomain})">${safeFavicon ? `<img src="${safeFavicon}" alt="" class="pill-favicon" loading="lazy" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';" />` : ''}<span class="pill-fallback-icon"${safeFavicon ? ' style="display:none;"' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></span></a><span class="citation-hover-card"><span class="hover-card-header">${safeFavicon ? `<img src="${safeFavicon}" alt="" class="hover-card-favicon" loading="lazy" onerror="this.style.display='none'" />` : ''}<span class="hover-card-domain">${safeDomain}</span><svg class="hover-card-external" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></span><span class="hover-card-title">${safeTitle}</span><span class="hover-card-url">${escapeHtml(safeUrl)}</span></span></span>`;
}
