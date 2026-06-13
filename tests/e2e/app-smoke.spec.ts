import { expect, test, type Locator, type Page } from '@playwright/test';
import { installConsoleGuard, type ConsoleGuard } from './helpers/consoleGuard';
import { expectMapLibreCanvasPainted, waitForMapLibreCanvas } from './helpers/mapLibre';

type PanelId = 'map' | 'sidebar' | 'inspector' | 'toolbox' | 'timeline';

const AMS_STORAGE_PREFIX = 'apollo-map-studio:';
const DRAWING_LAYOUT_KEY = 'apollo-map-studio:layout:drawing';
const GRID_ENABLED_KEY = 'apollo-map-studio:gridEnabled';
const WEB_LICENSE_KEY = 'ams.webLicense.v1';

const DEFAULT_PANELS: Array<{ id: PanelId; title: string }> = [
  { id: 'map', title: 'Map Editor' },
  { id: 'sidebar', title: 'Outline' },
  { id: 'inspector', title: 'Inspector' },
  { id: 'toolbox', title: 'Toolbox' },
];

test.describe('app startup smoke', () => {
  let guard: ConsoleGuard;

  test.beforeEach(async ({ page }) => {
    guard = installConsoleGuard(page, { failOnWarnings: true });
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
    const initialCanvas = await waitForMapLibreCanvas(page, { requireWebGl: true });
    await expectMapLibreCanvasPainted(page, initialCanvas);

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

    const restoredCanvas = await waitForMapLibreCanvas(page, { requireWebGl: true });
    await expectMapLibreCanvasPainted(page, restoredCanvas);
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
