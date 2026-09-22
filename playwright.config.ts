import { defineConfig, devices } from 'playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appPort = Number(process.env.PLAYWRIGHT_APP_PORT ?? 4173);
const providerPort = Number(process.env.PLAYWRIGHT_PROVIDER_PORT ?? 4317);
const appUrl = `http://127.0.0.1:${appPort}`;
const providerUrl = `http://127.0.0.1:${providerPort}/v1`;
const databaseUrl =
	process.env.PLAYWRIGHT_DATABASE_URL ??
	process.env.TEST_DATABASE_URL ??
	process.env.DATABASE_URL ??
	'postgres://mimin:mimin@127.0.0.1:5432/mimin_playwright';
const seedPassword = process.env.PLAYWRIGHT_SEED_PASSWORD ?? 'playwright-e2e-password';

const testEnv = {
	...process.env,
	DATABASE_URL: databaseUrl,
	TEST_DATABASE_URL: databaseUrl,
	SEED_PASSWORD: seedPassword,
	BETTER_AUTH_SECRET:
		process.env.BETTER_AUTH_SECRET ?? 'playwright-test-secret-do-not-use-in-production',
	BETTER_AUTH_URL: appUrl,
	ORIGIN: appUrl,
	PROVIDER_KEY_ENCRYPTION_SECRET:
		process.env.PROVIDER_KEY_ENCRYPTION_SECRET ??
		'playwright-test-provider-encryption-secret-do-not-use-in-production',
	STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? 'local',
	STORAGE_PATH: process.env.STORAGE_PATH ?? path.join(root, 'test-artifacts', 'uploads'),
	DOCUMENT_WORKER_ENABLED: 'false',
	FAKE_PROVIDER_URL: providerUrl
};

export default defineConfig({
	testDir: './tests/playwright',
	testIgnore: ['global-setup.ts'],
	globalSetup: './tests/playwright/global-setup.ts',
	outputDir: './test-results/playwright',
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
	use: {
		baseURL: appUrl,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		extraHTTPHeaders: { 'x-playwright-suite': 'mimin-app' }
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: [
		{
			command: `node tests/playwright/fake-provider.mjs --port ${providerPort}`,
			url: `${providerUrl}/models`,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			env: testEnv
		},
		{
			command: `npm run dev -- --host 127.0.0.1 --port ${appPort}`,
			url: `${appUrl}/login`,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			env: testEnv
		}
	]
});
