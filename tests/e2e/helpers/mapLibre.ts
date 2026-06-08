import { expect, type Locator, type Page } from '@playwright/test';
import { selectors } from './selectors';

export function mapCanvas(page: Page): Locator {
  return page.locator(selectors.map.canvas).first();
}

export async function waitForMapLibreCanvas(page: Page): Promise<Locator> {
  const canvas = mapCanvas(page);
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  await page.waitForFunction(
    (selector) => {
      const node = document.querySelector<HTMLCanvasElement>(selector);
      if (!node || node.dataset.mapReady !== 'true') return false;

      const first = node.getBoundingClientRect();
      if (first.width <= 0 || first.height <= 0 || node.width <= 0 || node.height <= 0) {
        return false;
      }

      return new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const second = node.getBoundingClientRect();
            resolve(
              second.x === first.x &&
                second.y === first.y &&
                second.width === first.width &&
                second.height === first.height &&
                node.width > 0 &&
                node.height > 0,
            );
          });
        });
      });
    },
    selectors.map.canvas,
    { timeout: 20_000 },
  );

  return canvas;
}
