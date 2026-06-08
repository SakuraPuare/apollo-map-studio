import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

type Point = { x: number; y: number };
type CanvasTarget = Point & { xRatio: number; yRatio: number };
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
type DownloadTextRecord = {
  filename: string;
  href: string;
  type: string;
  size: number;
  error?: string;
  text?: string;
};

declare global {
  interface Window {
    __sceneAuthoringE2E?: {
      downloads: DownloadTextRecord[];
    };
  }
}

test.use({
  baseURL: BASE_URL,
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    args: [
      '--headless=new',
      '--disable-dev-shm-usage',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--use-gl=egl',
    ],
  },
});

test.describe('scene authoring', () => {
  test('authors scene content through real canvas interactions and Inspector edits', async ({
    ams,
    page,
  }) => {
    await ams.gotoWorkspace();
    await ams.switchMode('scene');
    await ams.expectStatusField('app-mode', '场景');

    const canvas = await CanvasClickHelper.create(page);
    await loadBlankScenario(ams);
    await canvas.waitForScenarioFit();

    const vehiclePoint = await placeSceneObject(
      page,
      canvas,
      'placeVehicle',
      'vehicle',
      0.36,
      0.56,
    );
    const pedestrianPoint = await placeSceneObject(
      page,
      canvas,
      'placePedestrian',
      'pedestrian',
      0.48,
      0.56,
    );
    const bicyclePoint = await placeSceneObject(page, canvas, 'placeBicycle', 'bicycle', 0.6, 0.56);
    const staticPoint = await placeSceneObject(
      page,
      canvas,
      'placeStatic',
      'staticObstacle',
      0.72,
      0.56,
    );
    expect(staticPoint.x).toBeGreaterThan(bicyclePoint.x);
    await selectSceneObjectAt(page, canvas, bicyclePoint, 'bicycle');
    await selectSceneObjectAt(page, canvas, staticPoint, 'staticObstacle');

    const trafficLightPoint = await placeSceneObject(
      page,
      canvas,
      'placeTrafficLight',
      'Signal ID',
      0.5,
      0.4,
    );
    await selectSceneObjectAt(page, canvas, staticPoint, 'staticObstacle');
    await selectSceneObjectAt(page, canvas, trafficLightPoint, 'Signal ID');
    await editAndDeleteSelectedTrafficLight(page);

    await selectSceneObjectAt(page, canvas, pedestrianPoint, 'pedestrian');
    await editAndDeleteSelectedObstacle(page);

    const egoStartPoint = await setEgoPoint(page, canvas, 'setEgoStart', 0.42, 0.34);
    await setEgoPoint(page, canvas, 'setEgoEnd', 0.68, 0.34);
    await setEgoPoint(page, canvas, 'addWaypoint', 0.55, 0.3);
    await selectSceneObjectAt(page, canvas, egoStartPoint, '起点 (世界米)');
    await editSelectedEgo(page);

    await selectSceneObjectAt(page, canvas, vehiclePoint, 'vehicle');
    await drawTrajectoryOnSelectedVehicle(page, canvas);

    await installDownloadTextCapture(page);
    await page.getByRole('button', { name: /^导出$/ }).click();
    await expect(page.getByText('已导出当前场景')).toBeVisible();

    const exported = await readLatestExport(page);
    assertExportedScene(exported);
  });
});

async function loadBlankScenario(ams: {
  page: Page;
  openActivityPanel(id: string): Promise<void>;
  setNextPickerFiles(files: Array<{ name: string; mimeType: string; text: string }>): Promise<void>;
}) {
  await ams.openActivityPanel('scenarios');
  await ams.setNextPickerFiles([
    {
      name: 'scene-authoring-e2e.json',
      mimeType: 'application/json',
      text: JSON.stringify(blankOpenScenario()),
    },
  ]);

  await ams.page.getByRole('button', { name: /^打开场景$/ }).click();
  await resolveProjectionIfRequested(ams.page);
  await expect(ams.page.getByText('已加载 1 个场景')).toBeVisible();
  await expect(ams.page.getByText('scene-authoring-e2e.json')).toBeVisible();
}

async function resolveProjectionIfRequested(page: Page) {
  const loaded = page.getByText('已加载 1 个场景');
  const dialog = page.getByRole('dialog', { name: /Choose Coordinate System/ });
  const result = await Promise.race([
    loaded.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'loaded' as const),
    dialog.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'dialog' as const),
  ]);
  if (result !== 'dialog') return;

  const useProjection = dialog.getByRole('button', { name: /Use this projection/ });
  await expect(useProjection).toBeEnabled({ timeout: 10_000 });
  await useProjection.click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

function blankOpenScenario() {
  return {
    id: 'scene-authoring-e2e',
    type: 'worldsim',
    mapId: 'scene-authoring-map',
    tags: [],
    scenario: {
      roadNetwork: {
        logicFile: { filepath: 'maps/scene-authoring' },
        trafficLights: [],
      },
      entities: { scenarioObjects: [] },
      storyboard: {
        init: { actions: { privates: [] } },
        stories: [],
        stopTrigger: {
          conditionGroups: [
            {
              conditions: [
                {
                  conditionEdge: 'none',
                  name: 'end',
                  byValueCondition: {
                    simulationTimeCondition: { rule: 'greaterOrEqual', value: 60 },
                  },
                },
              ],
            },
          ],
        },
      },
      autoCarInfo: {
        start: { x: 440000, y: 4410000, heading: 0 },
        end: { x: 440080, y: 4410040 },
        routingRequest: { waypoint: [] },
        startVelocity: 0,
        startAcceleration: 0,
      },
      gradingConfigInfo: {
        baseGradeConfigFile: 'grading_system/conf/grading_metrics_default.conf',
      },
    },
  };
}

async function placeSceneObject(
  page: Page,
  canvas: CanvasClickHelper,
  tool: SceneTool,
  expectedInspectorText: string,
  xRatio: number,
  yRatio: number,
): Promise<CanvasTarget> {
  await selectSceneTool(page, tool);
  const point = await canvas.clickRatio(xRatio, yRatio);
  await expectInspectorToContain(page, expectedInspectorText);
  await canvas.waitForScenarioRender();
  return point;
}

async function setEgoPoint(
  page: Page,
  canvas: CanvasClickHelper,
  tool: SceneTool,
  xRatio: number,
  yRatio: number,
): Promise<CanvasTarget> {
  await selectSceneTool(page, tool);
  const point = await canvas.clickRatio(xRatio, yRatio);
  await canvas.waitForScenarioRender();
  return point;
}

async function selectSceneTool(page: Page, tool: SceneTool) {
  await ensureSceneMode(page);
  const button = page.getByTestId(`scene-tool-${tool}`);
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expectScenarioLoaded(page);
}

async function ensureSceneMode(page: Page) {
  if (
    (await page
      .getByTestId('status-app-mode')
      .textContent()
      .catch(() => '')) !== '场景'
  ) {
    await page.getByTestId('mode-scene').click();
    await expect(page.getByTestId('status-app-mode')).toHaveText('场景');
  }
  await expectScenarioLoaded(page);
}

async function expectScenarioLoaded(page: Page) {
  await expect(page.getByText('scene-authoring-e2e.json')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: /^导出$/ })).toBeEnabled();
}

async function selectSceneObjectAt(
  page: Page,
  canvas: CanvasClickHelper,
  target: CanvasTarget,
  expectedInspectorText: string,
) {
  await selectSceneTool(page, 'select');
  const offsets = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
    { x: 4, y: 0 },
    { x: -4, y: 0 },
    { x: 0, y: 4 },
    { x: 0, y: -4 },
    { x: 3, y: 3 },
    { x: -3, y: -3 },
    { x: 5, y: 5 },
    { x: -5, y: -5 },
  ];
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const base = await canvas.pointForTarget(target);
    for (const offset of offsets) {
      await canvas.click({ x: base.x + offset.x, y: base.y + offset.y });
      await canvas.waitForScenarioRender();
      if ((await inspectorText(page)).includes(expectedInspectorText)) return;
      if (Date.now() >= deadline) break;
    }
  }

  throw new Error(`Could not select scene object with Inspector text: ${expectedInspectorText}`);
}

async function editAndDeleteSelectedObstacle(page: Page) {
  const panel = inspector(page);
  await panel.getByLabel(/^类型$/).selectOption('unknown');
  await expect(panel.getByLabel(/^类型$/)).toHaveValue('unknown');

  await fillNumber(panel.getByLabel(/^X$/), '440111');
  await fillNumber(panel.getByLabel(/^长$/), '3.5');
  await fillNumber(panel.getByLabel(/^初速 \(m\/s\)$/), '4.2');
  await expectInspectorToContain(page, 'unknown');

  await panel.getByRole('button', { name: /^删除障碍物$/ }).click();
  await expect(panel).toContainText('选择障碍物 / 红绿灯 / 主车以查看属性');
}

async function editAndDeleteSelectedTrafficLight(page: Page) {
  const panel = inspector(page);
  await fillText(panel.getByLabel(/^Signal ID$/), 'Signal_E2E_Edited');
  await panel.getByLabel(/^颜色$/).selectOption('YELLOW');
  await expect(panel.getByLabel(/^颜色$/)).toHaveValue('YELLOW');
  await fillNumber(panel.getByLabel(/^触发值$/), '12');
  await panel.getByLabel(/^阶段 1 颜色$/).selectOption('RED');
  await expect(panel.getByLabel(/^阶段 1 颜色$/)).toHaveValue('RED');
  await fillNumber(panel.getByLabel(/^阶段 1 保持秒数$/), '8');
  await panel.getByRole('button', { name: /^添加阶段$/ }).click();
  await expect(panel.getByLabel(/^阶段 3 颜色$/)).toBeVisible();

  await panel.getByRole('button', { name: /^删除红绿灯$/ }).click();
  await expect(panel).toContainText('选择障碍物 / 红绿灯 / 主车以查看属性');
}

async function editSelectedEgo(page: Page) {
  const panel = inspector(page);
  const start = formSection(panel, '起点 (世界米)');
  const end = formSection(panel, '终点 (世界米)');
  const motion = formSection(panel, '运动');

  await fillNumber(start.getByLabel(/^X$/), '440010');
  await fillNumber(start.getByLabel(/^Y$/), '4410010');
  await fillNumber(start.getByLabel(/^朝向 \(rad\)$/), '1.57');
  await fillNumber(end.getByLabel(/^X$/), '440090');
  await fillNumber(end.getByLabel(/^Y$/), '4410050');
  await fillNumber(motion.getByLabel(/^初速 \(m\/s\)$/), '6.5');
  await fillNumber(motion.getByLabel(/^初加速度$/), '0.4');
  await fillNumber(panel.getByLabel(/^点 1 X$/), '440045');
  await fillNumber(panel.getByLabel(/^点 1 Y$/), '4410030');
}

async function drawTrajectoryOnSelectedVehicle(page: Page, canvas: CanvasClickHelper) {
  await selectSceneTool(page, 'drawTrajectory');
  await canvas.clickRatio(0.34, 0.45);
  await canvas.clickRatio(0.44, 0.42);
  await canvas.clickRatio(0.54, 0.46);
  await page.keyboard.press('Enter');
  await canvas.waitForScenarioRender();

  const panel = inspector(page);
  await expect(panel).toContainText('轨迹顶点 (世界米)');
  await expect(panel.getByLabel(/^点 1 X$/)).toBeVisible();
  await expect(panel.getByLabel(/^点 2 X$/)).toBeVisible();
}

function inspector(page: Page): Locator {
  return page.getByTestId('workspace-panel-inspector');
}

async function inspectorText(page: Page): Promise<string> {
  return inspector(page)
    .innerText()
    .catch(() => '');
}

async function expectInspectorToContain(page: Page, text: string) {
  await expect.poll(() => inspectorText(page), { timeout: 10_000 }).toContain(text);
}

function formSection(panel: Locator, title: string): Locator {
  return panel.getByText(title, { exact: true }).locator('xpath=..');
}

async function fillNumber(locator: Locator, value: string) {
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}

async function fillText(locator: Locator, value: string) {
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}

async function installDownloadTextCapture(page: Page) {
  await page.evaluate(() => {
    type CapturedDownload = {
      filename: string;
      href: string;
      type: string;
      size: number;
      error?: string;
      text?: string;
    };
    const state = { downloads: [] as CapturedDownload[] };
    window.__sceneAuthoringE2E = state;

    const originalCreateElement = Document.prototype.createElement as unknown as (
      this: Document,
      tagName: string,
      options?: ElementCreationOptions,
    ) => Element;
    Document.prototype.createElement = function createElement(
      this: Document,
      tagName: string,
      options?: ElementCreationOptions,
    ) {
      const element = Reflect.apply(
        originalCreateElement,
        this,
        options === undefined ? [tagName] : [tagName, options],
      ) as Element;
      if (element instanceof HTMLAnchorElement) {
        const originalClick = element.click.bind(element);
        element.click = () => {
          if (element.download) {
            const blob = window.__amsE2E.blobByUrl?.get(element.href);
            const record: CapturedDownload = {
              filename: element.download,
              href: element.href,
              type: blob?.type ?? '',
              size: blob?.size ?? 0,
            };
            state.downloads.push(record);
            if (!blob) record.error = `No Blob was registered for ${element.href}`;
            else {
              void blob.text().then(
                (text) => {
                  record.text = text;
                },
                (error: unknown) => {
                  record.error = error instanceof Error ? error.message : String(error);
                },
              );
            }
          }
          originalClick();
        };
      }
      return element;
    } as typeof Document.prototype.createElement;
  });
}

async function readLatestExport(page: Page): Promise<unknown> {
  await page.waitForFunction(
    () => {
      const downloads = window.__sceneAuthoringE2E?.downloads ?? [];
      const latest = downloads[downloads.length - 1];
      return Boolean(latest?.text || latest?.error);
    },
    { timeout: 10_000 },
  );
  const record = await page.evaluate(() => {
    const downloads = window.__sceneAuthoringE2E?.downloads ?? [];
    return downloads[downloads.length - 1] ?? null;
  });
  expect(record).toBeTruthy();
  expect(record?.filename).toBe('scene-authoring-e2e.json');
  expect(record?.error).toBeUndefined();
  expect(record?.text).toBeTruthy();
  return JSON.parse(record?.text ?? '');
}

function assertExportedScene(exported: unknown) {
  const root = asRecord(exported);
  const scenario = asRecord(root.scenario);
  const entities = asRecord(scenario.entities);
  const objects = asArray(entities.scenarioObjects).map(asRecord);
  const kinds = objects.map(entityKind);
  expect(kinds).toEqual(['vehicle', 'bicycle', 'staticObstacle']);
  const exportedVehicle = objects.find((object) => entityKind(object) === 'vehicle');
  expect(exportedVehicle).toBeTruthy();
  const exportedVehicleName = String(asRecord(exportedVehicle).name);

  const roadNetwork = asRecord(scenario.roadNetwork);
  expect(asArray(roadNetwork.trafficLights)).toHaveLength(0);

  const autoCarInfo = asRecord(scenario.autoCarInfo);
  expect(asRecord(autoCarInfo.start)).toMatchObject({ x: 440010, y: 4410010, heading: 1.57 });
  expect(asRecord(autoCarInfo.end)).toMatchObject({ x: 440090, y: 4410050 });
  expect(autoCarInfo.startVelocity).toBe(6.5);
  expect(autoCarInfo.startAcceleration).toBe(0.4);
  const routingRequest = asRecord(autoCarInfo.routingRequest);
  const waypoint = asArray(routingRequest.waypoint).map(asRecord);
  expect(asRecord(waypoint[0]?.pose)).toMatchObject({ x: 440045, y: 4410030 });

  const storyboard = asRecord(scenario.storyboard);
  const init = asRecord(storyboard.init);
  const actions = asRecord(init.actions);
  const privates = asArray(actions.privates).map(asRecord);
  const liveNames = new Set(objects.map((object) => String(object.name)));
  expect(privates.map((entry) => asRecord(entry.entityRef).entityRef).sort()).toEqual(
    [...liveNames].sort(),
  );
  const vehiclePrivate = privates.find(
    (entry) => asRecord(entry.entityRef).entityRef === exportedVehicleName,
  );
  expect(vehiclePrivate).toBeTruthy();
  const privateActions = asArray(asRecord(vehiclePrivate).privateActions).map(asRecord);
  const routingActionHolder = privateActions.find((entry) => 'routingAction' in entry);
  expect(routingActionHolder).toBeTruthy();
  const routingAction = asRecord(asRecord(routingActionHolder).routingAction);
  const followTrajectoryAction = asRecord(routingAction.followTrajectoryAction);
  const trajectoryRef = asRecord(followTrajectoryAction.trajectoryRef);
  const trajectory = asRecord(trajectoryRef.trajectory);
  const shape = asRecord(trajectory.shape);
  const polyline = asRecord(shape.polyline);
  const vertices = asArray(polyline.vertices);
  expect(vertices).toHaveLength(3);
}

function entityKind(object: Record<string, unknown>): string {
  const entityObject = asRecord(object.entityObject);
  if ('pedestrian' in entityObject) return 'pedestrian';
  if ('unknownUnmovableObject' in entityObject) return 'staticObstacle';
  const vehicle = asRecord(entityObject.vehicle);
  return vehicle.vehicleCategory === 'bicycle' ? 'bicycle' : 'vehicle';
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(Array.isArray(value)).toBe(false);
  expect(typeof value).toBe('object');
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

type SceneTool =
  | 'select'
  | 'placeVehicle'
  | 'placePedestrian'
  | 'placeBicycle'
  | 'placeStatic'
  | 'placeTrafficLight'
  | 'drawTrajectory'
  | 'setEgoStart'
  | 'setEgoEnd'
  | 'addWaypoint';

class CanvasClickHelper {
  private constructor(
    private readonly page: Page,
    private readonly canvas: Locator,
  ) {}

  static async create(page: Page): Promise<CanvasClickHelper> {
    await expect(page.getByTestId('workspace-panel-map')).toBeVisible({ timeout: 15_000 });
    const canvas = page.getByTestId('map-canvas').locator('canvas.maplibregl-canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(
      (selector) => {
        const node = document.querySelector<HTMLCanvasElement>(selector);
        if (!node) return false;

        const first = node.getBoundingClientRect();
        if (first.width <= 300 || first.height <= 300 || node.width <= 0 || node.height <= 0) {
          return false;
        }

        return new Promise<boolean>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const second = node.getBoundingClientRect();
              resolve(
                second.width === first.width &&
                  second.height === first.height &&
                  node.width > 0 &&
                  node.height > 0,
              );
            });
          });
        });
      },
      '[data-testid="map-canvas"] canvas.maplibregl-canvas',
      { timeout: 30_000 },
    );
    return new CanvasClickHelper(page, canvas);
  }

  async clickRatio(xRatio: number, yRatio: number): Promise<CanvasTarget> {
    const point = await this.relativePoint(xRatio, yRatio);
    await this.click(point);
    return { ...point, xRatio, yRatio };
  }

  async click(point: Point): Promise<void> {
    await this.expectPointInsideCanvas(point);
    await this.page.mouse.click(point.x, point.y);
  }

  async pointForTarget(target: CanvasTarget): Promise<Point> {
    return this.relativePoint(target.xRatio, target.yRatio);
  }

  async waitForScenarioRender(): Promise<void> {
    await this.page.waitForTimeout(120);
    await waitForFrames(this.page, 3);
  }

  async waitForScenarioFit(): Promise<void> {
    await this.page.waitForTimeout(1_500);
    await waitForFrames(this.page, 3);
  }

  private async relativePoint(xRatio: number, yRatio: number): Promise<Point> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');
    return {
      x: box.x + box.width * xRatio,
      y: box.y + box.height * yRatio,
    };
  }

  private async expectPointInsideCanvas(point: Point): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Map canvas did not have a bounding box');
    expect(point.x).toBeGreaterThanOrEqual(box.x);
    expect(point.x).toBeLessThanOrEqual(box.x + box.width);
    expect(point.y).toBeGreaterThanOrEqual(box.y);
    expect(point.y).toBeLessThanOrEqual(box.y + box.height);
  }
}

async function waitForFrames(page: Page, count: number): Promise<void> {
  try {
    await waitForAnimationFrames(page, count);
  } catch (error) {
    if (!isNavigationContextLoss(error)) throw error;
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await expect(page.getByTestId('workspace-layout')).toBeVisible({ timeout: 10_000 });
    await expectScenarioLoaded(page);
    await waitForAnimationFrames(page, count);
  }
}

async function waitForAnimationFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        const tick = (remaining: number) => {
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(() => tick(remaining - 1));
        };
        tick(frames);
      }),
    count,
  );
}

function isNavigationContextLoss(error: unknown): boolean {
  return (
    error instanceof Error && /Execution context was destroyed|navigation/i.test(error.message)
  );
}
