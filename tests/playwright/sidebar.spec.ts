import { expect, test, type Page } from 'playwright/test';

async function openChat(page: Page) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill('admin@mimin.local');
	await page
		.getByLabel('Password')
		.fill(process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$|\/chat/);
	await expect(page.getByRole('complementary', { name: 'Workspace navigation' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.goto('/chat');
	await page.waitForLoadState('networkidle');
	await expect(page.getByLabel('Message Mimin')).toBeVisible();
}

const dock = (page: Page) =>
	page
		.getByRole('complementary', { name: 'Workspace navigation' })
		.locator('.dock-nav, .dock-bottom');
const panel = (page: Page) => page.locator('#dock-panel');

async function contentBounds(page: Page) {
	return page.evaluate(() =>
		['.main-content', '.topbar', '.chat-composer'].map((selector) => {
			const box = document.querySelector(selector)!.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height };
		})
	);
}

async function finishPanelTransition(page: Page) {
	await panel(page).evaluate((node) =>
		Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})))
	);
}

async function expectOverlay(page: Page) {
	const stacking = await page.evaluate(() => {
		const overlay = document.querySelector('#dock-panel')!;
		const bounds = overlay.getBoundingClientRect();
		return ['.topbar', '.chat-composer'].map((selector) => {
			const content = document.querySelector(selector)!.getBoundingClientRect();
			const left = Math.max(bounds.left, content.left);
			const right = Math.min(bounds.right, content.right);
			const top = Math.max(bounds.top, content.top);
			const bottom = Math.min(bounds.bottom, content.bottom);
			return {
				overlaps: right > left && bottom > top,
				onTop: overlay.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
			};
		});
	});
	for (const result of stacking) {
		expect(result.overlaps).toBe(true);
		expect(result.onTop).toBe(true);
	}
}

test.beforeEach(async ({ page }) => {
	await openChat(page);
});

test('opens every sidebar panel on hover without navigating or starting a chat', async ({
	page
}) => {
	const url = page.url();
	const writes: string[] = [];
	page.on('request', (request) => {
		if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) {
			writes.push(request.url());
		}
	});
	const icons = [
		['button', 'New chat', 'New chat'],
		['button', 'Chats and recent history', 'Chats'],
		['link', 'Projects', 'Projects'],
		['link', 'Skills', 'Skills'],
		['button', 'Settings', 'Settings'],
		['button', 'Profile', 'Profile']
	] as const;
	for (const [role, name, title] of icons) {
		const icon = dock(page).getByRole(role, { name, exact: true });
		await icon.hover();
		await expect(panel(page).locator('.dock-panel-head strong')).toHaveText(title);
		await expect(icon).toHaveAttribute('aria-expanded', 'true');
		await expect(page).toHaveURL(url);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	}
	expect(writes).toEqual([]);
	await expect(panel(page).getByRole('button', { name: 'Log out' })).toBeVisible();
});

test('keeps the panel open while crossing the gutter and closes after leaving', async ({
	page
}) => {
	await dock(page).getByRole('button', { name: 'Chats and recent history' }).hover();
	const iconBounds = await dock(page)
		.getByRole('button', { name: 'Chats and recent history' })
		.boundingBox();
	const panelBounds = await panel(page).boundingBox();
	await page.mouse.move(panelBounds!.x - 5, iconBounds!.y + 20);
	await page.mouse.move(panelBounds!.x + 40, iconBounds!.y + 20);
	await page.waitForTimeout(250);
	await expect(panel(page)).toBeVisible();
	await page.mouse.move(700, 20);
	await expect(panel(page)).toHaveCount(0);
});

test('pins a hovered panel on click and supports Escape and repeat-click dismissal', async ({
	page
}) => {
	const chats = dock(page).getByRole('button', { name: 'Chats and recent history' });
	await chats.hover();
	await chats.click();
	await page.mouse.move(700, 20);
	await page.waitForTimeout(250);
	await expect(panel(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(panel(page)).toHaveCount(0);
	await chats.click();
	await expect(panel(page)).toBeVisible();
	await chats.click();
	await expect(panel(page)).toHaveCount(0);
});

for (const width of [1714, 1280, 800]) {
	test(`overlays the header and composer without moving main content at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 982 });
		await page.evaluate(() => localStorage.setItem('mimin_sidebar_collapsed', 'true'));
		await page.reload();
		await page.waitForLoadState('networkidle');
		const before = await contentBounds(page);
		await dock(page).getByRole('button', { name: 'Chats and recent history' }).hover();
		await expect(panel(page)).toBeVisible();
		await finishPanelTransition(page);
		expect(await contentBounds(page)).toEqual(before);
		await expectOverlay(page);
		await page.screenshot({ path: test.info().outputPath('sidebar.png') });
		await page.keyboard.press('Escape');
		await expect(panel(page)).toHaveCount(0);
		expect(await contentBounds(page)).toEqual(before);
	});
}

test('animates opening and closing and can reopen during collapse without shifting content', async ({
	page
}) => {
	const before = await contentBounds(page);
	const sampleMotion = async (opening: boolean) =>
		page.evaluate(async (open) => {
			if (open) {
				document
					.querySelector('[aria-label="Chats and recent history"]')!
					.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
			} else {
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			}
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
			const node = document.querySelector('#dock-panel')!;
			const animation = node.getAnimations()[0];
			const duration = Number(animation.effect!.getComputedTiming().duration);
			// Sample the midpoint deterministically rather than racing the browser's frame clock.
			animation.pause();
			await animation.ready;
			animation.currentTime = duration / 2;
			const motion = {
				opacity: Number(getComputedStyle(node).opacity),
				transform: getComputedStyle(node).transform,
				duration
			};
			animation.play();
			return motion;
		}, opening);
	const opening = await sampleMotion(true);
	expect(opening.duration).toBe(220);
	expect(opening.opacity).toBeGreaterThan(0);
	expect(opening.opacity).toBeLessThan(1);
	expect(opening.transform).not.toBe('none');
	expect(await contentBounds(page)).toEqual(before);
	await finishPanelTransition(page);
	const closing = await sampleMotion(false);
	expect(closing.opacity).toBeGreaterThan(0);
	expect(closing.opacity).toBeLessThan(1);
	expect(await contentBounds(page)).toEqual(before);
	await dock(page)
		.getByRole('button', { name: 'Chats and recent history' })
		.dispatchEvent('pointerenter', { pointerType: 'mouse' });
	await expect(panel(page)).toBeVisible();
	await finishPanelTransition(page);
	await expect(panel(page).locator('.dock-panel-head strong')).toHaveText('Chats');
	await page.keyboard.press('Escape');
	await expect(panel(page)).toHaveCount(0);
	expect(await contentBounds(page)).toEqual(before);
});

test('respects reduced-motion preferences', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await dock(page)
		.getByRole('button', { name: 'Chats and recent history' })
		.dispatchEvent('pointerenter', { pointerType: 'mouse' });
	await expect(panel(page)).toBeVisible();
	const motion = await panel(page).evaluate((node) => ({
		opacity: getComputedStyle(node).opacity,
		animations: node.getAnimations().length
	}));
	expect(motion).toEqual({ opacity: '1', animations: 0 });
	await page.keyboard.press('Escape');
	await expect(panel(page)).toHaveCount(0);
});

test('shows project and skill shortcuts and preserves click navigation', async ({ page }) => {
	await page.route('**/api/projects', (route) =>
		route.fulfill({
			json: {
				projects: [
					{
						id: '00000000-0000-4000-8000-000000000001',
						name: 'Sidebar project',
						description: 'Project notes'
					}
				]
			}
		})
	);
	await page.route('**/api/skills', (route) =>
		route.fulfill({
			json: {
				skills: [
					{
						id: '00000000-0000-4000-8000-000000000002',
						name: 'Sidebar skill',
						description: 'Skill instructions',
						projectId: null,
						triggerPhrases: []
					}
				]
			}
		})
	);
	await dock(page).getByRole('link', { name: 'Projects', exact: true }).hover();
	await expect(
		panel(page).getByRole('link', { name: 'Sidebar project Project notes' })
	).toBeVisible();
	await dock(page).getByRole('link', { name: 'Skills', exact: true }).hover();
	await expect(
		panel(page).getByRole('link', { name: 'Sidebar skill Skill instructions' })
	).toBeVisible();
	await dock(page).getByRole('link', { name: 'Projects', exact: true }).click();
	await expect(page).toHaveURL(/\/projects$/);
	await expect(panel(page)).toHaveCount(0);
});

test('opens the selected settings tab only when clicked', async ({ page }) => {
	await dock(page).getByRole('button', { name: 'Settings', exact: true }).hover();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await panel(page).getByRole('button', { name: 'Preferences', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
	await expect(panel(page)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Preferences', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
});

test('opens settings category list on mobile and returns from details', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.mobile-nav')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Source · AGPL-3.0' })).toHaveCount(0);
	await dock(page).getByRole('button', { name: 'Settings', exact: true }).dispatchEvent('click');
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await expect(settings.locator('.settings-nav-header h2')).toBeVisible();
	await expect(settings.getByRole('textbox', { name: 'Search settings' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Models & Providers' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Instructions' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Web Search' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Browser Extension' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Preferences' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Users' })).toBeVisible();
	await expect(settings.getByText('Add a provider', { exact: true })).toHaveCount(0);

	await settings.getByRole('button', { name: 'Instructions' }).click();
	await expect(settings.getByRole('button', { name: 'Back to settings tabs' })).toBeVisible();
	await expect(settings.getByRole('heading', { name: 'Custom instructions', exact: true })).toBeVisible();
	await settings.getByRole('button', { name: 'Back to settings tabs' }).click();
	await expect(settings.locator('.settings-nav-header h2')).toBeVisible();
	await settings.getByRole('button', { name: 'Instructions' }).click();
	await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
	await expect(settings).toHaveCount(0);
	await dock(page).getByRole('button', { name: 'Settings', exact: true }).dispatchEvent('click');
	await expect(settings.locator('.settings-nav-header h2')).toBeVisible();
});

test('keeps touch navigation click-driven and restores mobile content after closing', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Toggle sidebar' }).click();
	await expect(panel(page)).toBeVisible();
	const mainBefore = await page.locator('.main-content').boundingBox();
	await dock(page)
		.getByRole('link', { name: 'Projects', exact: true })
		.dispatchEvent('pointerenter', { pointerType: 'touch' });
	await expect(panel(page).locator('.dock-panel-head strong')).toHaveText('Chats');
	await dock(page).getByRole('button', { name: 'Profile', exact: true }).click();
	await expect(panel(page).locator('.dock-panel-head strong')).toHaveText('Profile');
	await page.keyboard.press('Escape');
	await expect(panel(page)).toHaveCount(0);
	const mainAfter = await page.locator('.main-content').boundingBox();
	expect(mainAfter!.x).toBe(mainBefore!.x);
	expect(mainAfter!.width).toBe(mainBefore!.width);
});
