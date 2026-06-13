import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

type Point = { x: number; y: number };
type CanvasTarget = Point & { xRatio: number; yRatio: number };
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${
    process.env.PLAYWRIGHT_PREVIEW_PORT ??
    process.env.PLAYWRIGHT_DEV_SERVER_PORT ??
    process.env.E2E_PORT ??
    4173
  }`;
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
    await expectScenarioBrowserSummary(page, {
      obstacleCount: 4,
      trafficLightCount: 0,
      obstacleRows: ['1 · vehicle', '2 · pedestrian', '3 · bicycle', '4 · staticObstacle'],
    });
    await expectTimelineTracks(page, [
      'Ego',
      '1 · vehicle',
      '2 · pedestrian',
      '3 · bicycle',
      '4 · staticObstacle',
    ]);

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
    await editSelectedTrafficLight(page);
    await expectScenarioBrowserSummary(page, {
      obstacleCount: 4,
      trafficLightCount: 1,
      obstacleRows: ['1 · vehicle', '2 · pedestrian', '3 · bicycle', '4 · staticObstacle'],
    });
    await expectTimelineTracks(page, ['Signal Signal_E2E_Edited']);

    await selectSceneObjectAt(page, canvas, pedestrianPoint, 'pedestrian');
    await editSelectedObstacle(page);
    await expectScenarioBrowserSummary(page, {
      obstacleCount: 4,
      trafficLightCount: 1,
      obstacleRows: ['2 · pedestrian'],
    });

    const egoStartPoint = await setEgoPoint(page, canvas, 'setEgoStart', 0.42, 0.34);
    await setEgoPoint(page, canvas, 'setEgoEnd', 0.68, 0.34);
    await setEgoPoint(page, canvas, 'addWaypoint', 0.55, 0.3);
    await selectSceneObjectAt(page, canvas, egoStartPoint, '起点 (世界米)');
    const canvasEgoSnapshot = await expectEgoInspectorReflectsCanvasEdits(page);

    await installDownloadTextCapture(page);
    const canvasEgoExport = await exportCurrentScenario(page);
    assertExportedEgoMatchesSnapshot(canvasEgoExport, canvasEgoSnapshot);

    await editSelectedEgo(page);

    await selectSceneObjectAt(page, canvas, vehiclePoint, 'vehicle');
    await drawTrajectoryOnSelectedVehicle(page, canvas);
    await expectScenarioBrowserSummary(page, {
      obstacleCount: 4,
      trafficLightCount: 1,
      obstacleRows: ['1 · vehicle'],
      moving: true,
    });
    await expectTimelineKeyframe(page, 'move @ 0.00s');

    const exported = await exportCurrentScenario(page);
    assertExportedScene(exported);
  });

  test('cancels draft trajectories and double-click commits a new vehicle when none is selected', async ({
    ams,
    page,
  }) => {
    await ams.gotoWorkspace();
    await ams.switchMode('scene');
    await ams.expectStatusField('app-mode', '场景');

    const canvas = await CanvasClickHelper.create(page);
    await loadBlankScenario(ams);
    await canvas.waitForScenarioFit();
    await installDownloadTextCapture(page);

    await selectSceneTool(page, 'drawTrajectory');
    await canvas.clickRatio(0.3, 0.48);
    await canvas.clickRatio(0.4, 0.48);
    await page.keyboard.press('Escape');
    await canvas.waitForScenarioRender();

    await canvas.clickRatio(0.46, 0.45);
    await canvas.clickRatio(0.56, 0.42);
    await canvas.dblclickRatio(0.66, 0.46);
    await canvas.waitForScenarioRender();

    const panel = inspector(page);
    await expect(panel).toContainText('vehicle');
    await expect(panel).toContainText('轨迹顶点 (世界米)');
    await expect(panel.getByLabel(/^点 1 X$/)).toBeVisible();
    await expect(panel.getByLabel(/^点 2 X$/)).toBeVisible();
    await expect(panel.getByLabel(/^点 3 X$/)).toBeVisible();
    await expect(panel.getByLabel(/^点 4 X$/)).toHaveCount(0);

    const exported = await exportCurrentScenario(page);
    assertSingleNewVehicleTrajectory(exported, 3);
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

async function editSelectedObstacle(page: Page) {
  const panel = inspector(page);
  await panel.getByLabel(/^类型$/).selectOption('pedestrian');
  await expect(panel.getByLabel(/^类型$/)).toHaveValue('pedestrian');

  await fillNumber(panel.getByLabel(/^X$/), '440111');
  await fillNumber(panel.getByLabel(/^长$/), '3.5');
  await fillNumber(panel.getByLabel(/^初速 \(m\/s\)$/), '4.2');
  await expectInspectorToContain(page, 'pedestrian');
}

async function editSelectedTrafficLight(page: Page) {
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
  await expect(panel.getByLabel(/^Signal ID$/)).toHaveValue('Signal_E2E_Edited');
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

type EgoInspectorSnapshot = {
  start: Point & { h: number };
  end: Point;
  waypoint: Point;
};

async function expectEgoInspectorReflectsCanvasEdits(page: Page): Promise<EgoInspectorSnapshot> {
  const panel = inspector(page);
  const start = formSection(panel, '起点 (世界米)');
  const end = formSection(panel, '终点 (世界米)');

  const snapshot = {
    start: {
      x: await readNumber(start.getByLabel(/^X$/)),
      y: await readNumber(start.getByLabel(/^Y$/)),
      h: await readNumber(start.getByLabel(/^朝向 \(rad\)$/)),
    },
    end: {
      x: await readNumber(end.getByLabel(/^X$/)),
      y: await readNumber(end.getByLabel(/^Y$/)),
    },
    waypoint: {
      x: await readNumber(panel.getByLabel(/^点 1 X$/)),
      y: await readNumber(panel.getByLabel(/^点 1 Y$/)),
    },
  };

  expect(snapshot.start).not.toMatchObject({ x: 440000, y: 4410000 });
  expect(snapshot.end).not.toMatchObject({ x: 440080, y: 4410040 });
  expect(snapshot.waypoint.x).toBeGreaterThan(0);
  expect(snapshot.waypoint.y).toBeGreaterThan(0);
  expect(snapshot.start.h).toBe(0);
  return snapshot;
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

async function expectScenarioBrowserSummary(
  page: Page,
  expected: {
    obstacleCount: number;
    trafficLightCount: number;
    obstacleRows: string[];
    moving?: boolean;
  },
) {
  await page.getByTestId('activity-scenarios').click();
  const browser = page.getByTestId('workspace-panel-sidebar');
  await expect(browser).toContainText('scene-authoring-e2e.json');
  await expect(browser).toContainText(
    new RegExp(
      `scene-authoring-e2e\\.json\\s*${expected.obstacleCount}\\s*${expected.trafficLightCount}`,
    ),
  );
  await expect(browser).toContainText(`障碍物 (${expected.obstacleCount})`);
  for (const row of expected.obstacleRows) {
    await expect(
      browser.getByRole('button', { name: new RegExp(escapeRegExp(row)) }),
    ).toBeVisible();
  }
  if (expected.moving) {
    await expect(browser.getByRole('button', { name: /1 · vehicle.*动/ })).toBeVisible();
  }
}

async function expectTimelineTracks(page: Page, trackNames: string[]) {
  const timeline = await ensureTimelinePanelVisible(page);
  for (const name of trackNames) {
    await expect(timeline.getByText(name, { exact: true })).toBeVisible();
  }
}

async function expectTimelineKeyframe(page: Page, title: string) {
  const timeline = await ensureTimelinePanelVisible(page);
  await expect(timeline.locator(`[title="${cssAttr(title)}"]`)).toBeVisible();
}

async function ensureTimelinePanelVisible(page: Page): Promise<Locator> {
  const timeline = page.getByTestId('workspace-panel-timeline');
  if (await timeline.isVisible().catch(() => false)) return timeline;
  await page.getByRole('button', { name: /^Timeline$/ }).click();
  await expect(timeline).toBeVisible({ timeout: 10_000 });
  return timeline;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formSection(panel: Locator, title: string): Locator {
  return panel.getByText(title, { exact: true }).locator('xpath=..');
}

async function fillNumber(locator: Locator, value: string) {
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}

async function readNumber(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const value = Number(await locator.inputValue());
  expect(Number.isFinite(value)).toBe(true);
  return value;
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

async function exportCurrentScenario(page: Page): Promise<unknown> {
  const before = await downloadCount(page);
  await page.getByRole('button', { name: /^导出$/ }).click();
  await expect(page.getByText('已导出当前场景')).toBeVisible();
  return readLatestExport(page, before);
}

async function downloadCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__sceneAuthoringE2E?.downloads.length ?? 0);
}

async function readLatestExport(page: Page, previousCount: number): Promise<unknown> {
  await page.waitForFunction(
    (count) => {
      const downloads = window.__sceneAuthoringE2E?.downloads ?? [];
      const latest = downloads[downloads.length - 1];
      return downloads.length > count && Boolean(latest?.text || latest?.error);
    },
    previousCount,
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

function assertExportedEgoMatchesSnapshot(exported: unknown, snapshot: EgoInspectorSnapshot) {
  const root = asRecord(exported);
  const scenario = asRecord(root.scenario);
  const autoCarInfo = asRecord(scenario.autoCarInfo);
  const start = asRecord(autoCarInfo.start);
  const end = asRecord(autoCarInfo.end);
  const routingRequest = asRecord(autoCarInfo.routingRequest);
  const waypoint = asArray(routingRequest.waypoint).map(asRecord);

  expect(Number(start.x)).toBeCloseTo(snapshot.start.x, 5);
  expect(Number(start.y)).toBeCloseTo(snapshot.start.y, 5);
  expect(Number(start.heading)).toBeCloseTo(snapshot.start.h, 5);
  expect(Number(end.x)).toBeCloseTo(snapshot.end.x, 5);
  expect(Number(end.y)).toBeCloseTo(snapshot.end.y, 5);
  expect(waypoint).toHaveLength(1);
  expect(Number(asRecord(waypoint[0]?.pose).x)).toBeCloseTo(snapshot.waypoint.x, 5);
  expect(Number(asRecord(waypoint[0]?.pose).y)).toBeCloseTo(snapshot.waypoint.y, 5);
}

function assertSingleNewVehicleTrajectory(exported: unknown, vertexCount: number) {
  const root = asRecord(exported);
  const scenario = asRecord(root.scenario);
  const entities = asRecord(scenario.entities);
  const objects = asArray(entities.scenarioObjects).map(asRecord);
  expect(objects.map(entityKind)).toEqual(['vehicle']);

  const storyboard = asRecord(scenario.storyboard);
  const init = asRecord(storyboard.init);
  const actions = asRecord(init.actions);
  const privates = asArray(actions.privates).map(asRecord);
  expect(privates).toHaveLength(1);
  const privateActions = asArray(asRecord(privates[0]).privateActions).map(asRecord);
  const routingActionHolder = privateActions.find((entry) => 'routingAction' in entry);
  expect(routingActionHolder).toBeTruthy();
  const routingAction = asRecord(asRecord(routingActionHolder).routingAction);
  const followTrajectoryAction = asRecord(routingAction.followTrajectoryAction);
  const trajectoryRef = asRecord(followTrajectoryAction.trajectoryRef);
  const trajectory = asRecord(trajectoryRef.trajectory);
  const shape = asRecord(trajectory.shape);
  const polyline = asRecord(shape.polyline);
  expect(asArray(polyline.vertices)).toHaveLength(vertexCount);
}

function assertExportedScene(exported: unknown) {
  const root = asRecord(exported);
  const scenario = asRecord(root.scenario);
  const entities = asRecord(scenario.entities);
  const objects = asArray(entities.scenarioObjects).map(asRecord);
  const kinds = objects.map(entityKind);
  expect(kinds).toEqual(['vehicle', 'pedestrian', 'bicycle', 'staticObstacle']);
  const exportedVehicle = objects.find((object) => entityKind(object) === 'vehicle');
  expect(exportedVehicle).toBeTruthy();
  const exportedVehicleName = String(asRecord(exportedVehicle).name);
  const exportedPedestrian = objects.find((object) => entityKind(object) === 'pedestrian');
  expect(exportedPedestrian).toBeTruthy();
  const exportedPedestrianName = String(asRecord(exportedPedestrian).name);
  const pedestrianObject = asRecord(asRecord(exportedPedestrian).entityObject);
  const pedestrian = asRecord(pedestrianObject.pedestrian);
  const pedestrianBox = asRecord(pedestrian.boundingBox);
  expect(asRecord(pedestrianBox.dimensions)).toMatchObject({ length: 3.5 });

  const roadNetwork = asRecord(scenario.roadNetwork);
  const trafficLights = asArray(roadNetwork.trafficLights).map(asRecord);
  expect(trafficLights).toHaveLength(1);
  expect(trafficLights[0]).toMatchObject({ id: 'Signal_E2E_Edited', triggerValue: 12 });
  expect(asRecord(trafficLights[0]?.initialState)).toMatchObject({ color: 'YELLOW' });
  const stateGroup = asArray(trafficLights[0]?.stateGroup).map(asRecord);
  expect(stateGroup).toHaveLength(3);
  expect(stateGroup[0]).toMatchObject({ color: 'RED', keepTime: 8 });

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
  const pedestrianPrivate = privates.find(
    (entry) => asRecord(entry.entityRef).entityRef === exportedPedestrianName,
  );
  expect(pedestrianPrivate).toBeTruthy();
  const pedestrianActions = asArray(asRecord(pedestrianPrivate).privateActions).map(asRecord);
  const pedestrianTeleport = asRecord(pedestrianActions.find((entry) => 'teleportAction' in entry));
  const pedestrianWorldPosition = asRecord(
    asRecord(asRecord(pedestrianTeleport.teleportAction).position).worldPosition,
  );
  expect(pedestrianWorldPosition).toMatchObject({ x: 440111 });
  const pedestrianSpeed = asRecord(
    pedestrianActions.find((entry) => 'longitudinalAction' in entry),
  );
  const speedAction = asRecord(asRecord(pedestrianSpeed.longitudinalAction).speedAction);
  const speedActionTarget = asRecord(speedAction.speedActionTarget);
  expect(asRecord(speedActionTarget.absoluteTargetSpeed)).toMatchObject({ value: 4.2 });

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

  async dblclickRatio(xRatio: number, yRatio: number): Promise<CanvasTarget> {
    const point = await this.relativePoint(xRatio, yRatio);
    await this.dblclick(point);
    return { ...point, xRatio, yRatio };
  }

  async click(point: Point): Promise<void> {
    await this.expectPointInsideCanvas(point);
    await this.page.mouse.click(point.x, point.y);
  }

  async dblclick(point: Point): Promise<void> {
    await this.expectPointInsideCanvas(point);
    await this.page.mouse.dblclick(point.x, point.y);
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
