import Prism from 'prismjs';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-diff.js';
import 'prismjs/components/prism-docker.js';
import 'prismjs/components/prism-toml.js';
import 'prismjs/components/prism-graphql.js';
import 'prismjs/components/prism-ini.js';

const LANGUAGE_ALIASES: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	py: 'python',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	yml: 'yaml',
	md: 'markdown',
	html: 'markup',
	xml: 'markup',
	svg: 'markup',
	rs: 'rust',
	golang: 'go',
	csharp: 'clike',
	cs: 'clike',
	dockerfile: 'docker'
};

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function highlightCode(code: string, rawLang?: string): { html: string; language: string } {
	const raw = (rawLang || '').trim().toLowerCase().split(/\s+/)[0];
	const language = LANGUAGE_ALIASES[raw] || raw || 'text';
	const grammar = Prism.languages[language];

	if (grammar) {
		try {
			return { html: Prism.highlight(code, grammar, language), language };
		} catch {
			/* fallback to escaped plain text */
		}
	}
	return { html: escapeHtml(code), language: language || 'text' };
}
