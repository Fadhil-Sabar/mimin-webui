import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?inline';

const FONT_BASE = `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/fonts/`;

let cachedStyles: string | null = null;

function clipboardStyles(): string {
	cachedStyles ??= katexCss.replaceAll('url(fonts/', `url(${FONT_BASE}`);
	return cachedStyles;
}

const SUPERSCRIPT: Record<string, string> = {
	'0': '⁰',
	'1': '¹',
	'2': '²',
	'3': '³',
	'4': '⁴',
	'5': '⁵',
	'6': '⁶',
	'7': '⁷',
	'8': '⁸',
	'9': '⁹',
	'+': '⁺',
	'-': '⁻',
	'−': '⁻',
	'=': '⁼',
	'(': '⁽',
	')': '⁾',
	a: 'ᵃ',
	b: 'ᵇ',
	c: 'ᶜ',
	d: 'ᵈ',
	e: 'ᵉ',
	f: 'ᶠ',
	g: 'ᵍ',
	h: 'ʰ',
	i: 'ⁱ',
	j: 'ʲ',
	k: 'ᵏ',
	l: 'ˡ',
	m: 'ᵐ',
	n: 'ⁿ',
	o: 'ᵒ',
	p: 'ᵖ',
	r: 'ʳ',
	s: 'ˢ',
	t: 'ᵗ',
	u: 'ᵘ',
	v: 'ᵛ',
	w: 'ʷ',
	x: 'ˣ',
	y: 'ʸ',
	z: 'ᶻ',
	A: 'ᴬ',
	B: 'ᴮ',
	D: 'ᴰ',
	E: 'ᴱ',
	G: 'ᴳ',
	H: 'ᴴ',
	I: 'ᴵ',
	J: 'ᴶ',
	K: 'ᴷ',
	L: 'ᴸ',
	M: 'ᴹ',
	N: 'ᴺ',
	O: 'ᴼ',
	P: 'ᴾ',
	R: 'ᴿ',
	S: 'ˢ',
	T: 'ᵀ',
	U: 'ᵁ',
	V: 'ᵛ',
	W: 'ᵂ'
};

const SUBSCRIPT: Record<string, string> = {
	'0': '₀',
	'1': '₁',
	'2': '₂',
	'3': '₃',
	'4': '₄',
	'5': '₅',
	'6': '₆',
	'7': '₇',
	'8': '₈',
	'9': '₉',
	'+': '₊',
	'-': '₋',
	'−': '₋',
	'=': '₌',
	'(': '₍',
	')': '₎',
	a: 'ₐ',
	e: 'ₑ',
	h: 'ₕ',
	i: 'ᵢ',
	j: 'ⱼ',
	k: 'ₖ',
	l: 'ₗ',
	m: 'ₘ',
	n: 'ₙ',
	o: 'ₒ',
	p: 'ₚ',
	r: 'ᵣ',
	s: 'ₛ',
	t: 'ₜ',
	u: 'ᵤ',
	v: 'ᵥ',
	x: 'ₓ'
};

function mapChars(text: string, table: Record<string, string>): string | null {
	let out = '';
	for (const ch of text) {
		const mapped = table[ch];
		if (mapped === undefined) return null;
		out += mapped;
	}
	return out;
}

function sup(text: string): string {
	return mapChars(text, SUPERSCRIPT) ?? `^{${text}}`;
}

function sub(text: string): string {
	return mapChars(text, SUBSCRIPT) ?? `_{${text}}`;
}

function nodeText(node: ChildNode): string {
	if (node.nodeType === 3) return node.textContent ?? '';
	if (node.nodeType !== 1) return '';
	const el = node as Element;
	const kids = Array.from(el.childNodes);
	const all = kids.map(nodeText).join('');
	switch (el.localName) {
		case 'annotation':
			return '';
		case 'semantics': {
			const child = kids.find((k) => k.nodeType === 1 && (k as Element).localName !== 'annotation');
			return child ? nodeText(child) : '';
		}
		case 'msup':
			return nodeText(kids[0]) + sup(nodeText(kids[1]));
		case 'msub':
			return nodeText(kids[0]) + sub(nodeText(kids[1]));
		case 'msubsup':
			return nodeText(kids[0]) + sub(nodeText(kids[1])) + sup(nodeText(kids[2]));
		case 'mfrac':
			return `${nodeText(kids[0])}/${nodeText(kids[1])}`;
		case 'msqrt':
			return `√(${all})`;
		case 'mroot':
			return `${sub(nodeText(kids[1]))}√(${nodeText(kids[0])})`;
		case 'munder':
			return `${nodeText(kids[0])}_{${nodeText(kids[1])}}`;
		case 'mover':
			return `${nodeText(kids[0])}^{${nodeText(kids[1])}}`;
		case 'munderover':
			return `${nodeText(kids[0])}_{${nodeText(kids[1])}}^{${nodeText(kids[2])}}`;
		case 'mfenced': {
			const open = el.getAttribute('open') ?? '(';
			const close = el.getAttribute('close') ?? ')';
			const sep = el.getAttribute('separator') ?? ',';
			return `${open}${kids.map(nodeText).join(sep)}${close}`;
		}
		case 'mtr':
		case 'mlabeledtr':
			return kids
				.filter((k) => k.nodeType === 1 && (k as Element).localName === 'mtd')
				.map(nodeText)
				.join(' | ');
		case 'mtable':
			return kids.map(nodeText).join('\n');
		case 'mspace':
			return ' ';
		default:
			return all;
	}
}

export function mathmlToUnicode(root: Element): string {
	const math = root.querySelector('math');
	if (!math) return (root.textContent ?? '').trim();
	return nodeText(math).replace(/\s+/g, ' ').trim();
}

export async function copyMathBlock(body: HTMLElement): Promise<void> {
	const clone = body.cloneNode(true) as HTMLElement;
	for (const mathml of clone.querySelectorAll('.katex-mathml')) {
		mathml.remove();
	}
	const html = `<style>${clipboardStyles()}</style>${clone.innerHTML}`;
	const plain = mathmlToUnicode(body);
	await navigator.clipboard.write([
		new ClipboardItem({
			'text/html': new Blob([html], { type: 'text/html' }),
			'text/plain': new Blob([plain], { type: 'text/plain' })
		})
	]);
}
