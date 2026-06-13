import { expect, type Locator, type Page, test } from '@playwright/test';
import { waitForMapLibreCanvas } from './helpers/mapLibre';

type DrawTool = 'drawBezier' | 'drawArc';
type Point = { x: number; y: number };
type LineCase = {
  name: string;
  element: 'lane' | 'signal' | 'stopSign' | 'yieldSign' | 'speedBump' | 'barrierGate';
  tool: DrawTool;
  expectedId: string;
  groupLabel: string;
  inspectorTitle: string;
  rawSelects?: Record<string, string>;
  inspectorTexts?: string[];
};

const LINE_CASES: LineCase[] = [
  {
    name: 'lane with Bezier',
    element: 'lane',
    tool: 'drawBezier',
    expectedId: 'lane_1',
    groupLabel: 'Lanes',
    inspectorTitle: 'Lane',
    rawSelects: {
      type: 'CITY_DRIVING',
      turn: 'NO_TURN',
      direction: 'FORWARD',
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'DOTTED_WHITE',
    },
  },
  {
    name: 'lane with Arc',
    element: 'lane',
    tool: 'drawArc',
    expectedId: 'lane_1',
    groupLabel: 'Lanes',
    inspectorTitle: 'Lane',
    rawSelects: {
      type: 'CITY_DRIVING',
      direction: 'FORWARD',
      leftBoundaryType: 'DOTTED_WHITE',
      rightBoundaryType: 'DOTTED_WHITE',
    },
  },
  {
    name: 'signal with Bezier',
    element: 'signal',
    tool: 'drawBezier',
    expectedId: 'signal_1',
    groupLabel: 'Signals',
    inspectorTitle: 'Signal',
    rawSelects: { type: 'MIX_3_VERTICAL' },
    inspectorTexts: ['Stop Lines', 'Subsignals (3)'],
  },
  {
    name: 'stopSign with Bezier',
    element: 'stopSign',
    tool: 'drawBezier',
    expectedId: 'stopsign_1',
    groupLabel: 'Stop Signs',
    inspectorTitle: 'StopSign',
    rawSelects: { type: 'ONE_WAY' },
    inspectorTexts: ['Stop Lines'],
  },
  {
    name: 'yieldSign with Bezier',
    element: 'yieldSign',
    tool: 'drawBezier',
    expectedId: 'yieldsign_1',
    groupLabel: 'Yield Signs',
    inspectorTitle: 'YieldSign',
    inspectorTexts: ['Stop Lines', 'Segments'],
  },
  {
    name: 'speedBump with Bezier',
    element: 'speedBump',
    tool: 'drawBezier',
    expectedId: 'speedbump_1',
    groupLabel: 'Speed Bumps',
    inspectorTitle: 'SpeedBump',
    inspectorTexts: ['Position Curves', 'Segments'],
  },
  {
    name: 'barrierGate with Bezier',
    element: 'barrierGate',
    tool: 'drawBezier',
    expectedId: 'barriergate_1',
    groupLabel: 'Barrier Gates',
    inspectorTitle: 'BarrierGate',
    rawSelects: { type: 'ROD' },
    inspectorTexts: ['Stop Lines'],
  },
];

test.describe('Apollo line drawing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'ams.webLicense.v1',
        JSON.stringify({ trialStart: new Date('2026-06-08T00:00:00Z').getTime() }),
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

    await page.goto('/');
    await expect(page.getByTestId('workspace-layout')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-map')).toBeVisible();
    await expect(page.getByTestId('status-app-mode')).toHaveText('绘图');
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
    await expect(page.getByTestId('status-entity-count')).toHaveText('0');
    await expect(page.getByTestId('license-status')).toContainText(/trial|activated/i);
    await expect(page.getByTestId('inspector-panel')).toContainText(
      'Select an entity to view properties',
    );

    await waitForMapLibreCanvas(page);

    await openLayersPanel(page);
  });

  for (const lineCase of LINE_CASES) {
    test(`draws, commits, selects, and reflects ${lineCase.name}`, async ({ page }) => {
      await selectLineTool(page, lineCase);

      const draw = new CanvasClickHelper(page);
      if (lineCase.tool === 'drawArc') {
        await draw.drawArc();
      } else {
        await draw.drawBezierWithEnter(lineCase.element);
      }

      await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
      await expect(page.getByTestId('status-entity-count')).toHaveText('1');

      await expect(layerGroupRow(page, lineCase)).toContainText('1');
      await selectEntityFromLayerTree(page, lineCase);
      await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
      await expect(page.getByTestId('inspector-title')).toHaveText(lineCase.inspectorTitle);
      await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute(
        'title',
        lineCase.expectedId,
      );

      await waitForInspectorForm(page, lineCase);
      await expect(page.getByTestId('inspector-panel')).toContainText(lineCase.expectedId);
      for (const text of lineCase.inspectorTexts ?? []) {
        await expect(page.getByTestId('inspector-panel')).toContainText(text);
      }
      for (const [name, value] of Object.entries(lineCase.rawSelects ?? {})) {
        await expect(inspectorSelect(page, name)).toHaveValue(value);
      }
    });
  }
});

function canvas(page: Page): Locator {
  return page.getByTestId('maplibre-canvas').first();
}

function inspectorSelect(page: Page, name: string): Locator {
  return page.getByTestId('inspector-panel').locator(`select[name="${name}"]`);
}

function layerGroupRow(page: Page, lineCase: LineCase): Locator {
  return page.getByTestId(`layer-tree-node-group-${lineCase.element}`).filter({
    has: page.getByText(lineCase.groupLabel, { exact: true }),
  });
}

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function entityRow(page: Page, id: string): Locator {
  return page.getByTestId('layer-tree').locator(`[data-entity-id="${cssAttr(id)}"]`);
}

function outerAriaRow(inner: Locator): Locator {
  return inner.locator('xpath=ancestor-or-self::*[@role="treeitem" and @aria-level][1]');
}

async function selectEntityFromLayerTree(page: Page, lineCase: LineCase): Promise<void> {
  const group = layerGroupRow(page, lineCase);
  const entity = entityRow(page, lineCase.expectedId);

  await expect(group).toBeVisible();
  if (!(await isVisible(entity, 500))) {
    await group.click();
  }
  await expect(entity).toBeVisible();
  await entity.click();
  await expect(outerAriaRow(entity)).toHaveAttribute('aria-selected', 'true');
}

async function openLayersPanel(page: Page): Promise<void> {
  const tree = page.getByTestId('layer-tree');
  const layersButton = page.getByTestId('activity-layers');

  await expect(page.getByTestId('activity-bar')).toBeVisible();
  await expect(layersButton).toBeVisible();
  await expect(layersButton).toBeEnabled();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await isVisible(tree, 500)) {
      await waitForLayerSidebarReady(page);
      return;
    }

    await layersButton.click();
    await waitForLayerSidebarReady(page);
    if (await isVisible(tree, 2_500)) {
      return;
    }
  }

  await expect(tree).toBeVisible();
  await waitForLayerSidebarReady(page);
}

async function waitForLayerSidebarReady(page: Page): Promise<void> {
  const sidebar = page.getByTestId('workspace-panel-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText('Loading sidebar...')).toHaveCount(0);
  await expect(sidebar.getByText('Loading layers...')).toHaveCount(0);
}

async function isVisible(locator: Locator, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function waitForInspectorForm(page: Page, lineCase: LineCase): Promise<void> {
  const inspector = page.getByTestId('inspector-panel');
  await expect(inspector).toContainText('Attributes');
  if (lineCase.rawSelects) {
    await expect(inspector.locator('select').first()).toBeVisible();
  }
}

async function selectLineTool(page: Page, lineCase: LineCase): Promise<void> {
  await page.getByTestId(`element-${lineCase.element}`).click();
  await page.getByTestId(`draw-tool-${lineCase.element}-${lineCase.tool}`).click();
  await expect(page.getByTestId(`draw-tool-${lineCase.element}-${lineCase.tool}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('status-editor-mode')).toHaveText(
    lineCase.tool === 'drawArc' ? 'Draw: Arc' : 'Draw: Bezier',
  );
}

class CanvasClickHelper {
  constructor(private readonly page: Page) {}

  async drawBezierWithEnter(element: LineCase['element']): Promise<void> {
    const offset = element === 'signal' || element === 'barrierGate' ? -24 : 0;
    const p1 = await this.relativePoint(0.34, 0.52, 0, offset);
    const p2 = await this.relativePoint(0.66, 0.48, 0, offset);

    await this.downUp(p1);
    await this.downUp(p2);
    await this.page.keyboard.press('Enter');
  }

  async drawArc(): Promise<void> {
    const p1 = await this.relativePoint(0.34, 0.58);
    const p2 = await this.relativePoint(0.5, 0.36);
    const p3 = await this.relativePoint(0.66, 0.58);

    await this.click(p1);
    await this.click(p2);
    await this.click(p3);
  }

  private async relativePoint(xRatio: number, yRatio: number, dx = 0, dy = 0): Promise<Point> {
    const box = await canvas(this.page).boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');
    return {
      x: box.x + box.width * xRatio + dx,
      y: box.y + box.height * yRatio + dy,
    };
  }

  private async click(point: Point): Promise<void> {
    await this.page.mouse.click(point.x, point.y);
  }

  private async downUp(point: Point): Promise<void> {
    await this.page.mouse.move(point.x, point.y);
    await this.page.mouse.down();
    await this.page.mouse.up();
  }
}
