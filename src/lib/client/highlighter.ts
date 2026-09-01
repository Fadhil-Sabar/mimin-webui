import Prism from 'prismjs';
// Base languages
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-json5.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-plsql.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';

// Systems & backend languages
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-go-module.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-kotlin.js';
import 'prismjs/components/prism-scala.js';
import 'prismjs/components/prism-groovy.js';

// Templating & PHP
import 'prismjs/components/prism-markup-templating.js';
import 'prismjs/components/prism-php.js';
import 'prismjs/components/prism-php-extras.js';

// Dynamic & functional languages
import 'prismjs/components/prism-ruby.js';
import 'prismjs/components/prism-swift.js';
import 'prismjs/components/prism-dart.js';
import 'prismjs/components/prism-elixir.js';
import 'prismjs/components/prism-erlang.js';
import 'prismjs/components/prism-haskell.js';
import 'prismjs/components/prism-lua.js';
import 'prismjs/components/prism-perl.js';
import 'prismjs/components/prism-r.js';
import 'prismjs/components/prism-julia.js';
import 'prismjs/components/prism-matlab.js';
import 'prismjs/components/prism-zig.js';
import 'prismjs/components/prism-nim.js';
import 'prismjs/components/prism-ocaml.js';
import 'prismjs/components/prism-fsharp.js';

// DevOps, config & web
import 'prismjs/components/prism-diff.js';
import 'prismjs/components/prism-docker.js';
import 'prismjs/components/prism-git.js';
import 'prismjs/components/prism-makefile.js';
import 'prismjs/components/prism-cmake.js';
import 'prismjs/components/prism-powershell.js';
import 'prismjs/components/prism-scss.js';
import 'prismjs/components/prism-sass.js';
import 'prismjs/components/prism-less.js';
import 'prismjs/components/prism-toml.js';
import 'prismjs/components/prism-ini.js';
import 'prismjs/components/prism-graphql.js';
import 'prismjs/components/prism-protobuf.js';
import 'prismjs/components/prism-solidity.js';
import 'prismjs/components/prism-hcl.js';
import 'prismjs/components/prism-http.js';
import 'prismjs/components/prism-nginx.js';
import 'prismjs/components/prism-apacheconf.js';
import 'prismjs/components/prism-regex.js';
import 'prismjs/components/prism-wasm.js';
import 'prismjs/components/prism-nasm.js';

const LANGUAGE_ALIASES: Record<string, string> = {
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	py: 'python',
	python3: 'python',
	py3: 'python',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	bash: 'bash',
	yml: 'yaml',
	yaml: 'yaml',
	md: 'markdown',
	markdown: 'markdown',
	html: 'markup',
	xml: 'markup',
	svg: 'markup',
	rs: 'rust',
	rust: 'rust',
	golang: 'go',
	go: 'go',
	csharp: 'csharp',
	'c#': 'csharp',
	cs: 'csharp',
	c: 'c',
	cpp: 'cpp',
	'c++': 'cpp',
	cc: 'cpp',
	cxx: 'cpp',
	h: 'c',
	hpp: 'cpp',
	php: 'php',
	php3: 'php',
	php4: 'php',
	php5: 'php',
	phtml: 'php',
	rb: 'ruby',
	ruby: 'ruby',
	kt: 'kotlin',
	kts: 'kotlin',
	kotlin: 'kotlin',
	java: 'java',
	scala: 'scala',
	sc: 'scala',
	swift: 'swift',
	dart: 'dart',
	ex: 'elixir',
	exs: 'elixir',
	elixir: 'elixir',
	erl: 'erlang',
	erlang: 'erlang',
	hs: 'haskell',
	haskell: 'haskell',
	lua: 'lua',
	pl: 'perl',
	pm: 'perl',
	perl: 'perl',
	r: 'r',
	jl: 'julia',
	julia: 'julia',
	matlab: 'matlab',
	m: 'matlab',
	zig: 'zig',
	nim: 'nim',
	ml: 'ocaml',
	ocaml: 'ocaml',
	fs: 'fsharp',
	'f#': 'fsharp',
	fsharp: 'fsharp',
	sql: 'sql',
	plsql: 'plsql',
	psql: 'sql',
	mysql: 'sql',
	dockerfile: 'docker',
	docker: 'docker',
	tf: 'hcl',
	terraform: 'hcl',
	hcl: 'hcl',
	proto: 'protobuf',
	protobuf: 'protobuf',
	sol: 'solidity',
	solidity: 'solidity',
	ps1: 'powershell',
	powershell: 'powershell',
	posh: 'powershell',
	make: 'makefile',
	makefile: 'makefile',
	cmake: 'cmake',
	nginx: 'nginx',
	conf: 'nginx',
	ini: 'ini',
	toml: 'toml',
	json: 'json',
	json5: 'json5',
	jsonc: 'json5',
	gql: 'graphql',
	graphql: 'graphql',
	diff: 'diff',
	patch: 'diff',
	wasm: 'wasm',
	asm: 'nasm',
	nasm: 'nasm'
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
