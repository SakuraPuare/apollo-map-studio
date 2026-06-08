import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  expect,
  test as base,
  type ConsoleMessage,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererUrl =
  process.env.PLAYWRIGHT_ELECTRON_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_ELECTRON_DEV_SERVER_PORT ?? '5174'}`;
const extraElectronArgs = (process.env.PLAYWRIGHT_ELECTRON_EXTRA_ARGS ?? '')
  .split(/\s+/)
  .filter(Boolean);

const ignoredConsolePatterns: RegExp[] = [
  /^\[vite\]\s+(connecting|connected)/i,
  /Download the React DevTools/i,
  /Automatic fallback to software WebGL has been deprecated/i,
  /WebGL performance caveat/i,
  /SwiftShader.*(WebGL|ANGLE|software|deprecated)/i,
  /GPU stall due to ReadPixels/i,
];

function consoleText(message: ConsoleMessage): string {
  const location = message.location();
  const where = location.url ? ` (${location.url}:${location.lineNumber})` : '';
  return `${message.type()}: ${message.text()}${where}`;
}

function isKnownDocsConsoleNoise(page: Page, message: ConsoleMessage): boolean {
  return (
    page.url().startsWith('apollo-map-studio://app/docs/') &&
    /Hydration completed but contains mismatches/i.test(message.text())
  );
}

function isFatalConsole(page: Page, message: ConsoleMessage): boolean {
  if (isKnownDocsConsoleNoise(page, message)) return false;
  if (message.type() !== 'error') return false;
  return !ignoredConsolePatterns.some((pattern) => pattern.test(message.text()));
}

function installRendererGuards(page: Page, failures: string[]): void {
  const expectedOrigin = new URL(rendererUrl).origin;
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('crash', () => failures.push('page crashed'));
  page.on('requestfailed', (request) => {
    if (['document', 'script', 'stylesheet', 'worker'].includes(request.resourceType())) {
      failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const type = response.request().resourceType();
    const url = response.url();
    const sameOrigin = (() => {
      try {
        return new URL(url).origin === expectedOrigin;
      } catch {
        return false;
      }
    })();
    if (
      sameOrigin ||
      ['document', 'script', 'stylesheet', 'worker', 'fetch', 'xhr'].includes(type)
    ) {
      failures.push(`response ${response.status()} (${type}): ${url}`);
    }
  });
  page.on('console', (message) => {
    if (isFatalConsole(page, message)) failures.push(consoleText(message));
  });
}

async function checkViteOverlay(page: Page, failures: string[]): Promise<void> {
  const text = await page
    .locator('vite-error-overlay')
    .evaluate((overlay) => overlay.shadowRoot?.textContent ?? overlay.textContent ?? '')
    .catch(() => '');
  if (text.trim()) failures.push(`vite-error-overlay: ${text.trim()}`);
}

type ElectronFixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
  rendererFailures: string[];
  userDataDir: string;
};

export const test = base.extend<ElectronFixtures>({
  userDataDir: async ({}, use, testInfo) => {
    const dir = mkdtempSync(
      path.join(tmpdir(), `apms-electron-e2e-${testInfo.workerIndex}-${testInfo.retry}-`),
    );
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },

  rendererFailures: async ({}, use) => {
    const failures: string[] = [];
    await use(failures);
    expect(failures, failures.join('\n')).toEqual([]);
  },

  electronApp: async ({ rendererFailures, userDataDir }, use) => {
    const app = await electron.launch({
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader-webgl',
        '--enable-unsafe-swiftshader',
        ...extraElectronArgs,
        '.',
      ],
      cwd: repoRoot,
      env: {
        ...process.env,
        APOLLO_MAP_STUDIO_E2E: '1',
        APOLLO_MAP_STUDIO_USER_DATA_DIR: userDataDir,
        ELECTRON_RENDERER_URL: rendererUrl,
        NODE_ENV: 'test',
      },
      timeout: 60_000,
    });

    for (const page of app.context().pages()) installRendererGuards(page, rendererFailures);
    app.context().on('page', (page) => installRendererGuards(page, rendererFailures));

    try {
      await use(app);
    } finally {
      await app.close().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (
          !/Target page, context or browser has been closed|Application was closed/i.test(message)
        ) {
          throw error;
        }
      });
    }
  },

  mainWindow: async ({ electronApp, rendererFailures }, use) => {
    const page = await electronApp.firstWindow({ timeout: 45_000 });
    await page.waitForLoadState('domcontentloaded');
    await checkViteOverlay(page, rendererFailures);
    await page.getByTestId('workspace-layout').waitFor({ state: 'visible' });
    expect(new URL(page.url()).origin).toBe(new URL(rendererUrl).origin);
    await use(page);
    await checkViteOverlay(page, rendererFailures);
  },
});

export { expect };
