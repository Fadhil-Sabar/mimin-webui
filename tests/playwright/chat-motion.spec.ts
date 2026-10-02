import { expect, test } from 'playwright/test';

test('paces bursty streaming text and keeps the paragraph and reader position stable', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill('admin@mimin.local');
	await page
		.getByLabel('Password')
		.fill(process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('complementary', { name: 'Workspace navigation' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	const providerResponse = await page.request.post('/api/providers', {
		data: {
			apiKey: 'playwright-key',
			baseUrl: `http://127.0.0.1:${process.env.PLAYWRIGHT_PROVIDER_PORT ?? 4317}/v1`,
			customConfig: {
				name: 'Motion test provider',
				protocol: 'openai-completions',
				models: [{ id: 'mimin-e2e', name: 'Motion test model', contextWindow: 16000 }]
			}
		}
	});
	await expect(providerResponse).toBeOK();
	const { provider } = await providerResponse.json();
	const conversationResponse = await page.request.post('/api/conversations', {
		data: { model: `${provider}/mimin-e2e`, enabledTools: [] }
	});
	await expect(conversationResponse).toBeOK();
	const { conversation } = await conversationResponse.json();
	await page.goto(`/chat?id=${conversation.id}`);
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Message Mimin').fill('Test irregular provider chunks [motion]');
	await page.evaluate(() => {
		const metrics = { growth: [] as number[], replacementCount: 0, samples: 0 };
		let paragraph: Element | null = null;
		let length = 0;
		const state = window as typeof window & {
			motionMetrics: typeof metrics;
			stopMotionSampling: () => void;
		};
		state.motionMetrics = metrics;
		let frame = 0;
		const sample = () => {
			const current = document.querySelector('[aria-label="Mimin message"] .markdown-body p');
			if (current) {
				if (paragraph && paragraph !== current) metrics.replacementCount++;
				paragraph = current;
				const next = current.textContent!.length;
				if (next > length) metrics.growth.push(next - length);
				length = next;
				metrics.samples++;
			}
			frame = requestAnimationFrame(sample);
		};
		frame = requestAnimationFrame(sample);
		state.stopMotionSampling = () => cancelAnimationFrame(frame);
	});
	await page.getByRole('button', { name: 'Send message' }).click();
	const answer = page.getByRole('article', { name: 'Mimin message' }).locator('.markdown-body');
	await expect(answer).toContainText('page.', { timeout: 20000 });
	const pane = page.getByRole('region', { name: 'Chat conversation' });
	await expect
		.poll(() => pane.evaluate((node) => node.scrollHeight - node.clientHeight))
		.toBeGreaterThan(250);
	await pane.hover({ position: { x: 600, y: 150 } });
	await page.mouse.wheel(0, -250);
	await expect(page.getByRole('button', { name: /New response|Jump to latest/ })).toBeVisible();
	const readingPosition = await pane.evaluate((node) => node.scrollTop);
	await expect(answer).toContainText('End of smooth stream.', { timeout: 30000 });
	await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
	await expect(answer).not.toHaveClass(/streaming-caret/);
	const finalPosition = await pane.evaluate((node) => node.scrollTop);
	expect(Math.abs(finalPosition - readingPosition)).toBeLessThan(3);
	const metrics = await page.evaluate(() => {
		const state = window as typeof window & {
			motionMetrics: { growth: number[]; replacementCount: number; samples: number };
			stopMotionSampling: () => void;
		};
		state.stopMotionSampling();
		return state.motionMetrics;
	});
	await test.info().attach('motion-metrics', {
		body: JSON.stringify(metrics),
		contentType: 'application/json'
	});
	expect(metrics.replacementCount).toBe(0);
	expect(metrics.growth.length).toBeGreaterThan(40);
	expect(Math.max(...metrics.growth)).toBeLessThanOrEqual(120);
	expect(errors).toEqual([]);
});
