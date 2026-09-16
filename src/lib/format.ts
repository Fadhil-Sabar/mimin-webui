export type DateStyle = 'short' | 'long';

/**
 * `short` → "Sep 16". `long` → "Sep 16, 2026".
 */
export function formatDate(iso: string, style: DateStyle = 'short') {
	if (!iso) return '';
	const options: Intl.DateTimeFormatOptions =
		style === 'long'
			? { month: 'short', day: 'numeric', year: 'numeric' }
			: { month: 'short', day: 'numeric' };
	try {
		return new Date(iso).toLocaleDateString(undefined, options);
	} catch {
		return iso;
	}
}

export function formatBytes(bytes: number) {
	return bytes > 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function modelRef(model: { provider: string; id: string }) {
	return `${model.provider}/${model.id}`;
}
