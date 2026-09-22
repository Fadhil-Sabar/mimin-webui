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

async function configureFakeProvider(page: Page) {
	const response = await page.context().request.post(apiUrl(page, '/api/providers'), {
		data: {
			apiKey: 'playwright-key',
			baseUrl: providerBaseUrl,
			customConfig: {
				name: 'Playwright fake provider',
				protocol: 'openai-completions',
				models: [{ id: 'mimin-e2e', name: 'Mimin test model', contextWindow: 16_000 }]
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

async function sendPrompt(page: Page, prompt: string) {
	await page.getByLabel('Message Mimin').fill(prompt);
	await page.getByRole('button', { name: 'Send message' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('logs in and configures a local fake provider', async ({ page }) => {
	const provider = await configureFakeProvider(page);
	await page.goto('/settings?settings=models');
	await expect(page.getByText('Playwright fake provider')).toBeVisible();
	await page.goto('/');
	await expect(page.getByText('Mimin test model')).toBeVisible();
	await expect(provider).toMatch(/^custom_[0-9a-f-]{36}$/);
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
		const provider = await configureFakeProvider(page);
		await openConversation(page, provider);
		await expect(page.getByRole('button', { name: 'Options' })).toBeVisible();
		await page.getByRole('button', { name: 'Options' }).click();
		await expect(page.getByLabel('Thinking level')).toBeVisible();
		await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible');
	});
});
