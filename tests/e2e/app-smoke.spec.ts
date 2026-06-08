import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

type PanelId = 'map' | 'sidebar' | 'inspector' | 'toolbox' | 'timeline';

const AMS_STORAGE_PREFIX = 'apollo-map-studio:';
const DRAWING_LAYOUT_KEY = 'apollo-map-studio:layout:drawing';
const GRID_ENABLED_KEY = 'apollo-map-studio:gridEnabled';
const WEB_LICENSE_KEY = 'ams.webLicense.v1';
const MAP_BACKGROUND = [26, 26, 46] as const;
const CANVAS_SELECTOR =
  '[data-testid="map-canvas"] canvas.maplibregl-canvas[data-testid="maplibre-canvas"], [data-testid="maplibre-canvas"]';

const DEFAULT_PANELS: Array<{ id: PanelId; title: string }> = [
  { id: 'map', title: 'Map Editor' },
  { id: 'sidebar', title: 'Outline' },
  { id: 'inspector', title: 'Inspector' },
  { id: 'toolbox', title: 'Toolbox' },
];

const BENIGN_WARNING_PATTERNS = [
  /\[vite\]\s+(connected|connecting)/i,
  /^Automatic fallback to software WebGL has been deprecated/i,
  /^WebGL performance caveat/i,
  /SwiftShader.*(automatic fallback to software WebGL|WebGL|ANGLE|software|deprecated)/i,
  /SwiftShader device/i,
  /Passthrough is not supported, GL is swiftshader/i,
  /GL Driver Message .*GPU stall due to ReadPixels/i,
];

interface ConsoleGuard {
  assertClean(): void;
}

test.describe('app startup smoke', () => {
  let guard: ConsoleGuard;

  test.beforeEach(async ({ page }) => {
    guard = installConsoleGuard(page);
    await installAppSmokeInit(page);
  });

  test.afterEach(() => {
    guard.assertClean();
  });

  test('loads the workspace, paints MapLibre, and restores layout after reload', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    await expect(page).toHaveTitle('Apollo Map Studio');
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toHaveCount(0);
    await expect(page.getByText('You are not authorized to use this application')).toHaveCount(0);
    await expect(page.getByText('Matched policy keyword')).toHaveCount(0);

    await expect(page.getByTestId('status-app-mode')).toHaveText('绘图');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
    await expect(page.getByTestId('status-entity-count')).toHaveText('0');
    await expect(page.getByTestId('status-toggle-grid')).toHaveAttribute('data-enabled', 'true');
    await expect(page.getByTestId('license-status')).toHaveText(/^(trial|activated)$/);

    await expectDefaultDockview(page);
    const initialCanvas = await waitForPaintedMapCanvas(page);
    await expectNonBackgroundCanvasPixels(page, initialCanvas);

    await clickViewAction(page, 'view:toolbox');
    await expect(page.getByTestId('workspace-panel-toolbox')).toHaveCount(0);
    await waitForSavedLayout(page, DRAWING_LAYOUT_KEY, (ids) => !ids.has('toolbox'));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWorkspaceReady(page);

    await expect(page.getByTestId('workspace-panel-map')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-sidebar')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-inspector')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-toolbox')).toHaveCount(0);
    await expectDockviewTitle(page, 'Map Editor');
    await expectDockviewTitle(page, 'Outline');
    await expectDockviewTitle(page, 'Inspector');
    await expect(page.getByTestId('status-toggle-grid')).toHaveAttribute('data-enabled', 'true');

    const restoredCanvas = await waitForPaintedMapCanvas(page);
    await expectNonBackgroundCanvasPixels(page, restoredCanvas);
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toHaveCount(0);
  });
});

async function installAppSmokeInit(page: Page): Promise<void> {
  await page.addInitScript(
    ({ prefix, gridKey, licenseKey }) => {
      const markerKey = `${prefix}e2e:app-smoke-storage-cleared`;
      const keysToRemove: string[] = [];

      if (sessionStorage.getItem(markerKey) !== '1') {
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(prefix) || key === licenseKey) keysToRemove.push(key);
        }
        for (const key of keysToRemove) localStorage.removeItem(key);
        sessionStorage.clear();
        sessionStorage.setItem(markerKey, '1');
      }

      const now = Date.now();
      localStorage.setItem(gridKey, 'true');
      localStorage.setItem(
        licenseKey,
        JSON.stringify({
          trialStart: now,
          activation: {
            license: { id: 'app-smoke', name: 'App Smoke License', issued: now, expires: 0 },
            expires: 0,
            activatedAt: now,
          },
        }),
      );
    },
    { prefix: AMS_STORAGE_PREFIX, gridKey: GRID_ENABLED_KEY, licenseKey: WEB_LICENSE_KEY },
  );
}

function installConsoleGuard(page: Page): ConsoleGuard {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(formatConsoleMessage(message));
      return;
    }

    if (
      message.type() === 'warning' &&
      !BENIGN_WARNING_PATTERNS.some((pattern) => pattern.test(message.text()))
    ) {
      failures.push(formatConsoleMessage(message));
    }
  });

  return {
    assertClean() {
      expect(failures, failures.join('\n')).toEqual([]);
    },
  };
}

function formatConsoleMessage(message: ConsoleMessage): string {
  const location = message.location();
  const where = location.url ? ` (${location.url}:${location.lineNumber})` : '';
  return `${message.type()}: ${message.text()}${where}`;
}

async function waitForWorkspaceReady(page: Page): Promise<void> {
  await expect(page.getByTestId('workspace-layout')).toBeVisible();
  await expect(page.getByTestId('workspace-main')).toBeVisible();
  await expect(page.getByTestId('workspace-dockview')).toBeVisible();
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

async function expectDefaultDockview(page: Page): Promise<void> {
  for (const panel of DEFAULT_PANELS) {
    await expect(page.getByTestId(`workspace-panel-${panel.id}`)).toBeVisible();
    await expectDockviewTitle(page, panel.title);
  }
  await expect(page.getByTestId('workspace-panel-timeline')).toHaveCount(0);
}

async function expectDockviewTitle(page: Page, title: string): Promise<void> {
  await expect(dockviewTitle(page, title)).toHaveCount(1);
}

function dockviewTitle(page: Page, title: string): Locator {
  return page
    .getByTestId('workspace-dockview')
    .locator('.dv-default-tab-content')
    .filter({ hasText: new RegExp(`^${escapeRegExp(title)}$`) });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function clickViewAction(page: Page, actionId: string): Promise<void> {
  await page.getByTestId('menu-view').click();
  const item = page.locator(`[data-action-id="${actionId}"]`);
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
  await item.click();
  await expect(item).toHaveCount(0);
}

async function waitForPaintedMapCanvas(page: Page): Promise<Locator> {
  await expect(page.getByTestId('workspace-panel-map')).toBeVisible();

  const canvas = page.locator(CANVAS_SELECTOR).first();
  await expect(canvas).toBeVisible();

  await page.waitForFunction((selector) => {
    const node = document.querySelector<HTMLCanvasElement>(selector);
    if (!node) return false;

    const first = node.getBoundingClientRect();
    if (first.width <= 100 || first.height <= 100 || node.width <= 100 || node.height <= 100) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const second = node.getBoundingClientRect();
          const gl = node.getContext('webgl2') ?? node.getContext('webgl');
          resolve(
            second.width === first.width &&
              second.height === first.height &&
              Boolean(
                gl &&
                !gl.isContextLost() &&
                gl.drawingBufferWidth > 100 &&
                gl.drawingBufferHeight > 100,
              ),
          );
        });
      });
    });
  }, CANVAS_SELECTOR);

  return canvas;
}

async function expectNonBackgroundCanvasPixels(page: Page, canvas: Locator): Promise<void> {
  await expect
    .poll(async () => hasNonBackgroundCanvasPixels(page, canvas), { timeout: 10_000 })
    .toBe(true);
}

async function hasNonBackgroundCanvasPixels(page: Page, canvas: Locator): Promise<boolean> {
  const pngBase64 = (await canvas.screenshot({ type: 'png' })).toString('base64');

  return page.evaluate(
    async ({ base64, background }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const probe = document.createElement('canvas');
      probe.width = bitmap.width;
      probe.height = bitmap.height;

      const context = probe.getContext('2d', { willReadFrequently: true });
      if (!context) return false;

      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, probe.width, probe.height);
      let changed = 0;

      for (let index = 0; index < data.length; index += 16) {
        if ((data[index + 3] ?? 0) < 240) continue;
        const delta =
          Math.abs((data[index] ?? 0) - background[0]) +
          Math.abs((data[index + 1] ?? 0) - background[1]) +
          Math.abs((data[index + 2] ?? 0) - background[2]);

        if (delta > 24) changed += 1;
        if (changed >= 64) return true;
      }

      return false;
    },
    { base64: pngBase64, background: MAP_BACKGROUND },
  );
}

async function waitForSavedLayout(
  page: Page,
  key: string,
  predicate: (ids: Set<PanelId>) => boolean,
): Promise<void> {
  await expect
    .poll(async () => {
      const raw = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
      if (!raw) return false;
      return predicate(collectPanelIds(JSON.parse(raw)));
    })
    .toBe(true);
}

function collectPanelIds(value: unknown): Set<PanelId> {
  const ids = new Set<PanelId>();
  collectPanelIdsInto(value, ids);
  return ids;
}

function collectPanelIdsInto(value: unknown, ids: Set<PanelId>): void {
  if (typeof value === 'string') {
    if (isPanelId(value)) ids.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPanelIdsInto(item, ids);
    return;
  }

  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'panels' && child && typeof child === 'object' && !Array.isArray(child)) {
      for (const [panelId, panel] of Object.entries(child)) {
        if (isPanelId(panelId)) ids.add(panelId);
        collectPanelIdsInto(panel, ids);
      }
      continue;
    }

    if (['id', 'panelIds', 'views', 'activeView'].includes(key)) {
      collectPanelIdsInto(child, ids);
    }
  }
}

function isPanelId(value: string): value is PanelId {
  return ['map', 'sidebar', 'inspector', 'toolbox', 'timeline'].includes(value);
}
