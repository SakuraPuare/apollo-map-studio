import { expect, type Locator, type Page, test } from '@playwright/test';
import { waitForMapLibreCanvas } from './helpers/mapLibre';

type Point = { x: number; y: number };
type RatioPoint = { rx: number; ry: number; dx?: number; dy?: number };

test.describe('history and clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ams.webLicense.v1', JSON.stringify({ trialStart: Date.now() }));
      localStorage.setItem('apollo-map-studio:mapCenterLng', '116.4');
      localStorage.setItem('apollo-map-studio:mapCenterLat', '39.9');
      localStorage.setItem('apollo-map-studio:mapZoom', '18');
      localStorage.setItem('apollo-map-studio:snapEnabled', 'false');
      localStorage.setItem('apollo-map-studio:gridEnabled', 'false');
    });

    await page.goto('/');
    await expect(page.getByTestId('workspace-layout')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-map')).toBeVisible();
    await expect(page.getByTestId('status-app-mode')).toHaveText('绘图');
    await expectIdle(page, '0');
    await waitForMapLibreCanvas(page);
  });

  test('cancels in-progress drawing before undo and redo shortcuts', async ({ page }) => {
    const map = new CanvasActions(page);
    await drawPrimitivePolyline(page, map, [
      await map.point({ rx: 0.26, ry: 0.62 }),
      await map.point({ rx: 0.42, ry: 0.44 }),
      await map.point({ rx: 0.58, ry: 0.55 }),
    ]);
    await expectIdle(page, '1');

    await page.keyboard.press('P');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Polyline');
    await map.click(await map.point({ rx: 0.72, ry: 0.38 }));

    await page.keyboard.press('Control+Z');
    await expectIdle(page, '0');

    await page.keyboard.press('P');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Polyline');
    await map.click(await map.point({ rx: 0.76, ry: 0.42 }));

    await page.keyboard.press('Control+Shift+Z');
    await expectIdle(page, '1');
    await selectPolyline(page, map, 'polyline_1', [
      await map.point({ rx: 0.26, ry: 0.62 }),
      await map.point({ rx: 0.42, ry: 0.44 }),
      await map.point({ rx: 0.58, ry: 0.55 }),
    ]);
  });

  test('copies, pastes, deletes, undoes, and redoes selected geometry', async ({ page }) => {
    const map = new CanvasActions(page);
    const vertices = [
      await map.point({ rx: 0.28, ry: 0.64 }),
      await map.point({ rx: 0.44, ry: 0.46 }),
      await map.point({ rx: 0.62, ry: 0.56 }),
    ];

    await drawPrimitivePolyline(page, map, vertices);
    await selectPolyline(page, map, 'polyline_1', vertices);

    await page.keyboard.press('Control+C');
    await page.keyboard.press('Control+V');
    await expect(page.getByTestId('status-entity-count')).toHaveText('2');
    await expectSelectedPolyline(page, 'polyline_2');

    await page.keyboard.press('Delete');
    await expectIdle(page, '1');

    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-entity-count')).toHaveText('2');

    await selectPolyline(page, map, 'polyline_2', offsetCandidates(vertices));

    await page.keyboard.press('Control+Shift+Z');
    await expectIdle(page, '1');
    await selectPolyline(page, map, 'polyline_1', vertices);
  });
});

function canvas(page: Page): Locator {
  return page.getByTestId('map-canvas').locator('canvas.maplibregl-canvas');
}

async function drawPrimitivePolyline(
  page: Page,
  map: CanvasActions,
  vertices: Point[],
): Promise<void> {
  await page.keyboard.press('P');
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Polyline');

  for (const vertex of vertices) await map.click(vertex);
  await page.keyboard.press('Enter');

  await expectIdle(page, '1');
}

async function selectPolyline(
  page: Page,
  map: CanvasActions,
  expectedId: string,
  points: Point[],
): Promise<void> {
  const candidates = [
    ...points,
    ...points.map((point, index) => midpoint(point, points[index + 1])).filter(isPoint),
  ];

  await map.clickUntil(candidates, async () => {
    await expectSelectedPolyline(page, expectedId, 750);
  });
}

async function expectSelectedPolyline(page: Page, id: string, timeout?: number): Promise<void> {
  const options = timeout === undefined ? undefined : { timeout };
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected', options);
  await expect(page.getByTestId('inspector-title')).toHaveText('Polyline', options);
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', id, options);
}

async function expectIdle(page: Page, entityCount: string): Promise<void> {
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
  await expect(page.getByTestId('status-entity-count')).toHaveText(entityCount);
  await expect(page.getByTestId('inspector-panel')).toContainText(
    'Select an entity to view properties',
  );
}

function offsetCandidates(points: Point[]): Point[] {
  const offsets = [4, 8, 12, 16, 20, 28, 36, 44];
  return offsets.flatMap((offset) =>
    points.map((point) => ({ x: point.x + offset, y: point.y - offset })),
  );
}

function isPoint(value: Point | null): value is Point {
  return value !== null;
}

function midpoint(a: Point | undefined, b: Point | undefined): Point | null {
  if (!a || !b) return null;
  return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
}

class CanvasActions {
  constructor(private readonly page: Page) {}

  async point({ rx, ry, dx = 0, dy = 0 }: RatioPoint): Promise<Point> {
    const box = await canvas(this.page).boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');

    const inset = 12;
    return {
      x: Math.round(clamp(box.x + box.width * rx + dx, box.x + inset, box.x + box.width - inset)),
      y: Math.round(clamp(box.y + box.height * ry + dy, box.y + inset, box.y + box.height - inset)),
    };
  }

  async click(point: Point): Promise<void> {
    await this.page.mouse.click(point.x, point.y, { button: 'left' });
    await this.nextFrames(2);
  }

  async clickUntil(points: Point[], assertion: () => Promise<void>, attempts = 4): Promise<void> {
    let lastError: unknown;
    const candidates = points.flatMap((point) => [
      point,
      { x: point.x, y: point.y - 12 },
      { x: point.x, y: point.y + 12 },
      { x: point.x - 12, y: point.y },
      { x: point.x + 12, y: point.y },
    ]);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      for (const point of candidates) {
        await this.click(point);
        try {
          await assertion();
          return;
        } catch (error) {
          lastError = error;
        }
      }
      await this.nextFrames(3);
    }

    if (lastError instanceof Error) throw lastError;
    await assertion();
  }

  async nextFrames(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await this.page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
