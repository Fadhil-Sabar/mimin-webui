// Prism and its grammars live in their own module so the highlighter can load them
// on demand: `@xyflow`-style libraries stay out of the chat page's initial bundle,
// and code highlighting only costs a fetch once a reply actually contains a fence.
import Prism from 'prismjs';
// Keep the bundle focused on the languages most common in chat.
// Unknown/less common languages safely fall back to escaped plaintext.
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
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';

export default Prism;
