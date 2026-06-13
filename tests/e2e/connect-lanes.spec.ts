import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { selectors } from './helpers/selectors';
import { waitForMapLibreCanvas } from './helpers/mapLibre';

type Point = { x: number; y: number };

test.describe('Connect Lanes E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ams.webLicense.v1', JSON.stringify({ trialStart: Date.now() }));
      localStorage.setItem('apollo-map-studio:mapCenterLng', '116.4');
      localStorage.setItem('apollo-map-studio:mapCenterLat', '39.9');
      localStorage.setItem('apollo-map-studio:mapZoom', '18');
      localStorage.setItem('apollo-map-studio:gridEnabled', 'false');
      localStorage.setItem('apollo-map-studio:snapEnabled', 'false');
      localStorage.setItem('apollo-map-studio:laneBoundaryType', 'DOTTED_WHITE');
    });

    await page.goto('/');
    await expectWorkspaceReady(page);
    await waitForMapLibreCanvas(page);
  });

  test('draws two lanes, connects them, exits mode, and exposes topology in Inspector', async ({
    page,
  }) => {
    const canvas = new CanvasActions(page);
    const lane1 = await drawLane(page, canvas, 0.3, 0.55, 0.46, 0.55);
    const lane2 = await drawLane(page, canvas, 0.61, 0.47, 0.77, 0.47);

    await expect(page.locator(selectors.status.field('entity-count'))).toHaveText('2');
    await expectNoInspectorSelection(page);

    const connectButton = page.locator(selectors.toolbar.action('connectLanes'));
    await expect(connectButton).toHaveAttribute('aria-pressed', 'false');

    await connectButton.click();
    await expect(connectButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(selectors.status.field('editor-mode'))).toHaveText('Idle');

    await clickLaneUntilSelected(page, canvas, lane1.selectionCandidates, 'lane_1');
    await expect(connectButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(selectors.status.field('editor-mode'))).toHaveText('Selected');
    await expect(page.getByTestId('inspector-title')).toHaveText('Lane');
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'lane_1');
    await expectTopologyValue(page, 'Successors', 'none');

    await clickLaneUntilConnected(page, canvas, lane2.selectionCandidates, connectButton);
    await expect(connectButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(selectors.status.field('editor-mode'))).toHaveText('Selected');
    await expect(page.getByTestId('inspector-title')).toHaveText('Lane');
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'lane_1');
    await expectTopologyValue(page, 'Successors', 'lane_2');

    await topologyValue(page, 'Successors').getByRole('button', { name: 'lane_2' }).click();
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'lane_2');
    await expectTopologyValue(page, 'Predecessors', 'lane_1');
  });
});

async function expectWorkspaceReady(page: Page): Promise<void> {
  await expect(page.locator(selectors.workspace.layout)).toBeVisible();
  await expect(page.locator(selectors.workspace.main)).toBeVisible();
  await expect(page.locator(selectors.workspace.dockview)).toBeVisible();
  await expect(page.locator(selectors.status.bar)).toBeVisible();
  await expect(page.locator(selectors.status.field('app-mode'))).toHaveText('绘图');
  await expect(page.locator(selectors.status.field('editor-mode'))).toHaveText('Idle');
  await expect(page.locator(selectors.status.field('entity-count'))).toHaveText('0');
  await expect(page.getByTestId('license-status')).toContainText(/trial|activated/i);
  await expectNoInspectorSelection(page);
}

async function expectNoInspectorSelection(page: Page): Promise<void> {
  await expect(page.getByTestId('inspector-panel')).toContainText(
    'Select an entity to view properties',
  );
  await expect(page.getByTestId('inspector-title')).toHaveCount(0);
  await expect(page.getByTestId('inspector-entity-id')).toHaveCount(0);
}

async function drawLane(
  page: Page,
  canvas: CanvasActions,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<{ selectionCandidates: Point[] }> {
  await page.locator(selectors.toolbar.element('lane')).click();
  await page.locator(selectors.toolbar.drawTool('lane', 'drawBezier')).click();
  await expect(page.locator(selectors.toolbar.drawTool('lane', 'drawBezier'))).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator(selectors.status.field('editor-mode'))).toHaveText('Draw: Bezier');

  const start = await canvas.point(startX, startY);
  const end = await canvas.point(endX, endY);
  await canvas.downUp(start);
  await canvas.downUp(end);
  await page.keyboard.press('Enter');

  await expect(page.locator(selectors.status.field('editor-mode'))).toHaveText('Idle');
  await canvas.nextFrames(4);

  return {
    selectionCandidates: candidatePoints(start, end),
  };
}

async function clickLaneUntilSelected(
  page: Page,
  canvas: CanvasActions,
  candidates: Point[],
  expectedId: string,
): Promise<void> {
  await clickCandidatesUntil(page, canvas, candidates, async () => {
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', expectedId, {
      timeout: 350,
    });
  });
}

async function clickLaneUntilConnected(
  page: Page,
  canvas: CanvasActions,
  candidates: Point[],
  connectButton: Locator,
): Promise<void> {
  await clickCandidatesUntil(page, canvas, candidates, async () => {
    await expect(connectButton).toHaveAttribute('aria-pressed', 'false', { timeout: 350 });
  });
}

async function clickCandidatesUntil(
  page: Page,
  canvas: CanvasActions,
  candidates: Point[],
  assertion: () => Promise<void>,
): Promise<void> {
  let lastError: unknown;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    for (const point of candidates) {
      await canvas.click(point);
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() >= deadline) break;
    }
  }
  if (lastError instanceof Error) throw lastError;
  await assertion();
}

function topologyValue(page: Page, label: string): Locator {
  return page
    .getByTestId('inspector-panel')
    .locator('span', { hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .locator('xpath=following-sibling::span[1]');
}

async function expectTopologyValue(page: Page, label: string, value: string): Promise<void> {
  await expect(topologyValue(page, label)).toContainText(value);
}

function candidatePoints(start: Point, end: Point): Point[] {
  const mid = midpoint(start, end);
  const nearStart = interpolate(start, end, 0.28);
  const nearEnd = interpolate(start, end, 0.72);
  return [mid, nearStart, nearEnd].flatMap((point) => [
    point,
    { x: point.x, y: point.y - 8 },
    { x: point.x, y: point.y + 8 },
    { x: point.x - 8, y: point.y },
    { x: point.x + 8, y: point.y },
  ]);
}

function midpoint(a: Point, b: Point): Point {
  return interpolate(a, b, 0.5);
}

function interpolate(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class CanvasActions {
  constructor(private readonly page: Page) {}

  async point(xRatio: number, yRatio: number): Promise<Point> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');
    return {
      x: box.x + box.width * xRatio,
      y: box.y + box.height * yRatio,
    };
  }

  async click(point: Point): Promise<void> {
    await this.page.mouse.click(point.x, point.y, { button: 'left' });
    await this.nextFrames(2);
  }

  async downUp(point: Point): Promise<void> {
    await this.page.mouse.move(point.x, point.y);
    await this.page.mouse.down({ button: 'left' });
    await this.page.mouse.up({ button: 'left' });
    await this.nextFrames(2);
  }

  async nextFrames(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await this.page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
    }
  }

  private canvas(): Locator {
    return this.page.locator(selectors.map.canvas).first();
  }
}
