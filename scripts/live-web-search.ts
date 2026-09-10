import { searchWeb } from '../src/lib/server/ai/tools/web-search.tool.ts';

(async () => {
	const result = await searchWeb({
		query: process.argv.slice(2).join(' ') || 'cafe Bintaro Tangerang Selatan',
		maxResults: 5
	});
	for (const source of result.sources) console.log(`${source.title}\n${source.url}`);
})();
