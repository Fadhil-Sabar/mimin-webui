import { expect, test, type Page } from 'playwright/test';

const email = 'admin@mimin.local';
const password = process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password';
const providerBaseUrl =
	process.env.FAKE_PROVIDER_URL ??
	`http://127.0.0.1:${process.env.PLAYWRIGHT_PROVIDER_PORT ?? '4317'}/v1`;

type Conversation = { id: string; model: string };

function apiUrl(page: Page, pathname: string) {
	return new URL(pathname, page.url()).toString();
}

async function signIn(page: Page) {
	await page.goto('/login');
	// Vite dev transforms on demand; without this the click can fire before
	// hydration attaches the form handler and the browser does a native submit.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$|\/chat/);
}

async function configureFakeProvider(
	page: Page,
	includeReasoningModel = false,
	name = 'Playwright fake provider'
) {
	const response = await page.context().request.post(apiUrl(page, '/api/providers'), {
		data: {
			apiKey: 'playwright-key',
			baseUrl: providerBaseUrl,
			customConfig: {
				name,
				protocol: 'openai-completions',
				models: [
					{ id: 'mimin-e2e', name: 'Mimin test model', contextWindow: 16_000 },
					...(includeReasoningModel
						? [
								{
									id: 'mimin-e2e-reasoning',
									name: 'Mimin reasoning model',
									contextWindow: 16_000,
									reasoning: true
								}
							]
						: [])
				]
			}
		}
	});
	await expect(response).toBeOK();
	const body = (await response.json()) as { provider: string };
	return body.provider;
}

async function createConversation(page: Page, provider: string): Promise<Conversation> {
	const response = await page.context().request.post(apiUrl(page, '/api/conversations'), {
		data: {
			model: `${provider}/mimin-e2e`,
			enabledTools: []
		}
	});
	await expect(response).toBeOK();
	const body = (await response.json()) as { conversation: Conversation };
	return body.conversation;
}

async function openConversation(page: Page, provider: string) {
	const conversation = await createConversation(page, provider);
	await page.goto(`/chat?id=${encodeURIComponent(conversation.id)}`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByLabel('Message Mimin')).toBeVisible();
	return conversation;
}

function modelOption(page: Page, provider: string, id: string) {
	return page.locator(`[data-model-ref="${provider}/${id}"]`);
}

async function chooseThinking(page: Page, level: string) {
	const slider = page.getByRole('slider', { name: 'Thinking level' });
	await expect(slider).toBeEnabled();
	const stop = await page.locator(`.model-thinking-stop[data-level="${level}"]`).boundingBox();
	const bounds = await slider.boundingBox();
	expect(stop).not.toBeNull();
	expect(bounds).not.toBeNull();
	await slider.click({
		position: { x: stop!.x + stop!.width / 2 - bounds!.x, y: bounds!.height / 2 }
	});
}

async function sendPrompt(page: Page, prompt: string) {
	await page.getByLabel('Message Mimin').fill(prompt);
	await page.getByRole('button', { name: 'Send message' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('logs in and configures a local fake provider', async ({ page }) => {
	const name = `Playwright fake provider ${crypto.randomUUID()}`;
	const provider = await configureFakeProvider(page, false, name);
	await page.goto('/settings?settings=models');
	await expect(page.getByText(name, { exact: true })).toBeVisible();
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.locator('.model-trigger').click();
	await modelOption(page, provider, 'mimin-e2e').click();
	await expect(page.locator('.model-trigger')).toHaveText('Mimin test model');
	await expect(provider).toMatch(/^custom_[0-9a-f-]{36}$/);
});

test('changes thinking with the slider and remembers it per model', async ({ page }) => {
	const provider = await configureFakeProvider(page, true);
	await openConversation(page, provider);
	const trigger = page.locator('.model-trigger');
	const thinking = page.getByRole('slider', { name: 'Thinking level' });
	await trigger.click();
	await expect(thinking).toHaveCount(0);
	await modelOption(page, provider, 'mimin-e2e-reasoning').click();
	await expect(thinking).toBeEnabled();
	// Enter in the slider must not select a highlighted search result.
	await page.getByLabel('Search models').fill('Mimin test');
	await thinking.press('Enter');
	const [saved] = await Promise.all([
		page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/preferences') && response.request().method() === 'PUT'
		),
		thinking.press('End')
	]);
	expect(saved.ok()).toBe(true);
	await expect(thinking).toHaveAttribute('aria-valuetext', 'High');
	await expect(trigger).toHaveText(/Mimin reasoning model.*High/);
	await expect(trigger).toBeEnabled();
	await expect(thinking).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(thinking).toHaveAttribute('aria-valuetext', 'Medium');
	await expect(trigger).toBeEnabled();
	await page.keyboard.press('ArrowRight');
	await expect(thinking).toHaveAttribute('aria-valuetext', 'High');
	await expect(trigger).toBeEnabled();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('listbox', { name: 'Available models' })).toHaveCount(0);
	await expect(trigger).toBeFocused();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(trigger).toHaveText(/Mimin reasoning model.*High/);
	await trigger.click();
	await modelOption(page, provider, 'mimin-e2e').click();
	await expect(thinking).toHaveCount(0);
	await expect(trigger).toHaveText('Mimin test model');
	await expect(trigger).toBeEnabled();
	await modelOption(page, provider, 'mimin-e2e-reasoning').click();
	await expect(thinking).toHaveAttribute('aria-valuetext', 'High');
});

test('keeps home model selection model-only and closes after choosing', async ({ page }) => {
	const provider = await configureFakeProvider(page, true);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const trigger = page.locator('.model-trigger');
	await trigger.click();
	await expect(page.getByRole('slider', { name: 'Thinking level' })).toHaveCount(0);
	await modelOption(page, provider, 'mimin-e2e-reasoning').click();
	await expect(page.getByRole('listbox', { name: 'Available models' })).toHaveCount(0);
	await expect(trigger).toHaveText('Mimin reasoning model');
	await expect(trigger).toBeFocused();
});

test('disables picker while saving and restores thinking after a failed save', async ({ page }) => {
	const provider = await configureFakeProvider(page, true);
	const conversation = await openConversation(page, provider);
	const trigger = page.locator('.model-trigger');
	const thinking = page.getByRole('slider', { name: 'Thinking level' });
	let finishModelSave!: () => void;
	const modelSave = new Promise<void>((resolve) => (finishModelSave = resolve));
	await page.route(`**/api/conversations/${conversation.id}`, async (route) => {
		if (route.request().method() === 'PATCH') await modelSave;
		await route.continue();
	});
	await trigger.click();
	await modelOption(page, provider, 'mimin-e2e-reasoning').click();
	await expect(trigger).toBeDisabled();
	await expect(modelOption(page, provider, 'mimin-e2e')).toBeDisabled();
	await expect(modelOption(page, provider, 'mimin-e2e-reasoning')).toBeDisabled();
	await expect(thinking).toHaveCount(0);
	finishModelSave();
	await expect(thinking).toBeVisible();
	await expect(trigger).toBeEnabled();

	const previousLevel = await thinking.getAttribute('aria-valuetext');
	let finishThinkingSave!: () => void;
	const thinkingSave = new Promise<void>((resolve) => (finishThinkingSave = resolve));
	let thinkingRequests = 0;
	await page.route('**/api/preferences', async (route) => {
		if (route.request().method() !== 'PUT') return route.continue();
		thinkingRequests += 1;
		await thinkingSave;
		await route.fulfill({
			status: 500,
			json: { error: { message: 'Thinking save failed in test' } }
		});
	});
	await thinking.press('End');
	await expect(thinking).toHaveAttribute('aria-valuetext', 'High');
	await expect(trigger).toBeDisabled();
	await expect(thinking).toBeDisabled();
	finishThinkingSave();
	await expect(trigger).toBeEnabled();
	await expect(thinking).toHaveAttribute('aria-valuetext', previousLevel!);
	await expect(page.getByText('Thinking save failed in test', { exact: true })).toBeVisible();
	expect(thinkingRequests).toBe(1);
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await page.reload();
	await expect(trigger).toHaveText(new RegExp(`Mimin reasoning model.*${previousLevel}`));
});

test('previews a slider drag, cancels on Escape and saves only on release', async ({
	page
}, testInfo) => {
	const provider = await configureFakeProvider(page, true);
	await openConversation(page, provider);
	const trigger = page.locator('.model-trigger');
	const slider = page.getByRole('slider', { name: 'Thinking level' });
	await trigger.click();
	await modelOption(page, provider, 'mimin-e2e-reasoning').click();
	await expect(slider).toBeEnabled();
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
	let writes = 0;
	page.on('request', (request) => {
		if (request.url().endsWith('/api/preferences') && request.method() === 'PUT') writes += 1;
	});
	async function dragToHigh() {
		const box = await slider.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + 17, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.mouse.move(box!.x + box!.width - 17, box!.y + box!.height / 2, { steps: 12 });
		await expect(slider).toHaveAttribute('aria-valuetext', 'High');
		await expect(trigger).toHaveText(/Mimin reasoning model.*High/);
		await expect(slider).toBeEnabled();
		expect(writes).toBe(0);
	}
	await dragToHigh();
	await page.keyboard.press('Escape');
	await page.mouse.up();
	await expect(slider).toHaveCount(0);
	await expect(trigger).toHaveText(/Mimin reasoning model.*Off/);
	expect(writes).toBe(0);
	await trigger.click();
	await expect(slider).toHaveAttribute('aria-valuetext', 'Off');
	await dragToHigh();
	const [saved] = await Promise.all([
		page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/preferences') && response.request().method() === 'PUT'
		),
		page.mouse.up()
	]);
	expect(saved.ok()).toBe(true);
	await expect(trigger).toBeEnabled();
	await expect(slider).toHaveAttribute('aria-valuetext', 'High');
	expect(writes).toBe(1);
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath('model-thinking-slider-desktop.png') });
});

test('uploads an attachment and includes it in a streaming turn', async ({ page }) => {
	const provider = await configureFakeProvider(page);
	await openConversation(page, provider);
	await page.locator('input[type="file"]').setInputFiles({
		name: 'playwright-notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('A short note for the fake model.')
	});
	await expect(page.getByText('playwright-notes.txt')).toBeVisible();
	await sendPrompt(page, 'Summarize the uploaded note');
	await expect(page.getByText('Fake answer:', { exact: false })).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('playwright-notes.txt', { exact: true })).toBeVisible();
});

test('streams a response and stops a slow generation', async ({ page }) => {
	const provider = await configureFakeProvider(page);
	await openConversation(page, provider);
	await sendPrompt(page, 'Stop this [slow] generation');
	await expect(page.getByRole('button', { name: 'Stop generation' })).toBeVisible();
	await page.getByRole('button', { name: 'Stop generation' }).click();
	// The intentional stop is acknowledged with a toast; the turn outcome rules
	// deliberately do not mark a user stop as an interrupted reply.
	await expect(page.getByText('Generation stopped')).toBeVisible({ timeout: 5_000 });
	await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 10_000 });
});

test('offers retry after a provider failure and streams the replacement response', async ({
	page
}) => {
	const provider = await configureFakeProvider(page);
	await openConversation(page, provider);
	await sendPrompt(page, 'Retry this [provider-error]');
	// Scope to main: the sidebar conversation title also contains "Retry".
	const retryButton = page
		.getByRole('main')
		.getByRole('button', { name: 'Retry last message' })
		.first();
	await expect(retryButton).toBeVisible({ timeout: 20_000 });
	await retryButton.click();
	await expect(page.getByText('Fake answer:', { exact: false })).toBeVisible({ timeout: 20_000 });
});

test('reconnects a live turn after navigation and applies each streamed event once', async ({
	page
}) => {
	const provider = await configureFakeProvider(page);
	await openConversation(page, provider);
	await sendPrompt(page, 'Keep this turn after a reload [reconnect]');
	await expect(page.getByText('Fake answer:', { exact: false })).toBeVisible({ timeout: 20_000 });
	await page.reload();
	await expect(page.getByText('Fake answer: Keep this turn after a reload')).toBeVisible({
		timeout: 30_000
	});
	await expect(page.getByText('Fake answer: Keep this turn after a reload')).toHaveCount(1);
});

test('saves an edited prompt and regenerates only the visible history', async ({ page }) => {
	const provider = await configureFakeProvider(page);
	const conversation = await openConversation(page, provider);
	await sendPrompt(page, 'Original prompt');
	await expect(page.getByText('Fake answer:', { exact: false })).toBeVisible({ timeout: 20_000 });
	await sendPrompt(page, 'Later prompt that should be replaced');
	await expect(page.getByText('Later prompt that should be replaced')).toBeVisible({
		timeout: 20_000
	});

	const originalMessage = page
		.getByRole('article', { name: 'Your message' })
		.filter({ hasText: 'Original prompt' });
	await originalMessage.getByRole('button', { name: /edit (message|prompt)/i }).click();
	// The footer action button shares the label, so target the editor field by role.
	await page.getByRole('textbox', { name: /edit (message|prompt)/i }).fill('Edited prompt');
	await page.getByRole('button', { name: 'Save & regenerate' }).click();
	await expect(page.getByText('Fake answer: Edited prompt')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('Later prompt that should be replaced')).toHaveCount(0);

	const exportResponse = await page
		.context()
		.request.get(apiUrl(page, `/api/conversations/${conversation.id}/export?format=json`));
	await expect(exportResponse).toBeOK();
	const exported = (await exportResponse.json()) as { messages: Array<{ content: unknown }> };
	const exportedText = JSON.stringify(exported);
	await expect(exportedText).toContain('Edited prompt');
	await expect(exportedText).not.toContain('Later prompt that should be replaced');
});

test('creates an independent branch from a selected history prefix', async ({ page }) => {
	const provider = await configureFakeProvider(page);
	const original = await openConversation(page, provider);
	await sendPrompt(page, 'Branch prefix');
	await expect(page.getByText('Fake answer:', { exact: false })).toBeVisible({ timeout: 20_000 });
	await sendPrompt(page, 'Original later turn');
	await expect(page.getByText('Original later turn')).toBeVisible({ timeout: 20_000 });

	const prefixMessage = page
		.getByRole('article', { name: 'Your message' })
		.filter({ hasText: 'Branch prefix' });
	await prefixMessage.getByRole('button', { name: /create branch/i }).click();
	await expect(page).toHaveURL(/\/chat\?id=/);
	await expect(page).not.toHaveURL(new RegExp(original.id));
	await expect(
		page.getByRole('article', { name: 'Your message' }).getByText('Branch prefix', { exact: true })
	).toBeVisible();
	await expect(page.getByText('Original later turn')).toHaveCount(0);
});

test.describe('mobile viewport', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

	test('keeps the composer controls usable on a phone', async ({ page }) => {
		const provider = await configureFakeProvider(page, true);
		await openConversation(page, provider);
		await expect(page.getByRole('button', { name: 'Options' })).toBeVisible();
		await page.getByRole('button', { name: 'Options' }).click();
		await expect(page.locator('#composer-options .skill-trigger')).toBeVisible();
		await expect(page.locator('#composer-options .tool-trigger')).toBeVisible();
		await page.locator('.model-trigger').click();
		await modelOption(page, provider, 'mimin-e2e-reasoning').click();
		const thinking = page.getByRole('slider', { name: 'Thinking level' });
		await expect(thinking).toBeVisible();
		await chooseThinking(page, 'medium');
		await expect(thinking).toHaveAttribute('aria-valuetext', 'Medium');
		await expect(page.locator('.model-trigger')).toBeEnabled();
		await page.keyboard.press('Escape');
		await expect(page.locator('.model-menu')).toHaveCount(0);
		await expect(page.locator('.model-trigger')).toBeFocused();
		// The modal sheet locks body scrolling while open, then restores it on dismissal.
		await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible');
	});

	test('fits seven thinking levels in a 320px sheet', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 320, height: 740 });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		const provider = await configureFakeProvider(page, true);
		// Exercise all supported levels independently of the fake provider's limited catalog.
		await page.route('**/api/models', async (route) => {
			const response = await route.fetch();
			const body = (await response.json()) as {
				models: {
					id: string;
					provider: string;
					capabilities: { thinkingLevels: string[] };
				}[];
			};
			for (const model of body.models) {
				if (model.provider === provider && model.id === 'mimin-e2e-reasoning')
					model.capabilities.thinkingLevels = [
						'off',
						'minimal',
						'low',
						'medium',
						'high',
						'xhigh',
						'max'
					];
			}
			await route.fulfill({ response, json: body });
		});
		await openConversation(page, provider);
		const trigger = page.locator('.model-trigger');
		await trigger.click();
		await expect(page.getByRole('slider', { name: 'Thinking level' })).toHaveCount(0);
		await modelOption(page, provider, 'mimin-e2e-reasoning').click();
		const thinking = page.getByRole('slider', { name: 'Thinking level' });
		await expect(page.locator('.model-thinking-stop')).toHaveCount(7);
		await expect(thinking).toHaveAttribute('max', '6');
		await expect(thinking).toHaveAttribute('step', '1');
		await chooseThinking(page, 'medium');
		await expect(thinking).toHaveAttribute('aria-valuetext', 'Medium');
		await expect(trigger).toBeEnabled();
		const bounds = await page.locator('.model-menu').boundingBox();
		expect(bounds).not.toBeNull();
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
		expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
		const sliderBounds = await thinking.boundingBox();
		expect(sliderBounds!.height).toBeGreaterThanOrEqual(44);
		expect(sliderBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
		expect(sliderBounds!.x + sliderBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
		await thinking.evaluate((element) => {
			const input = element as HTMLInputElement;
			input.value = '5';
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await expect(thinking).toHaveAttribute('aria-valuetext', 'Extra high');
		await expect(trigger).toHaveText(/Extra high/);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
		await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath('model-thinking-slider-320.png') });
		await modelOption(page, provider, 'mimin-e2e').click();
		await expect(thinking).toHaveCount(0);
		await expect(trigger).toHaveText('Mimin test model');
		await expect(trigger).toBeEnabled();
		await page.keyboard.press('Escape');
		await expect(page.locator('.model-menu')).toHaveCount(0);
		await expect(trigger).toBeFocused();
		expect(errors).toEqual([]);
	});
});
