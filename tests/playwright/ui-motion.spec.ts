import { expect, test, type Page } from 'playwright/test';

const email = 'admin@mimin.local';
const password = process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.locator('.main-content')).toBeVisible();
}

async function openSettings(page: Page, tab = 'models') {
	await page.goto(`/chat?settings=${tab}`);
	await page.waitForLoadState('networkidle');
	await expect(page.locator('.settings-details')).toBeVisible();
}

async function openChat(page: Page) {
	await page.goto('/chat');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('.main-content')).toBeVisible();
	await expect(page.getByLabel('Message Mimin')).toBeVisible();
}

async function capture(page: Page, name: string) {
	if (process.env.MOTION_SCREENSHOTS === '1') {
		await page.screenshot({
			path: `/tmp/mimin-motion-${name}.png`,
			animations: 'disabled'
		});
	}
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('keeps one settings section after rapid desktop tab selection', async ({ page }) => {
	await openSettings(page);

	const nav = page.getByRole('navigation', { name: 'Settings tabs' });
	await expect(nav).toBeVisible();
	const tabs = nav.getByRole('button');
	const labels = [
		'Models & Providers',
		'Instructions',
		'Web Search',
		'Browser Extension',
		'Preferences',
		'Users'
	];

	// Switch every frame so each update arrives before the previous entrance finishes.
	await tabs.evaluateAll(async (buttons, labelsToClick) => {
		for (let cycle = 0; cycle < 3; cycle += 1) {
			for (const label of labelsToClick) {
				const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
				if (button instanceof HTMLButtonElement) button.click();
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			}
		}
	}, labels);

	await expect(nav.getByRole('button', { name: 'Users', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(page.locator('.settings-tab-content')).toHaveCount(1);
	await expect(page.locator('.settings-details')).toBeVisible();
	await capture(page, 'desktop-settings');
});

test('removes entrance animation timing when reduced motion is requested', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openSettings(page);

	const nav = page.getByRole('navigation', { name: 'Settings tabs' });
	await expect(nav).toBeVisible();
	await nav.getByRole('button', { name: 'Instructions', exact: true }).click();

	const timings = await page.locator('.settings-tab-content').evaluate((node) =>
		node.getAnimations().map((animation) => {
			const timing = animation.effect?.getComputedTiming();
			return { duration: timing?.duration, delay: timing?.delay };
		})
	);
	for (const timing of timings) {
		expect(timing.duration).toBe(0);
		expect(timing.delay).toBe(0);
	}

	const pageEntrance = await page.locator('.chat-main > :first-child').evaluate((node) => {
		const style = getComputedStyle(node);
		return { animationName: style.animationName, animationDelay: style.animationDelay };
	});
	expect(pageEntrance.animationName).toBe('none');
	expect(pageEntrance.animationDelay).toBe('0s');
});

test.describe('composer options across responsive motion states', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

	test('keeps options inert while collapsed and accessible after expanding and resizing', async ({
		page
	}) => {
		await openChat(page);
		const options = page.locator('#composer-options');
		const toggle = page.getByRole('button', { name: 'Options' });

		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(options).toHaveAttribute('inert', '');
		await expect(options).toBeHidden();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(options).not.toHaveAttribute('inert');
		await expect(options.locator('.skill-trigger')).toBeVisible();
		await expect(options.locator('.tool-trigger')).toBeVisible();
		await capture(page, 'mobile-options');
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(options).toHaveAttribute('inert', '');

		await page.setViewportSize({ width: 1280, height: 844 });
		await expect(page.getByRole('button', { name: 'Options' })).toHaveCount(0);
		await expect(options).not.toHaveAttribute('inert');
		await expect(options.locator('.skill-trigger')).toBeVisible();
		await expect(options.locator('.tool-trigger')).toBeVisible();
		await capture(page, 'desktop-options');
	});
});

test.describe('mobile sidebar drawer focus', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

	test('keeps the drawer focused and restores the toggle after Escape', async ({ page }) => {
		await openChat(page);
		const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
		const shell = page.locator('.app-shell');
		const sidebar = page.locator('#workspace-sidebar');
		const main = page.locator('main.main-content');

		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(sidebar).toHaveAttribute('inert', '');
		await expect(main).not.toHaveAttribute('inert');
		await toggle.click();
		await expect(shell).toHaveClass(/mobile-open/);
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sidebar).not.toHaveAttribute('inert');
		await expect(main).toHaveAttribute('inert', '');
		await expect(page.locator('.dock-panel-head button')).toBeFocused();
		await capture(page, 'mobile-sidebar');

		for (let index = 0; index < 12; index += 1) {
			await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
			await expect(page.locator('.sidebar :focus')).toHaveCount(1);
		}

		await page.keyboard.press('Escape');
		await expect(shell).not.toHaveClass(/mobile-open/);
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(sidebar).toHaveAttribute('inert', '');
		await expect(main).not.toHaveAttribute('inert');
		await expect(toggle).toBeFocused();

		await toggle.click();
		await expect(shell).toHaveClass(/mobile-open/);
		await page.setViewportSize({ width: 1280, height: 844 });
		await expect(shell).not.toHaveClass(/mobile-open/);
		await expect(page.locator('.topbar-toggle')).toBeHidden();
		await expect(page.locator('.topbar-brand')).toBeFocused();
	});
});

test.describe('settings dismissal', () => {
	test('closes the desktop settings dialog cleanly', async ({ page }) => {
		await openSettings(page);
		await expect(page.getByRole('button', { name: 'Close settings' })).toBeVisible();
		await page.getByRole('button', { name: 'Close settings' }).click();
		await expect(page.getByRole('navigation', { name: 'Settings tabs' })).toHaveCount(0);
		await expect(page.locator('.chat-main')).toBeVisible();
	});

	test.describe('on a phone', () => {
		test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

		test('closes the settings sheet cleanly', async ({ page }) => {
			await openSettings(page);
			await expect(page.getByRole('button', { name: 'Close settings' })).toBeVisible();
			await page.getByRole('button', { name: 'Close settings' }).click();
			await expect(page.getByRole('navigation', { name: 'Settings tabs' })).toHaveCount(0);
			await expect(page.locator('.chat-main')).toBeVisible();
		});
	});
});
