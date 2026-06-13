import { expect, type Locator, type Page } from '@playwright/test';
import { selectors } from './selectors';

const MAP_BACKGROUND = [26, 26, 46] as const;
const MIN_CANVAS_SIZE = 100;

interface MapLibreCanvasOptions {
  requireWebGl?: boolean;
}

export function mapCanvas(page: Page): Locator {
  return page.locator(selectors.map.canvas).first();
}

export async function waitForMapLibreCanvas(
  page: Page,
  options: MapLibreCanvasOptions = {},
): Promise<Locator> {
  const canvas = mapCanvas(page);
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  await page.waitForFunction(
    ({ selector, requireWebGl, minSize }) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node || node.dataset.mapReady !== 'true') return false;

      const first = node.getBoundingClientRect();
      const backingWidth = node instanceof HTMLCanvasElement ? node.width : first.width;
      const backingHeight = node instanceof HTMLCanvasElement ? node.height : first.height;

      if (
        first.width <= minSize ||
        first.height <= minSize ||
        backingWidth <= minSize ||
        backingHeight <= minSize
      ) {
        return false;
      }

      return new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const second = node.getBoundingClientRect();
            const isStable =
              second.x === first.x &&
              second.y === first.y &&
              second.width === first.width &&
              second.height === first.height;

            if (!isStable) {
              resolve(false);
              return;
            }

            if (!requireWebGl) {
              resolve(true);
              return;
            }

            if (!(node instanceof HTMLCanvasElement)) {
              resolve(false);
              return;
            }

            const gl = node.getContext('webgl2') ?? node.getContext('webgl');

            resolve(
              node.width > minSize &&
                node.height > minSize &&
                Boolean(
                  gl &&
                  !gl.isContextLost() &&
                  gl.drawingBufferWidth > minSize &&
                  gl.drawingBufferHeight > minSize,
                ),
            );
          });
        });
      });
    },
    {
      selector: selectors.map.canvas,
      requireWebGl: options.requireWebGl ?? false,
      minSize: MIN_CANVAS_SIZE,
    },
    { timeout: 20_000 },
  );

  return canvas;
}

export async function expectMapLibreCanvasPainted(page: Page, canvas: Locator): Promise<void> {
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
