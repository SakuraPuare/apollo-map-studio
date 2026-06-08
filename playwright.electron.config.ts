import { defineConfig } from '@playwright/test';

const E2E_PORT = Number(process.env.PLAYWRIGHT_ELECTRON_DEV_SERVER_PORT ?? 5174);
const externalBaseURL = process.env.PLAYWRIGHT_ELECTRON_BASE_URL;
const E2E_BASE_URL = externalBaseURL ?? `http://127.0.0.1:${E2E_PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './electron-e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  globalTimeout: 900_000,
  reporter: isCI
    ? [
        ['github'],
        ['list'],
        ['html', { outputFolder: '.tmp/playwright-electron-report', open: 'never' }],
      ]
    : [['list'], ['html', { outputFolder: '.tmp/playwright-electron-report', open: 'never' }]],
  outputDir: '.tmp/playwright-electron-results',
  webServer: externalBaseURL
    ? undefined
    : {
        command: [
          'pnpm clean:electron',
          'pnpm exec tsc -p tsconfig.electron.json',
          'cross-env VITE_APOLLO_ELECTRON_E2E=1 pnpm exec vite build --mode test',
          'pnpm build:docs:desktop',
          `pnpm exec vite preview --host 127.0.0.1 --port ${E2E_PORT} --strictPort`,
        ].join(' && '),
        url: E2E_BASE_URL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
