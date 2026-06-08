import { expect, type Locator, type Page, test } from '@playwright/test';

type Point = { x: number; y: number };

const EMPTY_TEXT = 'No entities yet. Start drawing!';
const APP_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PLAYWRIGHT_APP_URL ??
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  `http://127.0.0.1:${
    process.env.PLAYWRIGHT_PREVIEW_PORT ??
    process.env.PLAYWRIGHT_DEV_SERVER_PORT ??
    process.env.E2E_PORT ??
    4173
  }`;

test.setTimeout(90_000);
test.use({
  viewport: { width: 1280, height: 800 },
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
});

test.describe('LayerTree E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const now = Date.now();
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'ams.webLicense.v1',
        JSON.stringify({
          trialStart: now,
          activation: {
            license: { id: 'e2e', name: 'E2E', issued: now, expires: 0 },
            expires: 0,
            activatedAt: now,
          },
        }),
      );
      localStorage.setItem('apollo-map-studio:mapCenterLng', '116.4');
      localStorage.setItem('apollo-map-studio:mapCenterLat', '39.9');
      localStorage.setItem('apollo-map-studio:mapZoom', '18');
      localStorage.setItem('apollo-map-studio:snapEnabled', 'false');
      localStorage.setItem('apollo-map-studio:gridEnabled', 'false');
      localStorage.setItem('apollo-map-studio:laneHalfWidth', '1.75');
      localStorage.setItem('apollo-map-studio:laneSpeedLimit', String(60 / 3.6));
      localStorage.setItem('apollo-map-studio:laneBoundaryType', 'DOTTED_WHITE');
    });

    await page.goto(APP_URL);
    await expect(page.getByTestId('workspace-layout')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-map')).toBeVisible();
    await expect(page.getByTestId('status-app-mode')).toHaveText('绘图');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
    await expect(page.getByTestId('status-entity-count')).toHaveText('0');
    await expect(page.getByTestId('license-status')).toHaveText('activated');
    await expect(page.getByTestId('inspector-panel')).toContainText(
      'Select an entity to view properties',
    );
    await waitForCanvasReady(page);
  });

  test('renders the empty state and create actions', async ({ page }) => {
    const tree = await openLayerTree(page);

    await expect(tree.getByText(EMPTY_TEXT)).toBeVisible();
    await expect(tree.getByRole('button', { name: /^Road$/ })).toBeEnabled();
    await expect(tree.getByRole('button', { name: /^RSU$/ })).toBeEnabled();
    await expect(tree.getByRole('tree')).toHaveCount(0);
  });

  test('updates after drawing, groups by road and junction, syncs selection, toggles layers, and deletes', async ({
    page,
  }) => {
    const tree = await openLayerTree(page);
    const canvas = await CanvasClickHelper.create(page);

    await drawLane(page, canvas);
    await expectEntityCountAtLeast(page, 1);
    await expect(tree.getByRole('tree')).toBeVisible();
    await expect(groupNode(tree, 'lane')).toContainText('1');
    await expand(groupNode(tree, 'lane'));
    await expect(entityNode(tree, 'lane_1')).toBeVisible();

    await drawJunction(page, canvas);
    await expectEntityCountAtLeast(page, 2);
    await expect(groupNode(tree, 'junction')).toContainText('1');
    await expand(groupNode(tree, 'junction'));
    await expect(entityNode(tree, 'J_1')).toBeVisible();
    await expect(groupNode(tree, 'overlap')).toHaveCount(0);

    await createRoad(tree);
    await expectEntityCountAtLeast(page, 3);
    await expect(groupNode(tree, 'road')).toContainText('1');

    await createRSU(tree);
    await expectEntityCountAtLeast(page, 4);
    await expect(groupNode(tree, 'rsu')).toContainText('1');

    await dragEntityToRoadSection(page, tree, 'lane_1', 'road_1');
    await expand(groupNode(tree, 'road'));
    await expand(entityNode(tree, 'road_1'));
    await expand(sectionNode(tree, 'road_1'));
    await expectDirectChild(sectionNode(tree, 'road_1'), 'lane_1');
    await expect(entityNode(tree, 'lane_1')).toBeVisible();
    await expect(groupNode(tree, 'lane')).toHaveCount(0);

    await toggleRoadVisibilityAndLock(tree);

    await collapse(entityNode(tree, 'road_1'));
    await dragEntityToJunction(page, tree, 'road_1', 'J_1');
    await dragEntityToJunction(page, tree, 'RSU_1', 'J_1');
    await expand(groupNode(tree, 'junction'));
    await expand(entityNode(tree, 'J_1'));
    await expectDirectChild(entityNode(tree, 'J_1'), 'road_1');
    await expectDirectChild(entityNode(tree, 'J_1'), 'RSU_1');
    await expect(entityNode(tree, 'road_1')).toBeVisible();
    await expect(entityNode(tree, 'RSU_1')).toBeVisible();
    await expand(entityNode(tree, 'road_1'));
    await expand(sectionNode(tree, 'road_1'));
    await expectDirectChild(sectionNode(tree, 'road_1'), 'lane_1');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
    const unselectedHotPixels = await countHotSelectionPixels(page);

    await entityNode(tree, 'lane_1').click();
    await expect(outerAriaRow(entityNode(tree, 'lane_1'))).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
    await expect(page.getByTestId('inspector-title')).toHaveText('Lane');
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'lane_1');
    await page.waitForTimeout(650);
    await expect
      .poll(async () => countHotSelectionPixels(page))
      .toBeGreaterThan(unselectedHotPixels + 25);

    await deleteEntity(tree, 'lane_1');
    await deleteEntity(tree, 'RSU_1');
    await deleteEntity(tree, 'road_1');
    await deleteEntity(tree, 'J_1');
    await waitForLayerTreeEmpty(page, tree);
  });
});

async function openLayerTree(page: Page): Promise<Locator> {
  const sidebar = page.getByTestId('workspace-panel-sidebar');
  const tree = page.getByTestId('layer-tree');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await expect(page.getByTestId('activity-layers')).toBeEnabled();
    await page.getByTestId('activity-layers').click();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Loading sidebar...')).toHaveCount(0);
    await expect(sidebar.getByText('Loading layers...')).toHaveCount(0);
    if (await appears(tree)) return tree;
  }

  await expect(tree).toBeVisible();
  return tree;
}

async function drawLane(page: Page, canvas: CanvasClickHelper): Promise<void> {
  await page.getByTestId('element-lane').click();
  await page.getByTestId('draw-tool-lane-drawBezier').click();
  await expect(page.getByTestId('draw-tool-lane-drawBezier')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Bezier');

  await canvas.downUp(await canvas.point(0.34, 0.53));
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Bezier');
  await canvas.downUp(await canvas.point(0.66, 0.49));
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Bezier');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
}

async function drawJunction(page: Page, canvas: CanvasClickHelper): Promise<void> {
  await page.getByTestId('element-junction').click();
  await page.getByTestId('draw-tool-junction-drawPolygon').click();
  await expect(page.getByTestId('draw-tool-junction-drawPolygon')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Polygon');

  await canvas.click(await canvas.point(0.72, 0.34));
  await canvas.click(await canvas.point(0.82, 0.34));
  await canvas.click(await canvas.point(0.82, 0.44));
  await canvas.click(await canvas.point(0.72, 0.44));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
}

async function createRoad(tree: Locator): Promise<void> {
  await tree.getByRole('button', { name: /^Road$/ }).click();
  await expand(groupNode(tree, 'road'));
  await expect(entityNode(tree, 'road_1')).toBeVisible();
}

async function createRSU(tree: Locator): Promise<void> {
  await tree.getByRole('button', { name: /^RSU$/ }).click();
  await expand(groupNode(tree, 'rsu'));
  await expect(entityNode(tree, 'RSU_1')).toBeVisible();
}

async function dragEntityToRoadSection(
  page: Page,
  tree: Locator,
  entityId: string,
  roadId: string,
): Promise<void> {
  await expand(groupNode(tree, 'road'));
  await expand(entityNode(tree, roadId));

  const source = entityNode(tree, entityId);
  const targetNode = sectionNode(tree, roadId);
  const target = outerAriaRow(targetNode);
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await dragUntilDirectChild(page, source, target, targetNode, entityId);
  await expand(sectionNode(tree, roadId));
  await expectDirectChild(sectionNode(tree, roadId), entityId);
}

async function dragEntityToJunction(
  page: Page,
  tree: Locator,
  entityId: string,
  junctionId: string,
): Promise<void> {
  await expand(groupNode(tree, 'junction'));

  const source = entityNode(tree, entityId);
  const targetNode = entityNode(tree, junctionId);
  const target = outerAriaRow(targetNode);
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await dragUntilDirectChild(page, source, target, targetNode, entityId);
  await expand(entityNode(tree, junctionId));
  await expectDirectChild(entityNode(tree, junctionId), entityId);
}

async function dragUntilDirectChild(
  page: Page,
  source: Locator,
  target: Locator,
  targetParent: Locator,
  childId: string,
): Promise<void> {
  for (const sourceX of [18, 56, 84, 32]) {
    for (const targetX of [40, 56, 84, 32]) {
      await dragTo(page, source, target, { sourceX, targetX });
      await expand(targetParent);
      if (await becomesDirectChild(targetParent, childId)) return;
    }
  }

  await source.dragTo(target, {
    sourcePosition: { x: 20, y: 13 },
    targetPosition: { x: 40, y: 13 },
    force: true,
  });
  await expand(targetParent);
  if (await becomesDirectChild(targetParent, childId)) return;

  await expectDirectChild(targetParent, childId);
}

async function dragTo(
  page: Page,
  source: Locator,
  target: Locator,
  options: { sourceX: number; targetX: number },
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('LayerTree drag endpoints are not visible');

  const start = {
    x: sourceBox.x + clamp(options.sourceX, 8, sourceBox.width - 8),
    y: sourceBox.y + sourceBox.height / 2,
  };
  const end = {
    x: targetBox.x + clamp(options.targetX, 8, targetBox.width - 8),
    y: targetBox.y + targetBox.height * 0.52,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'left' });

  try {
    await page.mouse.move(start.x + 8, start.y, { steps: 4 });
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
    await page.mouse.move(end.x, end.y, { steps: 16 });
    await page.waitForTimeout(200);
    await page.mouse.move(end.x + 1, end.y, { steps: 2 });
    await page.waitForTimeout(200);
    await page.mouse.up({ button: 'left' });
  } catch (error) {
    await page.mouse.up({ button: 'left' }).catch(() => undefined);
    throw error;
  }
}

async function toggleRoadVisibilityAndLock(tree: Locator): Promise<void> {
  const roads = groupNode(tree, 'road');
  await roads.hover();
  await roads.getByRole('button', { name: 'Hide layer' }).click();
  await expect(roads.getByRole('button', { name: 'Show layer' })).toBeVisible();
  await expect(roads).toHaveClass(/opacity-50/);

  await roads.hover();
  await roads.getByRole('button', { name: 'Show layer' }).click();
  await expect(roads.getByRole('button', { name: 'Hide layer' })).toBeVisible();
  await expect(roads).not.toHaveClass(/opacity-50/);

  await roads.hover();
  await roads.getByRole('button', { name: 'Lock layer' }).click();
  await expect(roads.getByRole('button', { name: 'Unlock layer' })).toBeVisible();
  await expect(tree.getByRole('button', { name: /^Road$/ })).toBeDisabled();

  const road = entityNode(tree, 'road_1');
  await road.hover();
  await expect(road.locator('button[title="Layer is locked"]')).toHaveCount(2);
  await expect(road.locator('button[title="Layer is locked"]').last()).toBeDisabled();

  await roads.hover();
  await roads.getByRole('button', { name: 'Unlock layer' }).click();
  await expect(roads.getByRole('button', { name: 'Lock layer' })).toBeVisible();
  await expect(tree.getByRole('button', { name: /^Road$/ })).toBeEnabled();
}

async function deleteEntity(tree: Locator, entityId: string): Promise<void> {
  const entity = entityNode(tree, entityId);
  await expect(entity).toBeVisible();
  await entity.hover();
  await entity.getByRole('button', { name: 'Delete entity' }).click();
  await expect(entityNode(tree, entityId)).toHaveCount(0);
}

async function waitForLayerTreeEmpty(page: Page, tree: Locator): Promise<void> {
  await expect
    .poll(async () => Number((await page.getByTestId('status-entity-count').textContent()) ?? 0))
    .toBe(0);
  await expect(tree.locator('[data-entity-id]')).toHaveCount(0);
  await expect(tree.getByRole('tree')).toHaveCount(0);
  await expect(tree.getByText(EMPTY_TEXT)).toBeVisible();
}

async function appears(locator: Locator): Promise<boolean> {
  try {
    await expect(locator).toBeVisible({ timeout: 1_500 });
    return true;
  } catch {
    return false;
  }
}

async function expand(node: Locator): Promise<void> {
  await expect(node).toBeVisible();
  const row = outerAriaRow(node);
  if ((await row.getAttribute('aria-expanded')) === 'false') {
    await node.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
  }
}

async function collapse(node: Locator): Promise<void> {
  await expect(node).toBeVisible();
  const row = outerAriaRow(node);
  if ((await row.getAttribute('aria-expanded')) === 'true') {
    await node.click();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
  }
}

async function becomesDirectChild(parent: Locator, childId: string): Promise<boolean> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if ((await directChildState(parent, childId)).attached) return true;
    await parent.page().waitForTimeout(100);
  }
  return false;
}

async function expectDirectChild(parent: Locator, childId: string): Promise<void> {
  await expect.poll(async () => directChildState(parent, childId)).toEqual({ attached: true });
}

async function directChildState(parent: Locator, childId: string): Promise<{ attached: boolean }> {
  const parentRow = outerAriaRow(parent);
  if ((await parentRow.count()) === 0) return { attached: false };

  return parentRow.evaluate((parentNode, childId) => {
    const root = parentNode.closest('[data-testid="layer-tree"]');
    if (!root) return { attached: false };

    const rows = Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"][aria-level]'));
    const parentIndex = rows.indexOf(parentNode as HTMLElement);
    if (parentIndex < 0) return { attached: false };

    const parentLevel = Number(rows[parentIndex]?.getAttribute('aria-level'));
    for (let index = parentIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const level = Number(row.getAttribute('aria-level'));
      if (level <= parentLevel) return { attached: false };
      const entity = row.querySelector<HTMLElement>('[data-entity-id]');
      if (level === parentLevel + 1 && entity?.getAttribute('data-entity-id') === childId) {
        return { attached: true };
      }
    }
    return { attached: false };
  }, childId);
}

function groupNode(tree: Locator, type: string): Locator {
  return tree.getByTestId(`layer-tree-node-group-${type}`);
}

function entityNode(tree: Locator, id: string): Locator {
  return tree.locator(`[data-entity-id="${cssAttr(id)}"]`);
}

function sectionNode(tree: Locator, roadId: string): Locator {
  return tree.locator(
    `[data-testid="${cssAttr(`layer-tree-node-section-section:${roadId}:section_1`)}"]`,
  );
}

function outerAriaRow(inner: Locator): Locator {
  return inner.locator('xpath=ancestor-or-self::*[@role="treeitem" and @aria-level][1]');
}

async function expectEntityCountAtLeast(page: Page, count: number): Promise<void> {
  await expect
    .poll(async () => Number(await page.getByTestId('status-entity-count').textContent()))
    .toBeGreaterThanOrEqual(count);
}

async function waitForCanvasFrame(page: Page): Promise<void> {
  await canvas(page).evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function countHotSelectionPixels(page: Page): Promise<number> {
  await waitForCanvasFrame(page);
  const screenshot = await canvas(page).screenshot();
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;

  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();

    const bitmap = document.createElement('canvas');
    bitmap.width = image.naturalWidth;
    bitmap.height = image.naturalHeight;
    const ctx = bitmap.getContext('2d');
    if (!ctx) throw new Error('Unable to inspect map screenshot pixels');
    ctx.drawImage(image, 0, 0);

    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      if (red > 185 && green < 115 && blue < 115) count += 1;
    }
    return count;
  }, dataUrl);
}

async function waitForCanvasReady(page: Page): Promise<void> {
  await expect(canvas(page)).toBeVisible();
  await page.waitForFunction(
    () => {
      const node = document.querySelector<HTMLCanvasElement>(
        '[data-testid="map-canvas"] canvas.maplibregl-canvas',
      );
      if (!node || node.dataset.mapReady !== 'true') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 300 && rect.height > 300 && node.width > 0 && node.height > 0;
    },
    undefined,
    { timeout: 20_000 },
  );
  await waitForCanvasFrame(page);
}

function canvas(page: Page): Locator {
  return page.getByTestId('map-canvas').locator('canvas.maplibregl-canvas').first();
}

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

class CanvasClickHelper {
  private constructor(private readonly canvas: Locator) {}

  static async create(page: Page): Promise<CanvasClickHelper> {
    await waitForCanvasReady(page);
    return new CanvasClickHelper(canvas(page));
  }

  async point(xRatio: number, yRatio: number, offset: Point = { x: 0, y: 0 }): Promise<Point> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('MapLibre canvas is not visible');
    return {
      x: box.x + box.width * xRatio + offset.x,
      y: box.y + box.height * yRatio + offset.y,
    };
  }

  async downUp(point: Point): Promise<void> {
    const page = this.canvas.page();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();
  }

  async click(point: Point): Promise<void> {
    await this.canvas.page().mouse.click(point.x, point.y);
  }
}
