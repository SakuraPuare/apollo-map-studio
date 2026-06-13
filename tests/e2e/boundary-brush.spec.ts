import { expect, type Locator, type Page, test } from '@playwright/test';

type BoundarySide = 'left' | 'right';
type Point = { x: number; y: number };

const APP_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PLAYWRIGHT_APP_URL ??
  `http://127.0.0.1:${
    process.env.PLAYWRIGHT_PREVIEW_PORT ??
    process.env.PLAYWRIGHT_DEV_SERVER_PORT ??
    process.env.E2E_PORT ??
    4173
  }`;
const LANE_ID = 'lane_1';
const BOUNDARY_OFFSET_PX = 12;

test.setTimeout(60_000);

test.describe('Boundary Brush', () => {
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
      localStorage.setItem('apollo-map-studio:laneHalfWidth', '1.75');
      localStorage.setItem('apollo-map-studio:laneSpeedLimit', String(60 / 3.6));
      localStorage.setItem('apollo-map-studio:laneBoundaryType', 'DOTTED_WHITE');
    });

    await installDownloadTextCapture(page);
    await page.goto(APP_URL);
    await expect(page.getByTestId('workspace-layout')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-map')).toBeVisible();
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
    await expect(page.getByTestId('status-entity-count')).toHaveText('0');
    await CanvasHelper.waitForReady(page);
  });

  test('paints lane boundaries, updates Inspector and map state, exits mode, and supports undo', async ({
    page,
  }) => {
    const canvas = new CanvasHelper(page);

    const lanePoints = await drawLane(page, canvas);
    await expectBoundaryValues(page, 'DOTTED_WHITE', 'DOTTED_WHITE');

    const brush = page.getByTestId('action-boundaryBrush');
    await brush.click();
    await expect(brush).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'CURB' })).toBeVisible();

    await page.getByRole('button', { name: 'CURB' }).click();
    await canvas.paintBoundary('left');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
    await expectBoundaryValues(page, 'CURB', 'DOTTED_WHITE');

    await page.getByRole('button', { name: 'DOUBLE_YELLOW' }).click();
    await canvas.paintBoundary('right');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
    await expectBoundaryValues(page, 'CURB', 'DOUBLE_YELLOW');
    await expectExportedLaneBoundaries(page, {
      left: 'CURB',
      right: 'DOUBLE_YELLOW',
    });

    await brush.click();
    await expect(brush).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'DOUBLE_YELLOW' })).toHaveCount(0);

    await canvas.clickBoundary('left');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
    await expectBoundaryValues(page, 'CURB', 'DOUBLE_YELLOW');

    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');

    await selectLane(page, canvas, lanePoints);
    await expectBoundaryValues(page, 'CURB', 'DOTTED_WHITE');
  });
});

async function drawLane(page: Page, canvas: CanvasHelper): Promise<Point[]> {
  await page.getByTestId('element-lane').click();
  await page.getByTestId('draw-tool-lane-drawBezier').click();
  await expect(page.getByTestId('draw-tool-lane-drawBezier')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Bezier');

  const start = await canvas.relativePoint(0.34, 0.5);
  const end = await canvas.relativePoint(0.66, 0.5);
  await canvas.downUp(start);
  await canvas.downUp(end);
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
  await expect(page.getByTestId('status-entity-count')).toHaveText('1');

  const lanePoints = [midpoint(start, end), start, end];
  await selectLane(page, canvas, lanePoints);
  return lanePoints;
}

async function selectLane(page: Page, canvas: CanvasHelper, points: Point[]): Promise<void> {
  const candidates = points.flatMap((point) => [
    point,
    { x: point.x, y: point.y - BOUNDARY_OFFSET_PX },
    { x: point.x, y: point.y + BOUNDARY_OFFSET_PX },
    { x: point.x - BOUNDARY_OFFSET_PX, y: point.y },
    { x: point.x + BOUNDARY_OFFSET_PX, y: point.y },
  ]);

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    for (const point of candidates) {
      await canvas.click(point);
      if (await isLaneSelected(page)) return;
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(250);
  }

  await selectLaneFromLayerTree(page);
}

async function expectBoundaryValues(page: Page, left: string, right: string): Promise<void> {
  const inspector = page.getByTestId('inspector-panel');
  await expect(page.getByTestId('inspector-title')).toHaveText('Lane');
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', LANE_ID);
  await expect(inspector.locator('select[name="leftBoundaryType"]')).toHaveValue(left);
  await expect(inspector.locator('select[name="rightBoundaryType"]')).toHaveValue(right);
}

async function expectExportedLaneBoundaries(
  page: Page,
  expected: { left: string; right: string },
): Promise<void> {
  const previousDownloadCount = await capturedDownloadCount(page);

  await page.getByTestId('menu-file').click();
  await page.getByTestId('menuitem-exportApolloText').click();

  const projectionDialog = page.getByRole('dialog', { name: /Choose Coordinate System/ });
  await expect(projectionDialog).toBeVisible();
  await projectionDialog.getByRole('button', { name: 'Use this projection' }).click();
  await expect(projectionDialog).toBeHidden();

  const text = await readLatestDownloadText(page, previousDownloadCount);
  const laneBlock = findBlockContaining(text, 'lane', `id: "${LANE_ID}"`);
  expect(laneBlock).toBeTruthy();

  const leftBoundary = findFirstBlock(laneBlock ?? '', 'left_boundary');
  const rightBoundary = findFirstBlock(laneBlock ?? '', 'right_boundary');
  expect(leftBoundary).toContain(`types: ${expected.left}`);
  expect(rightBoundary).toContain(`types: ${expected.right}`);
  expect(leftBoundary).not.toContain(`types: ${expected.right}`);
  expect(rightBoundary).not.toContain(`types: ${expected.left}`);
}

async function capturedDownloadCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__boundaryBrushE2E?.downloads.length ?? 0);
}

async function selectLaneFromLayerTree(page: Page): Promise<void> {
  await page.getByTestId('activity-layers').click();
  const tree = page.getByTestId('layer-tree');
  await expect(tree).toBeVisible();

  const row = tree.locator(
    `[data-testid="layer-tree-node-entity-lane"][data-entity-id="${LANE_ID}"]`,
  );
  if (!(await row.isVisible())) {
    await tree.getByTestId('layer-tree-node-group-lane').click();
  }

  await expect(row).toBeVisible();
  await row.click();
  await expectLaneSelected(page);
}

async function expectLaneSelected(page: Page): Promise<void> {
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', LANE_ID);
}

async function isLaneSelected(page: Page): Promise<boolean> {
  try {
    await expectLaneSelected(page);
    return true;
  } catch {
    return false;
  }
}

async function installDownloadTextCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type CapturedDownload = {
      filename: string;
      href: string;
      type: string;
      size: number;
      text?: string;
    };
    const state = { downloads: [] as CapturedDownload[] };
    window.__boundaryBrushE2E = state;

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const blobByUrl = new Map<string, Blob>();
    URL.createObjectURL = (blob: Blob) => {
      const url = originalCreateObjectURL(blob);
      blobByUrl.set(url, blob);
      return url;
    };

    type CreateElement = (
      this: Document,
      tagName: string,
      options?: ElementCreationOptions,
    ) => Element;
    const originalCreateElement = Document.prototype.createElement as CreateElement;
    Document.prototype.createElement = function createElement(
      this: Document,
      tagName: string,
      options?: ElementCreationOptions,
    ) {
      const element = originalCreateElement.call(this, tagName, options);
      if (element instanceof HTMLAnchorElement) {
        const originalClick = element.click.bind(element);
        element.click = () => {
          if (element.download) {
            const blob = blobByUrl.get(element.href);
            const record: CapturedDownload = {
              filename: element.download,
              href: element.href,
              type: blob?.type ?? '',
              size: blob?.size ?? 0,
            };
            state.downloads.push(record);
            void blob?.text().then((text) => {
              record.text = text;
            });
          }
          originalClick();
        };
      }
      return element;
    } as typeof Document.prototype.createElement;
  });
}

async function readLatestDownloadText(page: Page, previousDownloadCount: number): Promise<string> {
  await page.waitForFunction(
    (count) => {
      const downloads = window.__boundaryBrushE2E?.downloads ?? [];
      return downloads.length > count && Boolean(downloads.at(-1)?.text);
    },
    previousDownloadCount,
    { timeout: 10_000 },
  );
  return page.evaluate(() => {
    const downloads = window.__boundaryBrushE2E?.downloads ?? [];
    return downloads[downloads.length - 1]?.text ?? '';
  });
}

function findBlockContaining(text: string, field: string, needle: string): string | null {
  return findBlocks(text, field).find((block) => block.includes(needle)) ?? null;
}

function findFirstBlock(text: string, field: string): string {
  return findBlocks(text, field)[0] ?? '';
}

function findBlocks(text: string, field: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`\\b${field}\\s*\\{`, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const openIndex = text.indexOf('{', match.index);
    let depth = 0;
    for (let index = openIndex; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) {
        blocks.push(text.slice(match.index, index + 1));
        pattern.lastIndex = index + 1;
        break;
      }
    }
  }

  return blocks;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

declare global {
  interface Window {
    __boundaryBrushE2E?: {
      downloads: Array<{
        filename: string;
        href: string;
        type: string;
        size: number;
        text?: string;
      }>;
    };
  }
}

class CanvasHelper {
  constructor(private readonly page: Page) {}

  static async waitForReady(page: Page): Promise<Locator> {
    const canvas = CanvasHelper.canvas(page);
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => {
      const node = document.querySelector<HTMLCanvasElement>(
        '[data-testid="map-canvas"] canvas.maplibregl-canvas',
      );
      if (!node) return false;
      const box = node.getBoundingClientRect();
      return box.width > 300 && box.height > 300 && node.width > 0 && node.height > 0;
    });
    return canvas;
  }

  static canvas(page: Page): Locator {
    return page.getByTestId('map-canvas').locator('canvas.maplibregl-canvas').first();
  }

  async paintBoundary(side: BoundarySide): Promise<void> {
    const start = await this.boundaryPoint(side, 0.47);
    const end = await this.boundaryPoint(side, 0.55);

    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(end.x, end.y, { steps: 4 });
    await this.page.mouse.up();
  }

  async clickBoundary(side: BoundarySide): Promise<void> {
    await this.click(await this.boundaryPoint(side, 0.5));
  }

  async downUp(point: Point): Promise<void> {
    await this.page.mouse.move(point.x, point.y);
    await this.page.mouse.down();
    await this.page.mouse.up();
  }

  async click(point: Point): Promise<void> {
    await this.page.mouse.click(point.x, point.y);
  }

  async relativePoint(xRatio: number, yRatio: number, dx = 0, dy = 0): Promise<Point> {
    const box = await CanvasHelper.canvas(this.page).boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');
    return {
      x: box.x + box.width * xRatio + dx,
      y: box.y + box.height * yRatio + dy,
    };
  }

  private async boundaryPoint(side: BoundarySide, xRatio: number): Promise<Point> {
    return this.relativePoint(
      0.5 + (xRatio - 0.5),
      0.5,
      0,
      side === 'left' ? -BOUNDARY_OFFSET_PX : BOUNDARY_OFFSET_PX,
    );
  }
}
