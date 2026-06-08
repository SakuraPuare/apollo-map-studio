import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { selectors } from './helpers/selectors';

test.describe('ToolStrip and StatusBar interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('ams.webLicense.v1', JSON.stringify({ trialStart: Date.now() }));
      } catch {
        /* about:blank can deny storage before the app origin is active. */
      }
    });
    await page.goto('/');
    await expectWorkspaceReady(page);
    await expect(page.getByTestId('license-status')).toContainText(/trial|activated/i);
  });

  test('switches drawing/scene mode and reflects toolbar/status state', async ({ page }) => {
    const drawingMode = page.locator(selectors.mode.button('drawing'));
    const sceneMode = page.locator(selectors.mode.button('scene'));

    await expect(drawingMode).toHaveAttribute('aria-pressed', 'true');
    await expect(sceneMode).toHaveAttribute('aria-pressed', 'false');
    await expectStatusField(page, 'app-mode', '绘图');
    await expect(page.locator(selectors.toolbar.action('defaultMode'))).toBeVisible();
    await expect(page.locator(selectors.toolbar.sceneTool('placeVehicle'))).toHaveCount(0);

    await sceneMode.click();

    await expect(sceneMode).toHaveAttribute('aria-pressed', 'true');
    await expect(drawingMode).toHaveAttribute('aria-pressed', 'false');
    await expectStatusField(page, 'app-mode', '场景');
    await expectStatusField(page, 'editor-mode', 'Scene');
    await expect(page.locator(selectors.toolbar.sceneTool('placeVehicle'))).toBeVisible();
    await expect(page.locator(selectors.toolbar.action('defaultMode'))).toHaveCount(0);

    await drawingMode.click();

    await expect(drawingMode).toHaveAttribute('aria-pressed', 'true');
    await expectStatusField(page, 'app-mode', '绘图');
    await expect(page.locator(selectors.toolbar.action('defaultMode'))).toBeVisible();
    await expect(page.locator(selectors.toolbar.sceneTool('placeVehicle'))).toHaveCount(0);
  });

  test('tracks drawing tool active state and status mode/entity count', async ({ page }) => {
    await page.locator(selectors.toolbar.element('lane')).click();

    const bezier = page.locator(selectors.toolbar.drawTool('lane', 'drawBezier'));
    const arc = page.locator(selectors.toolbar.drawTool('lane', 'drawArc'));

    await expect(bezier).toBeVisible();
    await expect(arc).toBeVisible();
    await expect(bezier).toHaveAttribute('aria-pressed', 'true');
    await expect(arc).toHaveAttribute('aria-pressed', 'false');
    await expectStatusField(page, 'editor-mode', 'Draw: Bezier');
    await expectStatusField(page, 'entity-count', '0');

    await page.getByTestId('activity-layers').click();
    const layerTree = page.getByTestId('layer-tree');
    await expect(layerTree).toBeVisible();
    await layerTree.getByRole('button', { name: /^Road$/ }).click();
    await expectStatusField(page, 'entity-count', '1');

    await arc.click();

    await expect(arc).toHaveAttribute('aria-pressed', 'true');
    await expect(bezier).toHaveAttribute('aria-pressed', 'false');
    await expectStatusField(page, 'editor-mode', 'Draw: Arc');

    await page.locator(selectors.mode.button('scene')).click();

    await expectStatusField(page, 'app-mode', '场景');
    await expectStatusField(page, 'editor-mode', 'Scene');
    await expect(page.locator(selectors.toolbar.sceneTool('placeVehicle'))).toBeVisible();
    await expect(page.locator(selectors.toolbar.drawTool('lane', 'drawArc'))).toHaveCount(0);
  });

  test('toggles grid and snap from toolbar and updates StatusBar', async ({ page }) => {
    const gridButton = page.locator(selectors.toolbar.tool('Toggle Grid'));
    const snapButton = page.locator(selectors.toolbar.tool('Toggle Snap'));
    const gridStatus = page.locator(selectors.status.toggle('grid'));
    const snapStatus = page.locator(selectors.status.toggle('snap'));

    await expect(gridButton).toHaveAttribute('aria-pressed', 'true');
    await expect(gridStatus).toHaveAttribute('data-enabled', 'true');
    await expect(snapButton).toHaveAttribute('aria-pressed', 'false');
    await expect(snapStatus).toHaveAttribute('data-enabled', 'false');

    await gridButton.click();
    await snapButton.click();

    await expect(gridButton).toHaveAttribute('aria-pressed', 'false');
    await expect(gridStatus).toHaveAttribute('data-enabled', 'false');
    await expect(gridStatus).toHaveAttribute('aria-label', 'Grid disabled');
    await expect(snapButton).toHaveAttribute('aria-pressed', 'true');
    await expect(snapStatus).toHaveAttribute('data-enabled', 'true');
    await expect(snapStatus).toHaveAttribute('aria-label', 'Snap enabled');
  });

  test('opens command palette from the toolbar button', async ({ page }) => {
    const button = page.locator(selectors.toolbar.commandPalette);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');

    await button.click();

    await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible();
  });
});

async function expectWorkspaceReady(page: Page): Promise<void> {
  await expect(page.locator(selectors.workspace.layout)).toBeVisible();
  await expect(page.locator(selectors.workspace.main)).toBeVisible();
  await expect(page.locator(selectors.workspace.dockview)).toBeVisible();
  await expect(page.locator(selectors.status.bar)).toBeVisible();
}

async function expectStatusField(
  page: Page,
  field: Parameters<typeof selectors.status.field>[0],
  value: string | RegExp,
): Promise<void> {
  await expect(page.locator(selectors.status.field(field))).toHaveText(value);
}
