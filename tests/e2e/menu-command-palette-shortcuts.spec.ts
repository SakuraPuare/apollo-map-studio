import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';
import { readMockState } from './helpers/mocks';
import { selectors } from './helpers/selectors';

const GRID_KEY = 'apollo-map-studio:gridEnabled';
const SNAP_KEY = 'apollo-map-studio:snapEnabled';
const DRAWING_LAYOUT_KEY = 'apollo-map-studio:layout:drawing';
const SCENE_LAYOUT_KEY = 'apollo-map-studio:layout:scene';
const STALE_LAYOUT = '{"stale":true}';

test.describe('menubar, command palette, and shortcuts', () => {
  test.beforeEach(async ({ ams, page }) => {
    await page.addInitScript(
      ({ gridKey, snapKey }) => {
        try {
          localStorage.setItem(gridKey, 'true');
          localStorage.setItem(snapKey, 'false');
        } catch {
          /* ignore inaccessible bootstrap documents */
        }
      },
      { gridKey: GRID_KEY, snapKey: SNAP_KEY },
    );

    await ams.gotoWorkspace();
    await expect(page.locator(selectors.status.field('app-mode'))).toHaveText('绘图');
    await expectDefaultDrawingPanels(page);
    await expectGridSnapState(page, { grid: true, snap: false });
  });

  test('opens and executes File, Edit, View, and About menu actions', async ({ page }) => {
    await openMenu(page, 'File', 'importApollo');
    await expectMenuActions(page, [
      'importApollo',
      'exportApolloBin',
      'exportApolloText',
      'settings',
    ]);

    await clickMenuAction(page, 'importApollo');
    await expect
      .poll(async () => (await readMockState(page)).pickerRequests)
      .toEqual([
        {
          accept: '.bin,.txt,.pb.txt,application/octet-stream,text/plain',
          multiple: false,
          names: [],
        },
      ]);

    await openMenu(page, 'File', 'settings');
    await clickMenuAction(page, 'settings');
    const settings = await expectSettingsDialog(page);
    await settings.getByRole('button', { name: 'Close settings' }).click();
    await expectSettingsClosed(page);

    await openMenu(page, 'Edit', 'undo');
    await expectMenuActions(page, [
      'undo',
      'redo',
      'copySelection',
      'pasteSelection',
      'delete',
      'connectLanes',
      'boundaryBrush',
    ]);

    await openMenu(page, 'Edit', 'connectLanes');
    await clickMenuAction(page, 'connectLanes');
    await expect(page.getByRole('button', { name: 'Connect Lanes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await openMenu(page, 'Edit', 'boundaryBrush');
    await clickMenuAction(page, 'boundaryBrush');
    await expect(page.getByRole('button', { name: 'Boundary Brush' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await openMenu(page, 'View', 'resetLayout');
    await expectMenuActions(page, [
      'resetLayout',
      'view:mapEditor',
      'view:outline',
      'view:layers',
      'view:search',
      'view:inspector',
      'view:toolbox',
      'toggleGrid',
      'toggleSnap',
    ]);

    await clickMenuAction(page, 'toggleGrid');
    await expect(page.getByRole('button', { name: 'Toggle Grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expectLocalStorage(page, GRID_KEY, 'false');

    await openMenu(page, 'View', 'toggleSnap');
    await clickMenuAction(page, 'toggleSnap');
    await expect(page.getByRole('button', { name: 'Toggle Snap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectLocalStorage(page, SNAP_KEY, 'true');

    await openMenu(page, 'View', 'view:layers');
    await clickMenuAction(page, 'view:layers');
    await expect(page.getByTestId('layer-tree')).toBeVisible();
    await openMenu(page, 'View', 'view:outline');
    await clickMenuAction(page, 'view:outline');
    await expectSidebarText(page, '当前地图还没有实体。');
    await openMenu(page, 'View', 'view:search');
    await clickMenuAction(page, 'view:search');
    await expect(searchBox(page)).toBeVisible();

    await openMenu(page, 'View', 'view:mapEditor');
    await clickMenuAction(page, 'view:mapEditor');
    await expect(expectPanel(page, 'map')).toBeHidden();
    await openMenu(page, 'View', 'view:mapEditor');
    await clickMenuAction(page, 'view:mapEditor');
    await expect(expectPanel(page, 'map')).toBeVisible();

    await openMenu(page, 'View', 'view:inspector');
    await clickMenuAction(page, 'view:inspector');
    await expect(expectPanel(page, 'inspector')).toBeHidden();
    await openMenu(page, 'View', 'view:toolbox');
    await clickMenuAction(page, 'view:toolbox');
    await expect(expectPanel(page, 'toolbox')).toBeHidden();
    await openMenu(page, 'View', 'resetLayout');
    await clickMenuAction(page, 'resetLayout');
    await expectDefaultDrawingPanels(page);

    await switchToSceneMode(page);
    await openMenu(page, 'View', 'resetLayout');
    await expectMenuActions(page, [
      'resetLayout',
      'view:mapEditor',
      'view:outline',
      'view:layers',
      'view:search',
      'view:inspector',
      'view:timeline',
      'view:toolbox',
      'view:scenarios',
      'toggleGrid',
      'toggleSnap',
    ]);
    await clickMenuAction(page, 'view:timeline');
    await expect(expectPanel(page, 'timeline')).toBeHidden();
    await openMenu(page, 'View', 'view:scenarios');
    await clickMenuAction(page, 'view:scenarios');
    await expect(page.getByRole('combobox', { name: '新建场景格式' })).toBeVisible();

    await openMenu(page, 'About', 'about');
    await expectMenuActions(page, ['about', 'openHelp']);
    await clickMenuAction(page, 'about');
    await expectAboutDialog(page);
    const aboutDialog = page.getByRole('dialog', { name: 'Apollo Map Studio' });
    await aboutDialog.locator('footer').getByRole('button', { name: 'Close' }).click();
    await expect(aboutDialog).toHaveCount(0);

    await installHelpOpenRecorder(page);
    const openHelpCallCount = await countBridgeCalls(page, 'openHelp');
    await openMenu(page, 'About', 'openHelp');
    await clickMenuAction(page, 'openHelp');
    await expectHelpOpened(page, openHelpCallCount);
  });

  test('searches and executes Command Palette actions', async ({ page }) => {
    await runCommand(page, 'settings', /^Settings\b/);
    const settings = await expectSettingsDialog(page);
    await settings.getByRole('button', { name: 'Close settings' }).click();

    await runCommand(page, 'inspector', /^Inspector\b/);
    await expect(expectPanel(page, 'inspector')).toBeHidden();
    await runCommand(page, 'toolbox', /^Toolbox\b/);
    await expect(expectPanel(page, 'toolbox')).toBeHidden();
    await seedLayoutStorage(page, DRAWING_LAYOUT_KEY);
    await runCommand(page, 'reset layout', /^Reset Layout\b/);
    await expectDefaultDrawingPanels(page);
    await expectSavedLayoutPanels(page, DRAWING_LAYOUT_KEY, [
      'inspector',
      'map',
      'sidebar',
      'toolbox',
    ]);

    await expectPaletteCheckmark(page, 'toggle grid', /^Toggle Grid\b/, true);
    await runCommand(page, 'toggle grid', /^Toggle Grid\b/);
    await expect(page.getByRole('button', { name: 'Toggle Grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expectLocalStorage(page, GRID_KEY, 'false');
    await expectPaletteCheckmark(page, 'toggle grid', /^Toggle Grid\b/, false);
    await runCommand(page, 'toggle grid', /^Toggle Grid\b/);
    await expect(page.getByRole('button', { name: 'Toggle Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectLocalStorage(page, GRID_KEY, 'true');
    await expectPaletteCheckmark(page, 'toggle grid', /^Toggle Grid\b/, true);

    await expectPaletteCheckmark(page, 'toggle snap', /^Toggle Snap\b/, false);
    await runCommand(page, 'toggle snap', /^Toggle Snap\b/);
    await expect(page.getByRole('button', { name: 'Toggle Snap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectLocalStorage(page, SNAP_KEY, 'true');
    await expectPaletteCheckmark(page, 'toggle snap', /^Toggle Snap\b/, true);
    await runCommand(page, 'toggle snap', /^Toggle Snap\b/);
    await expect(page.getByRole('button', { name: 'Toggle Snap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expectLocalStorage(page, SNAP_KEY, 'false');
    await expectPaletteCheckmark(page, 'toggle snap', /^Toggle Snap\b/, false);

    await runCommand(page, 'search', /^Search\b/);
    await expect(searchBox(page)).toBeVisible();
    await runCommand(page, 'layers', /^Layers\b/);
    await expect(page.getByTestId('layer-tree')).toBeVisible();
    await runCommand(page, 'outline', /^Outline\b/);
    await expectSidebarText(page, '当前地图还没有实体。');
    await runCommand(page, 'outline', /^Outline\b/);
    await expect(expectPanel(page, 'sidebar')).toBeHidden();

    await runCommand(page, 'map editor', /^Map Editor\b/);
    await expect(expectPanel(page, 'map')).toBeHidden();
    await runCommand(page, 'map editor', /^Map Editor\b/);
    await expect(expectPanel(page, 'map')).toBeVisible();

    await runCommand(page, 'toolbox', /^Toolbox\b/);
    await expect(expectPanel(page, 'toolbox')).toBeHidden();
    await runCommand(page, 'toolbox', /^Toolbox\b/);
    await expect(expectPanel(page, 'toolbox')).toBeVisible();

    await switchToSceneMode(page);
    await seedLayoutStorage(page, SCENE_LAYOUT_KEY);
    await runCommand(page, 'reset layout', /^Reset Layout\b/);
    await expectDefaultScenePanels(page);
    await expectSavedLayoutPanels(page, SCENE_LAYOUT_KEY, [
      'inspector',
      'map',
      'sidebar',
      'timeline',
      'toolbox',
    ]);
    await runCommand(page, 'timeline', /^Timeline\b/);
    await expect(expectPanel(page, 'timeline')).toBeHidden();
    await runCommand(page, 'timeline', /^Timeline\b/);
    await expect(expectPanel(page, 'timeline')).toBeVisible();
    await runCommand(page, 'scenarios', /^Scenarios\b/);
    await expect(page.getByRole('combobox', { name: '新建场景格式' })).toBeVisible();
    await runCommand(page, 'scenarios', /^Scenarios\b/);
    await expect(expectPanel(page, 'sidebar')).toBeHidden();
  });

  test('opens Command Palette and Settings with Ctrl and Meta shortcuts', async ({ page }) => {
    await focusWorkspace(page);
    await page.keyboard.press('Control+K');
    await expectCommandPaletteVisible(page);
    await closeCommandPalette(page);

    await focusWorkspace(page);
    await page.keyboard.press('Meta+K');
    await expectCommandPaletteVisible(page);
    await closeCommandPalette(page);

    await focusWorkspace(page);
    await page.keyboard.press('Control+,');
    await expectSettingsDialog(page);
    await closeSettings(page);

    await focusWorkspace(page);
    await page.keyboard.press('Meta+,');
    await expectSettingsDialog(page);
    await closeSettings(page);
  });

  test('keeps global Command Palette shortcuts active while editing text', async ({ page }) => {
    await runCommand(page, 'search', /^Search\b/);
    await searchBox(page).fill('lane');
    await expect(searchBox(page)).toBeFocused();

    await page.keyboard.press('Control+K');
    await expectCommandPaletteVisible(page);
    await commandInput(page).focus();
    await expect(commandInput(page)).toBeFocused();
    await closeCommandPalette(page);

    await searchBox(page).focus();
    await page.keyboard.press('Meta+K');
    await expectCommandPaletteVisible(page);
    await commandInput(page).focus();
    await expect(commandInput(page)).toBeFocused();
    await closeCommandPalette(page);
  });

  test('does not open non-global Settings shortcuts from editing controls', async ({ page }) => {
    await runCommand(page, 'search', /^Search\b/);
    await searchBox(page).fill('lane');
    await expect(searchBox(page)).toBeFocused();
    await page.keyboard.press('Control+,');
    await expectSettingsClosed(page);
    await expect(searchBox(page)).toBeFocused();
    await page.keyboard.press('Meta+,');
    await expectSettingsClosed(page);
    await expect(searchBox(page)).toBeFocused();

    await switchToSceneMode(page);
    await runCommand(page, 'scenarios', /^Scenarios\b/);
    const scenarioFormat = page.getByRole('combobox', { name: '新建场景格式' });
    await scenarioFormat.focus();
    await expect(scenarioFormat).toBeFocused();
    await page.keyboard.press('Control+,');
    await expectSettingsClosed(page);
    await expect(scenarioFormat).toBeFocused();
    await page.keyboard.press('Meta+,');
    await expectSettingsClosed(page);
    await expect(scenarioFormat).toBeFocused();
  });
});

async function openMenu(page: Page, label: string, expectedActionId?: string): Promise<void> {
  if (expectedActionId && (await page.locator(selectors.menu.item(expectedActionId)).isVisible())) {
    return;
  }
  await page.getByRole('button', { name: label, exact: true }).click();
  if (expectedActionId)
    await expect(page.locator(selectors.menu.item(expectedActionId))).toBeVisible();
  else await expect(page.locator('[data-action-id]').first()).toBeVisible();
}

async function expectMenuActions(page: Page, actionIds: string[]): Promise<void> {
  for (const actionId of actionIds) {
    await expect(page.locator(selectors.menu.item(actionId))).toBeVisible();
  }

  await expect
    .poll(async () =>
      page
        .locator('[data-action-id]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-action-id')),
        ),
    )
    .toEqual(actionIds);
}

async function clickMenuAction(page: Page, actionId: string): Promise<void> {
  await page.locator(selectors.menu.item(actionId)).click();
}

async function runCommand(page: Page, query: string, optionName: RegExp): Promise<void> {
  await openCommandPalette(page);
  const input = commandInput(page);
  await input.fill(query);
  await page.getByRole('option', { name: optionName }).click();
  await expect(input).toBeHidden();
}

async function openCommandPalette(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Command Palette' }).click();
  await expectCommandPaletteVisible(page);
  await commandInput(page).focus();
  await expect(commandInput(page)).toBeFocused();
}

function commandInput(page: Page): Locator {
  return page.getByPlaceholder('Type a command or search...');
}

async function closeCommandPalette(page: Page): Promise<void> {
  await commandInput(page).focus();
  await page.keyboard.press('Escape');
  await expect(commandInput(page)).toBeHidden();
}

async function expectCommandPaletteVisible(page: Page): Promise<void> {
  await expect(commandInput(page)).toBeVisible();
}

function searchBox(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Search entities by id or type' });
}

async function expectSettingsDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'General' })).toBeVisible();
  await expect(dialog.getByRole('spinbutton', { name: 'History limit' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reset Layout to Default' })).toBeVisible();
  return dialog;
}

async function closeSettings(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: 'Settings' })
    .getByRole('button', { name: 'Close settings' })
    .click();
  await expectSettingsClosed(page);
}

async function expectSettingsClosed(page: Page): Promise<void> {
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
}

async function expectAboutDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Apollo Map Studio' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Version, license, and device information')).toBeVisible();
  await expect(dialog.getByText('License & Activation')).toBeVisible();
  await expect(dialog.getByText('Device code')).toBeVisible();
}

async function installHelpOpenRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    type HelpOpenRecord = { url: string; target?: string; features?: string };
    const targetWindow = window as typeof window & { __amsHelpOpen?: HelpOpenRecord };
    targetWindow.__amsHelpOpen = undefined;
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      targetWindow.__amsHelpOpen = { url: String(url ?? ''), target, features };
      return null;
    }) as typeof window.open;
  });
}

async function countBridgeCalls(page: Page, callName: string): Promise<number> {
  return (await readMockState(page)).bridgeCalls.filter((call) => call === callName).length;
}

async function expectHelpOpened(page: Page, previousBridgeCallCount: number): Promise<void> {
  await expect
    .poll(async () => {
      const bridgeCalls = (await readMockState(page)).bridgeCalls;
      if (bridgeCalls.filter((call) => call === 'openHelp').length > previousBridgeCallCount) {
        return 'bridge';
      }

      const fallback = await page.evaluate(() => {
        type HelpOpenRecord = { url: string; target?: string; features?: string };
        return (window as typeof window & { __amsHelpOpen?: HelpOpenRecord }).__amsHelpOpen ?? null;
      });
      if (
        fallback?.url === './docs/index.html' &&
        fallback.target === '_blank' &&
        fallback.features === 'noopener,noreferrer'
      ) {
        return 'fallback';
      }
      return 'none';
    })
    .toMatch(/^(bridge|fallback)$/);
}

function expectPanel(page: Page, id: string): Locator {
  return page.locator(selectors.workspace.panel(id));
}

async function expectDefaultDrawingPanels(page: Page): Promise<void> {
  await expect(expectPanel(page, 'map')).toBeVisible();
  await expect(expectPanel(page, 'sidebar')).toBeVisible();
  await expect(expectPanel(page, 'inspector')).toBeVisible();
  await expect(expectPanel(page, 'toolbox')).toBeVisible();
  await expect(expectPanel(page, 'timeline')).toHaveCount(0);
}

async function expectDefaultScenePanels(page: Page): Promise<void> {
  await expect(expectPanel(page, 'map')).toBeVisible();
  await expect(expectPanel(page, 'sidebar')).toBeVisible();
  await expect(expectPanel(page, 'inspector')).toBeVisible();
  await expect(expectPanel(page, 'toolbox')).toBeVisible();
  await expect(expectPanel(page, 'timeline')).toBeVisible();
}

async function expectSidebarText(page: Page, text: string): Promise<void> {
  await expect(expectPanel(page, 'sidebar')).toContainText(text);
}

async function expectLocalStorage(page: Page, key: string, value: string | null): Promise<void> {
  await expect
    .poll(() => page.evaluate((storageKey) => localStorage.getItem(storageKey), key))
    .toBe(value);
}

async function seedLayoutStorage(page: Page, key: string): Promise<void> {
  await page.evaluate(({ storageKey, value }) => localStorage.setItem(storageKey, value), {
    storageKey: key,
    value: STALE_LAYOUT,
  });
  await expectLocalStorage(page, key, STALE_LAYOUT);
}

async function expectSavedLayoutPanels(
  page: Page,
  key: string,
  expectedPanelIds: string[],
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, staleLayout }) => {
          const saved = localStorage.getItem(storageKey);
          if (!saved) return ['__missing__'];
          if (saved === staleLayout) return ['__stale__'];
          try {
            const parsed = JSON.parse(saved) as { panels?: Record<string, unknown> };
            return Object.keys(parsed.panels ?? {}).sort();
          } catch {
            return ['__invalid__'];
          }
        },
        { storageKey: key, staleLayout: STALE_LAYOUT },
      ),
    )
    .toEqual([...expectedPanelIds].sort());
}

async function expectGridSnapState(
  page: Page,
  expected: { grid: boolean; snap: boolean },
): Promise<void> {
  await expect(page.getByRole('button', { name: 'Toggle Grid' })).toHaveAttribute(
    'aria-pressed',
    String(expected.grid),
  );
  await expect(page.getByRole('button', { name: 'Toggle Snap' })).toHaveAttribute(
    'aria-pressed',
    String(expected.snap),
  );
  await expectLocalStorage(page, GRID_KEY, String(expected.grid));
  await expectLocalStorage(page, SNAP_KEY, String(expected.snap));
}

async function switchToSceneMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: '场景' }).click();
  await expect(page.locator(selectors.status.field('app-mode'))).toHaveText('场景');
  await expectDefaultScenePanels(page);
}

async function expectPaletteCheckmark(
  page: Page,
  query: string,
  optionName: RegExp,
  checked: boolean,
): Promise<void> {
  await openCommandPalette(page);
  await commandInput(page).fill(query);
  const option = page.getByRole('option', { name: optionName });
  await expect(option).toBeVisible();
  if (checked) await expect(option).toContainText('✓');
  else await expect(option).not.toContainText('✓');
  await closeCommandPalette(page);
}

async function focusWorkspace(page: Page): Promise<void> {
  await page.locator(selectors.workspace.layout).click({ position: { x: 4, y: 4 } });
  await expect(page.locator(selectors.workspace.layout)).toBeVisible();
}
