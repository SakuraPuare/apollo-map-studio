import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || undefined;
const port = Number(
  process.env.PLAYWRIGHT_PREVIEW_PORT ??
    process.env.PLAYWRIGHT_DEV_SERVER_PORT ??
    process.env.E2E_PORT ??
    4173,
);
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['list'], ['html', { outputFolder: '.tmp/playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: '.tmp/playwright-report', open: 'never' }]],
  outputDir: '.tmp/playwright-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `pnpm build:web && pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          executablePath: chromiumExecutablePath,
          args: [
            '--headless=new',
            '--disable-dev-shm-usage',
            '--enable-webgl',
            '--use-gl=swiftshader',
          ],
        },
      },
    },
  ],
});
