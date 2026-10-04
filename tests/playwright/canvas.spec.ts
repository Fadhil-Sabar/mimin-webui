import { expect, test, type Locator, type Page } from 'playwright/test';

async function previewWidth(frame: Locator) {
	const handle = await frame.elementHandle();
	const child = await handle?.contentFrame();
	return child?.evaluate(() => window.innerWidth);
}

const email = 'admin@mimin.local';
const password = process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password';
const providerBaseUrl =
	process.env.FAKE_PROVIDER_URL ??
	`http://127.0.0.1:${process.env.PLAYWRIGHT_PROVIDER_PORT ?? '4317'}/v1`;

type Conversation = { id: string; model: string };
type Scene = {
	id: string;
	name: string;
	viewport: 'mobile' | 'tablet' | 'desktop';
	html: string;
	css: string;
	js?: string;
};
type Canvas = { id: string; scenes: Scene[]; revision: number };

function apiUrl(page: Page, pathname: string) {
	return new URL(pathname, page.url()).toString();
}

async function signIn(page: Page) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$|\/chat/);
}

async function createFixture(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const providerResponse = await page.context().request.post(apiUrl(page, '/api/providers'), {
		data: {
			apiKey: 'playwright-key',
			baseUrl: providerBaseUrl,
			customConfig: {
				name: `Canvas test ${crypto.randomUUID()}`,
				protocol: 'openai-completions',
				models: [{ id: 'mimin-e2e', name: 'Mimin test model', contextWindow: 16_000 }]
			}
		}
	});
	await expect(providerResponse).toBeOK();
	const { provider } = (await providerResponse.json()) as { provider: string };
	const conversationResponse = await page
		.context()
		.request.post(apiUrl(page, '/api/conversations'), {
			data: { model: `${provider}/mimin-e2e`, enabledTools: [] }
		});
	await expect(conversationResponse).toBeOK();
	const { conversation } = (await conversationResponse.json()) as { conversation: Conversation };
	const canvasResponse = await page.context().request.post(apiUrl(page, '/api/canvases'), {
		data: { title: 'Playwright Canvas', conversationId: conversation.id }
	});
	await expect(canvasResponse).toBeOK();
	const { canvas: initialCanvas } = (await canvasResponse.json()) as { canvas: Canvas };
	let canvas = initialCanvas;
	const scenes: Scene[] = [];
	for (const scene of [
		{
			name: 'First scene',
			viewport: 'desktop' as const,
			html: '<main><h1>First heading</h1><button id="counter">Count 0</button></main>',
			css: 'body { background: #f4f0e8; color: #172554; } h1 { font-size: 42px; }',
			js: "let count = 0; document.getElementById('counter').onclick = event => event.target.textContent = 'Count ' + (++count);"
		},
		{
			name: 'Second scene',
			viewport: 'mobile' as const,
			html: '<main><h1>Second heading</h1></main>',
			css: 'body { background: #e0f2fe; color: #0c4a6e; } h1 { font-size: 36px; }',
			js: ''
		}
	]) {
		const response = await page
			.context()
			.request.post(apiUrl(page, `/api/canvases/${canvas.id}/scenes`), { data: scene });
		await expect(response).toBeOK();
		const body = (await response.json()) as { canvas: Canvas; sceneId: string };
		canvas = body.canvas;
		scenes.push(canvas.scenes.find((item) => item.id === body.sceneId)!);
	}
	await page.goto(`/chat?id=${encodeURIComponent(conversation.id)}`);
	await page.waitForLoadState('networkidle');
	await expect(page.getByLabel('Message Mimin')).toBeVisible();
	await page.getByRole('button', { name: 'Toggle Canvas' }).click();
	await expect(page.getByRole('button', { name: 'Source Code' })).toBeVisible();
	return {
		provider,
		conversation,
		canvas,
		scenes,
		errors,
		async cleanup() {
			await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
			await page
				.context()
				.request.delete(apiUrl(page, `/api/canvases/${canvas.id}`))
				.catch(() => {});
			await page
				.context()
				.request.delete(apiUrl(page, `/api/conversations/${conversation.id}`))
				.catch(() => {});
			await page
				.context()
				.request.delete(apiUrl(page, `/api/providers/${encodeURIComponent(provider)}`))
				.catch(() => {});
		}
	};
}

async function useCodeMode(page: Page) {
	await page.getByRole('button', { name: 'Source Code' }).click();
	await expect(page.locator('#canvas-scene-picker')).toBeVisible();
	await expect(page.getByLabel('HTML code')).toBeVisible();
}

async function updateScene(page: Page, canvas: Canvas, scene: Scene, updates: Partial<Scene>) {
	const response = await page
		.context()
		.request.patch(apiUrl(page, `/api/canvases/${canvas.id}/scenes/${scene.id}`), {
			data: updates
		});
	await expect(response).toBeOK();
}

async function getCanvas(page: Page, canvas: Canvas) {
	const response = await page.context().request.get(apiUrl(page, `/api/canvases/${canvas.id}`));
	await expect(response).toBeOK();
	return ((await response.json()) as { canvas: Canvas }).canvas;
}

test.beforeEach(async ({ page }) => signIn(page));

test('switches real scenes in code mode and preserves per-scene drafts and tabs', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		await useCodeMode(page);
		const picker = page.getByRole('combobox', { name: 'Scene', exact: true });
		await picker.selectOption(fixture.scenes[0].id);
		const editor = page.getByLabel('HTML code');
		await editor.fill('<main><h1>First unsaved draft</h1></main>');
		await page.getByRole('button', { name: 'CSS', exact: true }).click();
		await page.getByLabel('CSS code').fill('h1 { color: purple; }');
		await picker.selectOption(fixture.scenes[1].id);
		await expect(page.getByLabel('HTML code')).toHaveValue(fixture.scenes[1].html);
		await page.getByRole('button', { name: 'JS', exact: true }).click();
		await page.getByLabel('JS code').fill('window.sceneDraft = true;');
		await picker.selectOption(fixture.scenes[0].id);
		await expect(page.getByRole('button', { name: 'CSS', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByLabel('CSS code')).toHaveValue('h1 { color: purple; }');
		await picker.selectOption(fixture.scenes[1].id);
		await expect(page.getByRole('button', { name: 'JS', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByLabel('JS code')).toHaveValue('window.sceneDraft = true;');
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('debounces live preview changes and device selection does not persist to the scene', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		await useCodeMode(page);
		await page
			.getByRole('combobox', { name: 'Scene', exact: true })
			.selectOption(fixture.scenes[0].id);
		const frame = page.locator('[aria-label="Live preview"] iframe');
		await expect(frame).toBeVisible();
		await expect.poll(() => previewWidth(frame)).toBe(1200);
		const heading = page.frameLocator('[aria-label="Live preview"] iframe').getByRole('heading');
		await expect(heading).toHaveText('First heading');
		const frameBounds = await frame.boundingBox();
		expect(frameBounds!.height).toBeGreaterThan(100);
		const html = page.getByLabel('HTML code');
		await html.fill('<main><h1>Unsaved preview update</h1></main>');
		await expect(heading).toHaveText('Unsaved preview update');
		await page.screenshot({ path: test.info().outputPath('canvas-live.png') });
		await page.getByRole('button', { name: 'Preview mobile' }).click();
		await expect.poll(() => previewWidth(frame)).toBe(375);
		await expect(page.getByText('375 × 667', { exact: true })).toBeVisible();
		await expect(
			(await getCanvas(page, fixture.canvas)).scenes.find(
				(scene) => scene.id === fixture.scenes[0].id
			)?.viewport
		).toBe('desktop');
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('keeps later edits unsaved when an earlier delayed save completes and stores the draft', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		await useCodeMode(page);
		await page
			.getByRole('combobox', { name: 'Scene', exact: true })
			.selectOption(fixture.scenes[0].id);
		let finishSave!: () => void;
		const delayed = new Promise<void>((resolve) => (finishSave = resolve));
		let patches = 0;
		await page.route(
			`**/api/canvases/${fixture.canvas.id}/scenes/${fixture.scenes[0].id}`,
			async (route) => {
				if (route.request().method() !== 'PATCH') return route.continue();
				patches += 1;
				await delayed;
				await route.continue();
			}
		);
		const editor = page.getByLabel('HTML code');
		await editor.fill('<h1>Submitted draft</h1>');
		await page.getByRole('button', { name: 'Apply Code' }).click();
		await expect(page.locator('.save-state')).toContainText('Saving');
		await editor.fill('<h1>Later edit still local</h1>');
		await expect
			.poll(() => page.evaluate(() => localStorage.getItem('mimin_canvas_scene_drafts')))
			.toContain('Later edit still local');
		finishSave();
		await expect.poll(() => patches).toBe(1);
		await expect(page.locator('.save-state')).toHaveText('Unsaved');
		const storage = await page.evaluate(() =>
			Object.entries(localStorage).filter(([key]) => key.includes('canvas'))
		);
		expect(JSON.stringify(storage)).toContain('Later edit still local');
		const serverCanvas = await getCanvas(page, fixture.canvas);
		expect(serverCanvas.scenes.find((scene) => scene.id === fixture.scenes[0].id)?.html).toContain(
			'Submitted draft'
		);
		expect(
			serverCanvas.scenes.find((scene) => scene.id === fixture.scenes[0].id)?.html
		).not.toContain('Later edit still local');
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('reloads clean server changes, surfaces conflicts, and supports both resolutions and save retry', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		await useCodeMode(page);
		const picker = page.getByRole('combobox', { name: 'Scene', exact: true });
		await picker.selectOption(fixture.scenes[0].id);
		await updateScene(page, fixture.canvas, fixture.scenes[0], {
			html: '<h1>Server refresh clean</h1>'
		});
		await page.getByRole('button', { name: 'Reload Canvas' }).click();
		await expect(page.getByLabel('HTML code')).toHaveValue('<h1>Server refresh clean</h1>');
		await page.getByLabel('HTML code').fill('<h1>My local work</h1>');
		await updateScene(page, fixture.canvas, fixture.scenes[0], {
			html: '<h1>New server value</h1>'
		});
		await page.getByRole('button', { name: 'Reload Canvas' }).click();
		await expect(page.getByRole('alert')).toContainText('changed on the server');
		await page.getByRole('button', { name: 'Keep edits' }).click();
		await expect(page.getByLabel('HTML code')).toHaveValue('<h1>My local work</h1>');
		await updateScene(page, fixture.canvas, fixture.scenes[0], {
			html: '<h1>Latest server value</h1>'
		});
		await page.getByRole('button', { name: 'Reload Canvas' }).click();
		await expect(page.getByRole('alert')).toContainText('changed on the server');
		await page.getByRole('button', { name: 'Load latest' }).click();
		await expect(page.getByLabel('HTML code')).toHaveValue('<h1>Latest server value</h1>');

		let failNextPatch = true;
		await page.route(
			`**/api/canvases/${fixture.canvas.id}/scenes/${fixture.scenes[0].id}`,
			async (route) => {
				if (route.request().method() === 'PATCH' && failNextPatch) {
					failNextPatch = false;
					return route.fulfill({
						status: 500,
						json: { error: { message: 'Canvas save failed in test' } }
					});
				}
				return route.continue();
			}
		);
		await page.getByLabel('HTML code').fill('<h1>Retry this save</h1>');
		await page.getByRole('button', { name: 'Apply Code' }).click();
		await expect(page.locator('.save-state')).toHaveText('Save failed');
		await page.getByRole('button', { name: 'Retry save' }).click();
		await expect(page.locator('.save-state')).toHaveText('Saved');
		await expect(
			(await getCanvas(page, fixture.canvas)).scenes.find(
				(scene) => scene.id === fixture.scenes[0].id
			)?.html
		).toContain('Retry this save');
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('preview dialog fits, resets interaction on restart, and does not mutate server data', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		await page.getByRole('button', { name: 'Visual Preview', exact: true }).click();
		await expect(page.getByRole('combobox', { name: 'Scene', exact: true })).toBeVisible();
		const before = await getCanvas(page, fixture.canvas);
		await page.locator('.scene-picker').selectOption(fixture.scenes[0].id);
		await page.locator('.svelte-flow__node').filter({ hasText: fixture.scenes[0].name }).click();
		const dialog = page.getByRole('dialog', {
			name: `Interactive preview of ${fixture.scenes[0].name}`
		});
		await expect(dialog).toBeVisible();
		const bounds = await dialog.boundingBox();
		expect(bounds).not.toBeNull();
		expect(bounds!.height).toBeGreaterThan(page.viewportSize()!.height * 0.55);
		await page.screenshot({ path: test.info().outputPath('canvas-preview.png') });
		await dialog.getByRole('button', { name: '100%' }).click();
		const stage = dialog.locator('.viewport-stage');
		await expect.poll(() => stage.evaluate((el) => el.scrollTop)).toBe(0);
		await expect.poll(() => stage.evaluate((el) => el.scrollLeft)).toBe(0);
		await expect
			.poll(() =>
				stage.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
			)
			.toBe(true);
		await stage.evaluate((el) => {
			el.scrollTop = 100;
			el.scrollLeft = 100;
		});
		await expect.poll(() => stage.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
		await dialog.getByRole('button', { name: 'Mobile' }).click();
		const frame = dialog.locator('iframe');
		await expect.poll(() => previewWidth(frame)).toBe(375);
		await expect(dialog.getByText('375 × 667', { exact: true })).toBeVisible();
		const counter = dialog.frameLocator('iframe').getByRole('button', { name: /^Count/ });
		await counter.click();
		await expect(counter).toHaveText('Count 1');
		await dialog.getByRole('button', { name: 'Restart preview' }).click();
		await expect(counter).toHaveText('Count 0');
		await expect.poll(() => previewWidth(frame)).toBe(375);
		await dialog.getByRole('button', { name: 'Close preview' }).click();
		const after = await getCanvas(page, fixture.canvas);
		expect(after.revision).toBe(before.revision);
		expect(after.scenes).toEqual(before.scenes);
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('keeps mobile workspace controls and preview inside a narrow canvas pane', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByRole('tab', { name: 'Canvas Mockup' })).toBeVisible();
		await page.getByRole('button', { name: 'Source Code' }).click();
		await expect(page.locator('#canvas-scene-picker')).toBeVisible();
		const canvasPane = page.locator('.canvas-pane');
		await expect(canvasPane.locator('[aria-label="Live preview"]')).toBeVisible();
		const overflow = await page.evaluate(() => ({
			windowWidth: window.innerWidth,
			documentWidth: document.documentElement.scrollWidth,
			picker: document.querySelector('#canvas-scene-picker')?.getBoundingClientRect(),
			canvas: document.querySelector('.canvas-pane')?.getBoundingClientRect()
		}));
		expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.windowWidth);
		expect(overflow.picker).toBeTruthy();
		expect(overflow.picker!.left).toBeGreaterThanOrEqual(overflow.canvas!.left - 1);
		expect(overflow.picker!.right).toBeLessThanOrEqual(overflow.canvas!.right + 1);
		await page.screenshot({ path: test.info().outputPath('canvas-mobile.png') });
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('supports editor indentation, selection indentation, Escape and Ctrl+S', async ({ page }) => {
	const fixture = await createFixture(page);
	try {
		await useCodeMode(page);
		await page
			.getByRole('combobox', { name: 'Scene', exact: true })
			.selectOption(fixture.scenes[0].id);
		const editor = page.getByLabel('HTML code');
		await editor.fill('alpha\nbeta');
		await editor.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 5));
		await editor.press('Tab');
		await expect(editor).toHaveValue('alpha  \nbeta');
		await editor.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 8));
		await editor.press('Tab');
		await expect(editor).toHaveValue('  alpha  \nbeta');
		await editor.press('Shift+Tab');
		await expect(editor).toHaveValue('alpha  \nbeta');
		await editor.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 5));
		await editor.press('Enter');
		await expect(editor).toHaveValue('\n  \nbeta');
		await expect(editor).toBeFocused();
		await editor.press('Control+S');
		await expect(page.locator('.save-state')).toHaveText('Saved');
		await editor.press('Escape');
		await editor.press('Tab');
		await expect(editor).not.toBeFocused();
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});

test('keeps scene creation and deletion dialogs open on failure and supports retry', async ({
	page
}) => {
	const fixture = await createFixture(page);
	try {
		let failCreate = true;
		const createUrl = `**/api/canvases/${fixture.canvas.id}/scenes`;
		await page.route(createUrl, (route) => {
			if (route.request().method() === 'POST' && failCreate) {
				failCreate = false;
				return route.fulfill({
					status: 500,
					json: { error: { message: 'Scene creation failed in test' } }
				});
			}
			return route.continue();
		});
		await page.getByRole('button', { name: 'Add scene', exact: true }).click();
		const creation = page.getByRole('dialog', { name: 'Create Scene Mockup' });
		await creation.getByLabel('Scene Name').fill('<Scene & Draft>');
		await creation.getByRole('button', { name: 'Create Scene', exact: true }).click();
		await expect(creation.getByRole('alert')).toHaveText('Scene creation failed in test');
		await expect(creation.getByLabel('Scene Name')).toHaveValue('<Scene & Draft>');
		await creation.getByRole('button', { name: 'Create Scene', exact: true }).click();
		await expect(creation).not.toBeVisible();
		const latest = await getCanvas(page, fixture.canvas);
		const created = latest.scenes.find((scene) => scene.name === '<Scene & Draft>')!;
		expect(created.html).toContain('&lt;Scene &amp; Draft&gt;');
		await expect(page.getByRole('combobox', { name: 'Scene', exact: true })).toHaveValue(
			created.id
		);
		let failDelete = true;
		await page.route(`**/api/canvases/${fixture.canvas.id}/scenes/${created.id}`, (route) => {
			if (route.request().method() === 'DELETE' && failDelete) {
				failDelete = false;
				return route.fulfill({
					status: 500,
					json: { error: { message: 'Scene deletion failed in test' } }
				});
			}
			return route.continue();
		});
		await page.getByRole('button', { name: 'Fit all scenes' }).click();
		await page.locator('.svelte-flow__node').filter({ hasText: created.name }).click();
		const preview = page.getByRole('dialog', { name: `Interactive preview of ${created.name}` });
		page.on('dialog', (dialog) => dialog.accept());
		await preview.getByRole('button', { name: 'Delete scene' }).click();
		await expect(preview.getByRole('alert')).toHaveText('Scene deletion failed in test');
		await preview.getByRole('button', { name: 'Delete scene' }).click();
		await expect(preview).not.toBeVisible();
		expect((await getCanvas(page, fixture.canvas)).scenes).toHaveLength(2);
		expect(fixture.errors).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
});
