/** Copy text using the Clipboard API, falling back to the legacy selection command. */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// Clipboard API may reject in insecure contexts or when permission is denied.
	}

	const activeElement = document.activeElement;
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	textarea.style.pointerEvents = 'none';
	try {
		document.body.appendChild(textarea);
		textarea.select();
		textarea.setSelectionRange(0, textarea.value.length);
		return document.execCommand('copy');
	} catch {
		return false;
	} finally {
		textarea.remove();
		if (activeElement instanceof HTMLElement && activeElement.isConnected) activeElement.focus();
	}
}
