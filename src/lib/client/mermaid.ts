import { browser } from '$app/environment';

let currentTheme: 'dark' | 'neutral' | null = null;
let idCounter = 0;

const svgCache = new Map<string, string>();

export function getMermaidCacheKey(code: string, isDark: boolean): string {
	return `${isDark ? 'dark' : 'light'}::${code.trim()}`;
}

export function getCachedMermaidSvg(code: string, isDark: boolean): string | undefined {
	return svgCache.get(getMermaidCacheKey(code, isDark));
}

export function setCachedMermaidSvg(code: string, isDark: boolean, svg: string): void {
	svgCache.set(getMermaidCacheKey(code, isDark), svg);
}

export function clearMermaidCache(): void {
	svgCache.clear();
}

export function isMermaidLanguage(lang: string | undefined): boolean {
	return Boolean(lang && lang.trim().toLowerCase() === 'mermaid');
}

export async function renderMermaid(code: string, isDark: boolean): Promise<string> {
	if (!browser) {
		return '';
	}

	const trimmedCode = code.trim();
	if (!trimmedCode) {
		return '';
	}

	const cacheKey = getMermaidCacheKey(trimmedCode, isDark);
	const cached = svgCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const m = await import('mermaid');
	const mermaid = m.default || m;

	const themeName = isDark ? 'dark' : 'neutral';
	if (currentTheme !== themeName) {
		currentTheme = themeName;
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'loose',
			suppressErrorRendering: true,
			fontFamily:
				'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
			theme: themeName,
			themeVariables: isDark
				? {
						darkMode: true,
						background: '#141416',
						primaryColor: '#232327',
						primaryTextColor: '#ededf0',
						primaryBorderColor: '#3f3f45',
						lineColor: '#9a9aa2',
						secondaryColor: '#1c1c1f',
						tertiaryColor: '#17171a',
						textColor: '#c9c9ce',
						mainBkg: '#1c1c1f',
						nodeBorder: '#3f3f45',
						clusterBkg: '#17171a',
						clusterBorder: '#2a2a2e',
						titleColor: '#ffffff',
						edgeLabelBackground: '#17171a'
					}
				: {
						darkMode: false,
						background: '#f4f4f1',
						primaryColor: '#efefec',
						primaryTextColor: '#111111',
						primaryBorderColor: '#c9c9c3',
						lineColor: '#686862',
						secondaryColor: '#ffffff',
						tertiaryColor: '#fcfcfa',
						textColor: '#444444',
						mainBkg: '#ffffff',
						nodeBorder: '#c9c9c3',
						clusterBkg: '#fcfcfa',
						clusterBorder: '#e5e5e1',
						titleColor: '#111111',
						edgeLabelBackground: '#ffffff'
					}
		});
	}

	const id = `mermaid-diagram-${++idCounter}-${Date.now().toString(36)}`;

	try {
		const { svg } = await mermaid.render(id, trimmedCode);
		svgCache.set(cacheKey, svg);
		return svg;
	} catch (error) {
		// Clean up any stray temporary elements created by mermaid on failure
		const stray = document.getElementById(id) || document.getElementById(`d${id}`);
		if (stray && stray.parentNode) {
			stray.parentNode.removeChild(stray);
		}
		throw error;
	}
}

export function downloadSvg(svgContent: string, filename = 'diagram.svg'): void {
	if (!browser || !svgContent) return;
	const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
