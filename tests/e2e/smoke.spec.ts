import { expect, test } from './fixtures';

test.describe('web smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('starts the app shell and waits for the MapLibre canvas', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Apollo Map Studio/);
    await expect(page.getByTestId('workspace-layout')).toBeVisible();
    await expect(page.getByTestId('workspace-dockview')).toBeVisible();
    await expect(page.getByTestId('status-bar')).toBeVisible();
    await expect(page.getByTestId('status-app-mode')).toHaveText('绘图');
    await expect(page.getByTestId('status-entity-count')).toHaveText('0');

    const canvas = page.getByTestId('map-canvas').locator('canvas.maplibregl-canvas').first();
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => {
      const node = document.querySelector<HTMLCanvasElement>(
        '[data-testid="map-canvas"] canvas.maplibregl-canvas',
      );
      if (!node) return false;
      const box = node.getBoundingClientRect();
      return box.width > 100 && box.height > 100 && node.width > 0 && node.height > 0;
    });

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.width ?? 0).toBeGreaterThan(100);
    expect(canvasBox?.height ?? 0).toBeGreaterThan(100);
  });
});
