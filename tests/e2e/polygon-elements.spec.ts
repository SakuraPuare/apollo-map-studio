import { expect, type Locator, type Page, test } from '@playwright/test';
import { waitForMapLibreCanvas } from './helpers/mapLibre';

type DrawTool = 'drawRotatedRect' | 'drawPolygon';
type Point = { x: number; y: number };
type PolygonElementType =
  | 'junction'
  | 'pncJunction'
  | 'parkingSpace'
  | 'crosswalk'
  | 'clearArea'
  | 'area';

type PolygonCase = {
  element: PolygonElementType;
  expectedId: string;
  groupLabel: string;
  inspectorTitle: string;
};

const EMPTY_LAYER_TEXT = 'No entities yet. Start drawing!';

const POLYGON_CASES: readonly PolygonCase[] = [
  {
    element: 'junction',
    expectedId: 'J_1',
    groupLabel: 'Junctions',
    inspectorTitle: 'Junction',
  },
  {
    element: 'pncJunction',
    expectedId: 'PNCJ_1',
    groupLabel: 'PNC Junctions',
    inspectorTitle: 'PncJunction',
  },
  {
    element: 'parkingSpace',
    expectedId: 'parkingspace_1',
    groupLabel: 'Parking Spaces',
    inspectorTitle: 'ParkingSpace',
  },
  {
    element: 'crosswalk',
    expectedId: 'CW_1',
    groupLabel: 'Crosswalks',
    inspectorTitle: 'Crosswalk',
  },
  {
    element: 'clearArea',
    expectedId: 'cleararea_1',
    groupLabel: 'Clear Areas',
    inspectorTitle: 'ClearArea',
  },
  {
    element: 'area',
    expectedId: 'area_1',
    groupLabel: 'Areas',
    inspectorTitle: 'Area',
  },
] as const;

const DRAW_TOOLS: readonly DrawTool[] = ['drawRotatedRect', 'drawPolygon'];

test.setTimeout(90_000);
test.use({
  viewport: { width: 1280, height: 800 },
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
});

test.describe('Apollo polygon element drawing', () => {
  test.beforeEach(async ({ page }) => {
    await seedCleanWorkspace(page);

    await gotoWorkspace(page);
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
  });

  for (const polygonCase of POLYGON_CASES) {
    for (const tool of DRAW_TOOLS) {
      test(`draws, commits, layers, and inspects ${polygonCase.element} with ${tool}`, async ({
        page,
      }) => {
        const tree = await openLayersPanel(page);
        const draw = new CanvasClickHelper(page);

        await selectPolygonTool(page, polygonCase.element, tool);
        await draw.draw(tool);

        await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
        await expect(page.getByTestId('status-entity-count')).toHaveText('1');

        await expectLayerGroup(tree, polygonCase);
        await selectEntityFromLayerTree(page, tree, polygonCase);
        await expectInspector(page, polygonCase);
      });
    }
  }

  test('cancels drawPolygon without committing an Apollo polygon', async ({ page }) => {
    const tree = await openLayersPanel(page);
    const draw = new CanvasClickHelper(page);

    await selectPolygonTool(page, 'area', 'drawPolygon');
    await draw.clickPolygonDraft();
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Polygon');

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
    await expect(page.getByTestId('status-entity-count')).toHaveText('0');
    await expect(tree.locator('[data-entity-id]')).toHaveCount(0);
    await expect(tree.getByText(EMPTY_LAYER_TEXT)).toBeVisible();
    await expect(page.getByTestId('inspector-panel')).toContainText(
      'Select an entity to view properties',
    );
  });
});

async function gotoWorkspace(page: Page): Promise<void> {
  const workspace = page.getByTestId('workspace-layout');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (await isVisible(workspace, 15_000)) return;
  }

  await expect(workspace).toBeVisible({ timeout: 20_000 });
}

async function seedCleanWorkspace(page: Page): Promise<void> {
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
}

async function openLayersPanel(page: Page): Promise<Locator> {
  const tree = page.getByTestId('layer-tree');
  const layersButton = page.getByTestId('activity-layers');

  await expect(page.getByTestId('activity-bar')).toBeVisible();
  await expect(layersButton).toBeEnabled();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await isVisible(tree, 500)) {
      await waitForLayerSidebarReady(page);
      return tree;
    }

    await layersButton.click();
    await waitForLayerSidebarReady(page);
    if (await isVisible(tree, 2_500)) return tree;
  }

  await expect(tree).toBeVisible();
  await waitForLayerSidebarReady(page);
  return tree;
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

async function selectPolygonTool(page: Page, element: PolygonElementType, tool: DrawTool) {
  await page.getByTestId(`element-${element}`).click();
  const button = page.getByTestId(`draw-tool-${element}-${tool}`);
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('status-editor-mode')).toHaveText(
    tool === 'drawRotatedRect' ? 'Draw: Rectangle' : 'Draw: Polygon',
  );
}

async function expectLayerGroup(tree: Locator, polygonCase: PolygonCase): Promise<void> {
  const group = groupNode(tree, polygonCase.element);
  await expect(group).toBeVisible();
  await expect(group).toContainText(polygonCase.groupLabel);
  await expect(group).toContainText('1');
  await expand(group);
  await expect(entityNode(tree, polygonCase.expectedId)).toBeVisible();
}

async function selectEntityFromLayerTree(
  page: Page,
  tree: Locator,
  polygonCase: PolygonCase,
): Promise<void> {
  const entity = entityNode(tree, polygonCase.expectedId);
  await expect(entity).toBeVisible();
  await entity.click();
  await expect(outerAriaRow(entity)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
}

async function expectInspector(page: Page, polygonCase: PolygonCase): Promise<void> {
  await expect(page.getByTestId('inspector-title')).toHaveText(polygonCase.inspectorTitle);
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute(
    'title',
    polygonCase.expectedId,
  );
  await expect(page.getByTestId('inspector-panel')).toContainText(polygonCase.expectedId);
}

async function expand(node: Locator): Promise<void> {
  await expect(node).toBeVisible();
  const row = outerAriaRow(node);
  if ((await row.getAttribute('aria-expanded')) === 'false') {
    await node.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
  }
}

function groupNode(tree: Locator, type: PolygonElementType): Locator {
  return tree.getByTestId(`layer-tree-node-group-${type}`);
}

function entityNode(tree: Locator, id: string): Locator {
  return tree.locator(`[data-entity-id="${cssAttr(id)}"]`);
}

function outerAriaRow(inner: Locator): Locator {
  return inner.locator('xpath=ancestor-or-self::*[@role="treeitem" and @aria-level][1]');
}

function canvas(page: Page): Locator {
  return page.getByTestId('maplibre-canvas').first();
}

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

class CanvasClickHelper {
  constructor(private readonly page: Page) {}

  async draw(tool: DrawTool): Promise<void> {
    if (tool === 'drawRotatedRect') {
      await this.drawRotatedRect();
    } else {
      await this.drawPolygon();
    }
  }

  async clickPolygonDraft(): Promise<void> {
    await this.click(await this.relativePoint(0.36, 0.58));
    await this.click(await this.relativePoint(0.58, 0.56));
    await this.click(await this.relativePoint(0.62, 0.7));
  }

  private async drawRotatedRect(): Promise<void> {
    await this.click(await this.relativePoint(0.36, 0.56));
    await this.click(await this.relativePoint(0.58, 0.5));
    await this.click(await this.relativePoint(0.62, 0.64));
  }

  private async drawPolygon(): Promise<void> {
    await this.click(await this.relativePoint(0.36, 0.58));
    await this.click(await this.relativePoint(0.58, 0.56));
    await this.click(await this.relativePoint(0.62, 0.7));
    await this.click(await this.relativePoint(0.38, 0.72));
    await this.page.keyboard.press('Enter');
  }

  private async relativePoint(xRatio: number, yRatio: number): Promise<Point> {
    const box = await canvas(this.page).boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');
    return {
      x: box.x + box.width * xRatio,
      y: box.y + box.height * yRatio,
    };
  }

  private async click(point: Point): Promise<void> {
    await this.page.mouse.click(point.x, point.y);
  }
}
