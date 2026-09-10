/**
 * Live check of the server-side web search stack.
 *
 * Prints exactly what the model would see from the `web_search` tool, plus the
 * diagnostic thrown when every engine fails. The thrown text is also what the
 * Settings > Web Search test box shows the user, so both surfaces are covered.
 *
 * Usage:
 *   node --loader ./scripts/live-env-loader.mjs --import tsx scripts/live-web-search.ts "cafe Bintaro"
 *
 * This is not a test: it hits the live network, so its output depends on the
 * operator's connectivity. A network that DNS-blocks DuckDuckGo is expected to
 * report `DuckDuckGo: anti-bot challenge` or `blocked by ISP` and fall back.
 */
import { createWebSearchTool, searchWeb } from '../src/lib/server/ai/tools/web-search.tool.ts';

const query = process.argv.slice(2).join(' ') || 'cafe Bintaro Tangerang Selatan';

const tool = createWebSearchTool();
try {
	const result = await tool.execute(
		'live-web-search',
		{ query, maxResults: 5 },
		new AbortController().signal
	);
	const text = result.content.find((part) => part.type === 'text')?.text ?? '';
	console.log('--- model-facing tool result ---');
	console.log(text);
} catch (error) {
	console.log('--- tool failed with a readable diagnostic ---');
	console.log(error instanceof Error ? error.message : String(error));
}

try {
	const direct = await searchWeb({ query, maxResults: 5 });
	console.log('\n--- searchWeb() summary ---');
	console.log(`sources=${direct.sources.length} notice=${direct.notice ?? 'none'}`);
	for (const source of direct.sources) console.log(`${source.title}\n${source.url}`);
} catch (error) {
	console.log('\n--- searchWeb() threw (Settings test box shows this) ---');
	console.log(error instanceof Error ? error.message : String(error));
}
