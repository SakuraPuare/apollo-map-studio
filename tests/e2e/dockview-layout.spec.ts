import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { AmsE2EApp } from './helpers/app';
import { installConsoleGuard, type ConsoleGuard } from './helpers/consoleGuard';
import { AMS_STORAGE_PREFIX, AMS_WEB_LICENSE_KEY } from './helpers/storage';
import { selectors } from './helpers/selectors';

type PanelId = 'map' | 'sidebar' | 'inspector' | 'toolbox' | 'timeline';
type LayoutKey = 'apollo-map-studio:layout:drawing' | 'apollo-map-studio:layout:scene';

interface DockviewFixtures {
  consoleGuard: ConsoleGuard;
  ams: AmsE2EApp;
}

const DRAWING_LAYOUT_KEY = 'apollo-map-studio:layout:drawing';
const SCENE_LAYOUT_KEY = 'apollo-map-studio:layout:scene';
const DRAWING_DEFAULT_PANELS: PanelId[] = ['map', 'sidebar', 'inspector', 'toolbox'];
const WORKSPACE_PANEL_IDS = new Set<PanelId>([...DRAWING_DEFAULT_PANELS, 'timeline']);
const WEB_LICENSE_RECORD = JSON.stringify({
  trialStart: 0,
  activation: {
    license: { id: 'e2e', name: 'E2E Mock License', issued: 0, expires: 0 },
    expires: 0,
    activatedAt: 0,
  },
});

const test = base.extend<DockviewFixtures>({
  consoleGuard: async ({ page }, use) => {
    const guard = installConsoleGuard(page);
    await use(guard);
    guard.assertClean();
  },

  ams: async ({ page, consoleGuard: _consoleGuard }, use, testInfo) => {
    await installDockviewInit(page);
    await use(new AmsE2EApp(page, testInfo));
  },
});

test.describe('Dockview workspace layout', () => {
  test.beforeEach(async ({ ams }) => {
    await ams.gotoWorkspace();
  });

  test('loads default drawing layout and scene-only timeline layout', async ({ ams }) => {
    await expectDrawingDefaults(ams.page);
    await expectNoPanel(ams.page, 'timeline');

    await switchMode(ams.page, 'scene');
    await expectSceneDefaults(ams.page);
  });

  test('toggles workspace panels from the View menu', async ({ ams }) => {
    const toggleCases: Array<{ actionId: string; panel: PanelId }> = [
      { actionId: 'view:mapEditor', panel: 'map' },
      { actionId: 'view:inspector', panel: 'inspector' },
      { actionId: 'view:toolbox', panel: 'toolbox' },
    ];

    for (const { actionId, panel } of toggleCases) {
      await clickViewAction(ams.page, actionId);
      await expectNoPanel(ams.page, panel);

      await clickViewAction(ams.page, actionId);
      await expectPanel(ams.page, panel);
    }

    await openViewMenu(ams.page);
    await expect(ams.page.locator(selectors.menu.action('view:timeline'))).toHaveCount(0);
    await closeMenu(ams.page);

    await switchMode(ams.page, 'scene');
    await clickViewAction(ams.page, 'view:timeline');
    await expectNoPanel(ams.page, 'timeline');

    await clickViewAction(ams.page, 'view:timeline');
    await expectPanel(ams.page, 'timeline');
  });

  test('filters activity tabs by mode and toggles the sidebar panel container', async ({ ams }) => {
    await expect(ams.page.locator(selectors.activity.button('scenarios'))).toHaveCount(0);

    await ams.openActivityPanel('layers');
    await expectPanel(ams.page, 'sidebar');

    await ams.openActivityPanel('search');
    await expectPanel(ams.page, 'sidebar');

    await clickViewAction(ams.page, 'view:search');
    await expectNoPanel(ams.page, 'sidebar');

    await ams.openActivityPanel('outline');
    await expectPanel(ams.page, 'sidebar');

    await switchMode(ams.page, 'scene');
    await expect(ams.page.locator(selectors.activity.button('scenarios'))).toBeVisible();

    await ams.openActivityPanel('scenarios');
    await expectPanel(ams.page, 'sidebar');

    await clickViewAction(ams.page, 'view:scenarios');
    await expectNoPanel(ams.page, 'sidebar');
  });

  test('persists layout changes across refresh', async ({ ams }) => {
    await clickViewAction(ams.page, 'view:inspector');
    await waitSavedPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => !ids.has('inspector'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await expectNoPanel(ams.page, 'inspector');
    await expectPanel(ams.page, 'toolbox');
    await expectNoPanel(ams.page, 'timeline');

    await clickViewAction(ams.page, 'view:inspector');
    await waitSavedPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => ids.has('inspector'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await expectDrawingDefaults(ams.page);

    await switchMode(ams.page, 'scene');
    await clickViewAction(ams.page, 'view:timeline');
    await waitSavedPanelIds(ams.page, SCENE_LAYOUT_KEY, (ids) => !ids.has('timeline'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await switchMode(ams.page, 'scene', { timeline: 'closed' });
    await expectNoPanel(ams.page, 'timeline');

    await clickViewAction(ams.page, 'view:timeline');
    await waitSavedPanelIds(ams.page, SCENE_LAYOUT_KEY, (ids) => ids.has('timeline'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await switchMode(ams.page, 'scene');
    await expectSceneDefaults(ams.page);
  });

  test('recovers defaults when a saved drawing layout is missing Map Editor', async ({ ams }) => {
    await clickViewAction(ams.page, 'view:mapEditor');
    await waitSavedPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => !ids.has('map'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();

    await expectDrawingDefaults(ams.page);
    await expectNoPanel(ams.page, 'timeline');
    await waitForMissingOrPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => ids.has('map'));
  });

  test('reset layout restores current-mode defaults', async ({ ams }) => {
    await clickViewAction(ams.page, 'view:inspector');
    await clickViewAction(ams.page, 'view:toolbox');
    await waitSavedPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => !ids.has('inspector'));
    await expectNoPanel(ams.page, 'toolbox');

    await clickViewAction(ams.page, 'resetLayout');
    await expectDrawingDefaults(ams.page);
    await expectNoPanel(ams.page, 'timeline');
    await waitForMissingOrPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) =>
      hasAll(ids, DRAWING_DEFAULT_PANELS),
    );

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await expectDrawingDefaults(ams.page);

    await switchMode(ams.page, 'scene');
    await clickViewAction(ams.page, 'view:timeline');
    await waitSavedPanelIds(ams.page, SCENE_LAYOUT_KEY, (ids) => !ids.has('timeline'));

    await clickViewAction(ams.page, 'resetLayout');
    await expectSceneDefaults(ams.page);
    await waitForMissingOrPanelIds(ams.page, SCENE_LAYOUT_KEY, (ids) => ids.has('timeline'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await switchMode(ams.page, 'scene');
    await expectSceneDefaults(ams.page);

    await switchMode(ams.page, 'drawing');
    await switchMode(ams.page, 'scene');
    await expectSceneDefaults(ams.page);
  });

  test('keeps drawing and scene layout storage isolated across mode switches', async ({ ams }) => {
    await clickViewAction(ams.page, 'view:inspector');
    await waitSavedPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => !ids.has('inspector'));

    await switchMode(ams.page, 'scene');
    await expectPanel(ams.page, 'inspector');
    await expectPanel(ams.page, 'timeline');

    await switchMode(ams.page, 'drawing');
    await expectNoPanel(ams.page, 'inspector');
    await expectPanel(ams.page, 'toolbox');
    await expectNoPanel(ams.page, 'timeline');
  });

  test('does not restore scene-only panels from drawing storage', async ({ ams }) => {
    await switchMode(ams.page, 'scene');
    await clickViewAction(ams.page, 'view:timeline');
    await waitSavedPanelIds(ams.page, SCENE_LAYOUT_KEY, (ids) => !ids.has('timeline'));

    await clickViewAction(ams.page, 'view:timeline');
    const sceneLayout = await waitSavedPanelIds(ams.page, SCENE_LAYOUT_KEY, (ids) =>
      ids.has('timeline'),
    );
    expect(sceneLayout.raw).toBeTruthy();

    await copyLayoutStorage(ams.page, SCENE_LAYOUT_KEY, DRAWING_LAYOUT_KEY);
    await switchMode(ams.page, 'drawing');

    await expectDrawingDefaults(ams.page);
    await expectNoPanel(ams.page, 'timeline');
    await waitForMissingOrPanelIds(ams.page, DRAWING_LAYOUT_KEY, (ids) => !ids.has('timeline'));

    await ams.page.reload();
    await ams.waitForWorkspaceReady();
    await expectDrawingDefaults(ams.page);
    await expectNoPanel(ams.page, 'timeline');
  });
});

async function installDockviewInit(page: Page): Promise<void> {
  await page.addInitScript(
    ({ licenseKey, licenseRecord, storagePrefix }) => {
      const hasClearedKey = `${storagePrefix}e2e:dockview-storage-cleared`;

      if (sessionStorage.getItem(hasClearedKey) !== '1') {
        const keysToRemove: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(storagePrefix) || key === licenseKey) keysToRemove.push(key);
        }
        for (const key of keysToRemove) localStorage.removeItem(key);
        sessionStorage.setItem(hasClearedKey, '1');
      }

      localStorage.setItem(licenseKey, licenseRecord);
    },
    {
      licenseKey: AMS_WEB_LICENSE_KEY,
      licenseRecord: WEB_LICENSE_RECORD,
      storagePrefix: AMS_STORAGE_PREFIX,
    },
  );
}

async function switchMode(
  page: Page,
  mode: 'drawing' | 'scene',
  options: { timeline?: 'open' | 'closed' } = {},
) {
  await page.locator(selectors.mode.button(mode)).click();
  await expect(page.locator(selectors.mode.button(mode))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(selectors.status.field('app-mode'))).toHaveText(
    mode === 'scene' ? '场景' : '绘图',
  );
  await expect(page.locator(selectors.workspace.dockview)).toBeVisible();
  if (mode === 'scene' && options.timeline !== 'closed') {
    await expectPanel(page, 'timeline');
  } else if (mode === 'scene') {
    await expectNoPanel(page, 'timeline');
    await expectPanel(page, 'sidebar');
  } else {
    await expectNoPanel(page, 'timeline');
    await expectPanel(page, 'sidebar');
  }
}

async function openViewMenu(page: Page) {
  await page.locator(selectors.menu.root('View')).click();
  await expect(page.locator(selectors.menu.action('resetLayout'))).toBeVisible();
}

async function closeMenu(page: Page) {
  await page.locator(selectors.workspace.dockview).click({ position: { x: 2, y: 2 } });
  await expect(page.locator(selectors.menu.action('resetLayout'))).toHaveCount(0);
}

async function clickViewAction(page: Page, actionId: string) {
  await openViewMenu(page);
  const item = page.locator(selectors.menu.action(actionId));
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
  await item.click();
  await expect(item).toHaveCount(0);
}

function sidebar(page: Page): Locator {
  return page.locator(selectors.workspace.panel('sidebar'));
}

async function expectPanel(page: Page, id: PanelId) {
  const panel = page.locator(selectors.workspace.panel(id));
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeVisible();
}

async function expectNoPanel(page: Page, id: PanelId) {
  await expect(page.locator(selectors.workspace.panel(id))).toHaveCount(0);
}

async function expectDrawingDefaults(page: Page) {
  for (const panel of DRAWING_DEFAULT_PANELS) {
    await expectPanel(page, panel);
  }
}

async function expectSceneDefaults(page: Page) {
  await expectDrawingDefaults(page);
  await expectPanel(page, 'timeline');
}

async function readLayoutRaw(page: Page, key: LayoutKey): Promise<string | null> {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function copyLayoutStorage(page: Page, from: LayoutKey, to: LayoutKey) {
  await page.evaluate(
    ({ fromKey, toKey }) => {
      const value = localStorage.getItem(fromKey);
      if (value === null) throw new Error(`Missing source layout: ${fromKey}`);
      localStorage.setItem(toKey, value);
    },
    { fromKey: from, toKey: to },
  );
}

async function waitSavedPanelIds(
  page: Page,
  key: LayoutKey,
  predicate: (ids: Set<PanelId>) => boolean,
): Promise<{ raw: string; ids: Set<PanelId> }> {
  await expect
    .poll(async () => {
      const raw = await readLayoutRaw(page, key);
      if (!raw) return { ok: false, raw: '', ids: [] as PanelId[] };
      const ids = parseSavedPanelIds(raw);
      if (!ids) return { ok: false, raw, ids: [] as PanelId[] };
      return { ok: predicate(ids), raw, ids: [...ids].sort() };
    })
    .toMatchObject({ ok: true });

  const raw = (await readLayoutRaw(page, key))!;
  return { raw, ids: parseSavedPanelIds(raw) ?? new Set<PanelId>() };
}

async function waitForMissingOrPanelIds(
  page: Page,
  key: LayoutKey,
  predicate: (ids: Set<PanelId>) => boolean,
) {
  await expect
    .poll(async () => {
      const raw = await readLayoutRaw(page, key);
      if (!raw) return true;
      const ids = parseSavedPanelIds(raw);
      return ids ? predicate(ids) : false;
    })
    .toBe(true);
}

function parseSavedPanelIds(raw: string): Set<PanelId> | undefined {
  try {
    return collectLayoutPanelIds(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function collectLayoutPanelIds(value: unknown): Set<PanelId> {
  const ids = new Set<PanelId>();
  collectWorkspacePanelIds(value, ids);
  return ids;
}

function collectWorkspacePanelIds(value: unknown, out: Set<PanelId>): void {
  if (typeof value === 'string') {
    if (isPanelId(value)) out.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectWorkspacePanelIds(item, out);
    return;
  }

  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'panels') collectWorkspacePanelRecord(child, out);
    else if (['id', 'panelIds', 'views', 'activeView'].includes(key)) {
      collectWorkspacePanelIds(child, out);
    }
  }
}

function collectWorkspacePanelRecord(value: unknown, out: Set<PanelId>): void {
  if (value === null || typeof value !== 'object') {
    collectWorkspacePanelIds(value, out);
    return;
  }

  for (const [panelId, panel] of Object.entries(value)) {
    if (isPanelId(panelId)) out.add(panelId);
    collectWorkspacePanelIds(panel, out);
  }
}

function isPanelId(value: string): value is PanelId {
  return WORKSPACE_PANEL_IDS.has(value as PanelId);
}

function hasAll(ids: Set<PanelId>, expected: PanelId[]) {
  return expected.every((panel) => ids.has(panel));
}
