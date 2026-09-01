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

export function parseCitationsAndSources(rawMarkdown: string): {
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
				if (title && (!existing.title || existing.title === existing.domain)) {
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
		if (existing) return existing;

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

	let text = rawMarkdown;

	// 1. Detect and parse trailing Sources/References section
	const sourcesSectionRegex =
		/(?:\n{1,3}|\A)(?:#{1,6}\s+|(?:\*\*|__)?)(?:Sources|References|Citations|Source|Reference|Sumber|Referensi)(?:\*\*|__)?(?::)?\s*\n([\s\S]+)$/i;

	const sectionMatch = text.match(sourcesSectionRegex);
	if (sectionMatch && sectionMatch.index !== undefined) {
		const sectionContent = sectionMatch[1];
		const sectionLines = sectionContent.split('\n');

		for (const line of sectionLines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Match [1] [Title](https://...) or - [1] [Title](url)
			const matchLinkWithIdx = trimmed.match(
				/^(?:[-*]\s*)?\[(\d+)\][:.]?\s*\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/i
			);
			if (matchLinkWithIdx) {
				addSource(parseInt(matchLinkWithIdx[1], 10), matchLinkWithIdx[3], matchLinkWithIdx[2]);
				continue;
			}

			// Match [1] https://... (optional title after)
			const matchUrlWithIdx = trimmed.match(
				/^(?:[-*]\s*)?\[(\d+)\][:.]?\s*(https?:\/\/[^\s\)]+)(?:\s+[-–—]\s+([^\n]+)|\s+\(([^\)]+)\))?/i
			);
			if (matchUrlWithIdx) {
				const title = matchUrlWithIdx[3] || matchUrlWithIdx[4];
				addSource(parseInt(matchUrlWithIdx[1], 10), matchUrlWithIdx[2], title);
				continue;
			}

			// Match 1. [Title](url)
			const matchNumListLink = trimmed.match(/^(\d+)\.\s*\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/i);
			if (matchNumListLink) {
				addSource(parseInt(matchNumListLink[1], 10), matchNumListLink[3], matchNumListLink[2]);
				continue;
			}

			// Match 1. https://...
			const matchNumListUrl = trimmed.match(/^(\d+)\.\s*(https?:\/\/[^\s\)]+)/i);
			if (matchNumListUrl) {
				addSource(parseInt(matchNumListUrl[1], 10), matchNumListUrl[2]);
				continue;
			}

			// Match - [Title](url)
			const matchBulletLink = trimmed.match(/^[-*]\s*\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/i);
			if (matchBulletLink) {
				addSource(null, matchBulletLink[2], matchBulletLink[1]);
				continue;
			}

			// Match - https://...
			const matchBulletUrl = trimmed.match(/^[-*]\s*(https?:\/\/[^\s\)]+)/i);
			if (matchBulletUrl) {
				addSource(null, matchBulletUrl[1]);
				continue;
			}

			// Match bare https://...
			const matchBareUrl = trimmed.match(/^(https?:\/\/[^\s\)]+)/i);
			if (matchBareUrl) {
				addSource(null, matchBareUrl[1]);
				continue;
			}
		}

		// Strip the sources section from the main text
		text = text.slice(0, sectionMatch.index).trimEnd();
	}

	// 2. Parse markdown footnote definitions e.g. [1]: https://...
	const footnoteDefRegex = /(?:^|\n)\[(\d+)\]:\s*(https?:\/\/[^\s\)]+)(?:\s+"([^"]+)")?/g;
	let fnMatch: RegExpExecArray | null;
	while ((fnMatch = footnoteDefRegex.exec(text)) !== null) {
		addSource(parseInt(fnMatch[1], 10), fnMatch[2], fnMatch[3]);
	}
	text = text.replace(/(?:^|\n)\[\d+\]:\s*https?:\/\/[^\n]+/g, '').trimEnd();

	// 3. Scan inline markdown links e.g. [1](https://...) or [Fedora](https://...)
	const inlineLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
	let linkMatch: RegExpExecArray | null;
	while ((linkMatch = inlineLinkRegex.exec(text)) !== null) {
		const linkText = linkMatch[1].trim();
		const linkUrl = linkMatch[2].trim();
		const numMatch = linkText.match(/^(\d+)$/);
		if (numMatch) {
			addSource(parseInt(numMatch[1], 10), linkUrl);
		} else if (linkText.match(/^\^(\d+)$/)) {
			addSource(parseInt(linkText.slice(1), 10), linkUrl);
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
	const safeFavicon = escapeHtml(
		faviconUrl || (safeDomain ? getFaviconUrl(safeDomain) : '')
	);

	return `<span class="citation-pill-wrapper"><a href="${encodeURI(safeUrl)}" target="_blank" rel="noopener noreferrer" class="citation-pill" aria-label="${safeTitle} (${safeDomain})">${safeFavicon ? `<img src="${safeFavicon}" alt="" class="pill-favicon" loading="lazy" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';" />` : ''}<span class="pill-fallback-icon"${safeFavicon ? ' style="display:none;"' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></span></a><span class="citation-hover-card"><span class="hover-card-header">${safeFavicon ? `<img src="${safeFavicon}" alt="" class="hover-card-favicon" loading="lazy" onerror="this.style.display='none'" />` : ''}<span class="hover-card-domain">${safeDomain}</span><svg class="hover-card-external" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></span><span class="hover-card-title">${safeTitle}</span><span class="hover-card-url">${escapeHtml(safeUrl)}</span></span></span>`;
}
