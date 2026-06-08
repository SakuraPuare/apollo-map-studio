import { expect, type Locator, type Page, test } from '@playwright/test';

type Point = { x: number; y: number };
type RatioPoint = { rx: number; ry: number; dx?: number; dy?: number };

test.describe('Selection and editing', () => {
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
    await expectIdleEmptySelection(page, '0');
    await expect(canvas(page)).toBeVisible();
    await waitForCanvasReady(page);
  });

  test('selects, drags, deletes vertices, deletes selection, cancels, and blank-clicks consistently', async ({
    page,
  }) => {
    const map = new CanvasActions(page);
    const shape = await drawPrimitivePolyline(page, map);
    await expectIdleEmptySelection(page, '1');

    await selectAt(page, map, shape.mid);
    await expectSelectedPolyline(page, 4);

    await page.keyboard.press('Escape');
    await expectIdleEmptySelection(page, '1');

    await selectAt(page, map, shape.mid);
    await expectSelectedPolyline(page, 4);

    await map.click(await map.point({ rx: 0.86, ry: 0.22 }));
    await expectIdleEmptySelection(page, '1');

    await selectAt(page, map, shape.mid);
    await expectSelectedPolyline(page, 4);

    const bodyDelta = { x: 90, y: 56 };
    const movedMid = translate(shape.mid, bodyDelta);
    await map.drag(shape.mid, movedMid, { expectDragging: true });
    await expectSelectedPolyline(page, 4);

    await page.keyboard.press('Escape');
    await expectIdleEmptySelection(page, '1');

    await map.waitForMapFrames();
    await map.click(shape.mid);
    await expectIdleEmptySelection(page, '1');

    await selectAt(page, map, movedMid);
    await expectSelectedPolyline(page, 4);

    const movedVertices = shape.vertices.map((point) => translate(point, bodyDelta));
    const vertexDelta = { x: -42, y: -72 };
    await map.waitForMapFrames();
    await map.drag(movedVertices[1]!, translate(movedVertices[1]!, vertexDelta), {
      expectDragging: true,
    });
    await expectSelectedPolyline(page, 4);

    await page.keyboard.press('Backspace');
    await expectSelectedPolyline(page, 3);

    await page.keyboard.press('Delete');
    await expectIdleEmptySelection(page, '0');
  });
});

async function drawPrimitivePolyline(page: Page, map: CanvasActions) {
  await page.keyboard.press('P');
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Polyline');
  await expect(page.locator('[data-testid^="element-"][aria-pressed="true"]')).toHaveCount(0);

  const vertices = [
    await map.point({ rx: 0.28, ry: 0.64 }),
    await map.point({ rx: 0.42, ry: 0.46 }),
    await map.point({ rx: 0.58, ry: 0.55 }),
    await map.point({ rx: 0.72, ry: 0.34 }),
  ];

  for (const vertex of vertices) await map.click(vertex);
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
  await expect(page.getByTestId('status-entity-count')).toHaveText('1');
  await expect(page.getByTestId('inspector-panel')).toContainText(
    'Select an entity to view properties',
  );

  return {
    vertices,
    mid: midpoint(vertices[1]!, vertices[2]!),
  };
}

async function selectAt(page: Page, map: CanvasActions, point: Point): Promise<void> {
  await map.clickUntil(point, async () => {
    await expectSelectedPolyline(page, 4, 1_000);
  });
}

async function expectSelectedPolyline(
  page: Page,
  vertices: number,
  timeout?: number,
): Promise<void> {
  const options = timeout === undefined ? undefined : { timeout };
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected', options);
  await expect(page.getByTestId('status-entity-count')).toHaveText('1', options);
  await expect(page.getByTestId('inspector-title')).toHaveText('Polyline', options);
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute(
    'title',
    'polyline_1',
    options,
  );
  const inspector = page.getByTestId('inspector-panel');
  await expect(inspector).toContainText('Geometry', options);
  const verticesValue = inspector
    .locator('span', { hasText: /^Vertices$/ })
    .locator('xpath=following-sibling::span[1]');
  await expect(verticesValue).toHaveText(String(vertices), options);
}

async function expectIdleEmptySelection(page: Page, entityCount: string): Promise<void> {
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
  await expect(page.getByTestId('status-entity-count')).toHaveText(entityCount);
  await expect(page.getByTestId('inspector-panel')).toContainText(
    'Select an entity to view properties',
  );
  await expect(page.getByTestId('inspector-title')).toHaveCount(0);
  await expect(page.getByTestId('inspector-entity-id')).toHaveCount(0);
}

async function waitForCanvasReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll<HTMLCanvasElement>(
      '[data-testid="map-canvas"] canvas.maplibregl-canvas',
    );
    if (nodes.length !== 1) return false;
    const node = nodes[0];
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 300 && rect.height > 300 && node.width > 0 && node.height > 0;
  });
}

function canvas(page: Page): Locator {
  return page.getByTestId('map-canvas').locator('canvas.maplibregl-canvas');
}

function midpoint(a: Point, b: Point): Point {
  return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
}

function translate(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y };
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

  async waitForMapFrames(): Promise<void> {
    await this.nextFrames(4);
  }

  async drag(
    from: Point,
    to: Point,
    { steps = 12, expectDragging = false }: { steps?: number; expectDragging?: boolean } = {},
  ): Promise<void> {
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down({ button: 'left' });
    try {
      await this.page.mouse.move(to.x, to.y, { steps });
      if (expectDragging) {
        await expect(this.page.getByTestId('status-editor-mode')).toHaveText('Dragging');
      }
    } finally {
      await this.page.mouse.up({ button: 'left' });
    }
    await this.nextFrames(2);
  }

  async clickUntil(point: Point, assertion: () => Promise<void>, attempts = 5): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.click(point);
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error;
        await this.nextFrames(3);
      }
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
