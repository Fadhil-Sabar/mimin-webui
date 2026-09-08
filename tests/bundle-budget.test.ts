import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	BUDGETS,
	checkBundleBudget,
	collectAssetSizes,
	collectChunkSizes,
	verifyMermaidLazyLoad
} from '../scripts/check-bundle-budget.mjs';

describe('bundle budget', () => {
	it('aggregates JavaScript, CSS, and total build assets', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'mimin-bundle-'));
		await mkdir(path.join(root, '_app'), { recursive: true });
		await writeFile(path.join(root, '_app', 'app.js'), '12345');
		await writeFile(path.join(root, '_app', 'app.css'), '123');
		await writeFile(path.join(root, '_app', 'font.woff2'), '12');

		expect(await collectAssetSizes(root)).toEqual({ js: 5, css: 3, total: 10 });
	});

	it('reports assets that exceed documented thresholds', () => {
		const failures = checkBundleBudget({ js: BUDGETS.js + 1, css: 0, total: BUDGETS.total + 1 });
		expect(failures).toEqual([
			`js ${((BUDGETS.js + 1) / 1024 / 1024).toFixed(2)} MiB exceeds 4.50 MiB`,
			`total ${((BUDGETS.total + 1) / 1024 / 1024).toFixed(2)} MiB exceeds 7.00 MiB`
		]);
	});

	it('enforces raw and gzip limits independently for every JavaScript chunk', () => {
		const chunks = [{ file: 'mermaid.js', raw: BUDGETS.chunkRaw + 1, gzip: 1 }];
		expect(checkBundleBudget({ js: 0, css: 0, total: 0, chunks })).toEqual([
			`mermaid.js raw ${BUDGETS.chunkRaw + 1} bytes exceeds ${BUDGETS.chunkRaw} bytes`
		]);
		expect(
			checkBundleBudget({
				js: 0,
				css: 0,
				total: 0,
				chunks: [{ file: 'compressed.js', raw: 1, gzip: BUDGETS.chunkGzip + 1 }]
			})
		).toEqual([
			`compressed.js gzip ${BUDGETS.chunkGzip + 1} bytes exceeds ${BUDGETS.chunkGzip} bytes`
		]);
	});

	it('measures raw and gzip bytes from emitted chunks', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'mimin-chunks-'));
		await writeFile(path.join(root, 'chunk.js'), 'const mermaid = 1;');
		const [chunk] = await collectChunkSizes(root);
		expect(chunk.raw).toBe(18);
		expect(chunk.gzip).toBeGreaterThan(0);
	});

	it('requires Mermaid core to be a dynamic entry outside initial startup imports', () => {
		const manifest = {
			app: { file: 'app.js', isEntry: true, imports: ['shared.js'] },
			shared: { file: 'shared.js', imports: [] },
			mermaid: { file: 'mermaid.js', isDynamicEntry: true }
		};
		const withMermaid = {
			'node_modules/mermaid/dist/mermaid.core.mjs': manifest.mermaid,
			app: manifest.app,
			shared: manifest.shared
		};
		expect(verifyMermaidLazyLoad(withMermaid)).toBe(true);
		expect(
			verifyMermaidLazyLoad({
				...withMermaid,
				app: { ...manifest.app, imports: ['mermaid.js'] }
			})
		).toBe(false);
	});
});
