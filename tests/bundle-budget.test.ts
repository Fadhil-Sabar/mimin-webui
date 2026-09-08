import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDGETS, checkBundleBudget, collectAssetSizes } from '../scripts/check-bundle-budget.mjs';

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
});
