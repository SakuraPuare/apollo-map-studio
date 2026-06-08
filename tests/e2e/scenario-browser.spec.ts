import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';
import { selectors } from './helpers/selectors';
import type { AmsE2EApp } from './helpers/app';

const OPEN_SCENARIO = {
  id: 'open-fixture',
  type: 'worldsim',
  mapId: 'scenario-e2e-map',
  tags: ['e2e'],
  scenario: {
    roadNetwork: {
      logicFile: { filepath: 'modules/map/data/scenario_e2e' },
      trafficLights: [
        {
          id: 'signal_main',
          location: { x: 12, y: 4 },
          triggerType: 'TIME',
          triggerValue: 3,
          initialState: { color: 'GREEN' },
          stateGroup: [
            { color: 'GREEN', keepTime: 3 },
            { color: 'RED', keepTime: 5 },
          ],
        },
      ],
    },
    entities: {
      scenarioObjects: [
        {
          name: 'car_alpha',
          id: 101,
          entityObject: {
            vehicle: {
              vehicleCategory: 'car',
              boundingBox: { dimensions: { length: 4.5, width: 2, height: 1.6 } },
            },
          },
        },
        {
          name: 'person_beta',
          id: 102,
          entityObject: {
            pedestrian: {
              pedestrianCategory: 'pedestrian',
              boundingBox: { dimensions: { length: 0.5, width: 0.5, height: 1.8 } },
            },
          },
        },
      ],
    },
    storyboard: {
      init: {
        actions: {
          privates: [
            {
              entityRef: { entityRef: 'car_alpha' },
              privateActions: [
                {
                  teleportAction: {
                    position: { worldPosition: { x: 1, y: 1, h: 0 } },
                  },
                },
                {
                  longitudinalAction: {
                    speedAction: {
                      speedActionDynamics: {
                        dynamicsDimension: 'distance',
                        dynamicsShape: 'linear',
                        value: 0,
                      },
                      speedActionTarget: { absoluteTargetSpeed: { value: 4 } },
                    },
                  },
                },
                {
                  routingAction: {
                    followTrajectoryAction: {
                      trajectoryRef: {
                        trajectory: {
                          shape: {
                            polyline: {
                              vertices: [
                                { position: { worldPosition: { x: 1, y: 1, h: 0 } } },
                                { position: { worldPosition: { x: 8, y: 1, h: 0 } } },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
            {
              entityRef: { entityRef: 'person_beta' },
              privateActions: [
                {
                  teleportAction: {
                    position: { worldPosition: { x: 3, y: 2, h: 1.57 } },
                  },
                },
              ],
            },
          ],
        },
      },
      stories: [],
      stopTrigger: {
        conditionGroups: [
          {
            conditions: [
              {
                name: 'end',
                conditionEdge: 'none',
                byValueCondition: {
                  simulationTimeCondition: { rule: 'greaterOrEqual', value: 30 },
                },
              },
            ],
          },
        ],
      },
    },
    autoCarInfo: {
      start: { x: 0, y: 0, heading: 0 },
      end: { x: 20, y: 0 },
      routingRequest: { waypoint: [] },
      startVelocity: 0,
    },
  },
};

const CLASSIC_SCENARIO = {
  id: 'classic-fixture',
  type: 'worldsim',
  mapId: 'scenario-e2e-map',
  tags: ['e2e'],
  scenario: {
    start: { x: 0, y: 0, heading: 0 },
    end: { x: 15, y: 0 },
    mapDir: 'modules/map/data/scenario_e2e',
    simulatorTime: 45,
    agent: [
      {
        id: 202,
        type: 'VEHICLE',
        length: 4.2,
        width: 1.9,
        height: 1.5,
        startPosition: { x: 2, y: 3, heading: 0, speed: 2 },
        startVelocity: 2,
        motiontype: 'TRACKED',
        triggerType: 'TIME',
        startDistance: 1,
        trackedPoint: [
          { x: 2, y: 3, speed: 2 },
          { x: 10, y: 3, speed: 2 },
        ],
      },
    ],
    trafficLights: [],
  },
};

test.describe('ScenarioBrowser scene E2E', () => {
  test.beforeEach(async ({ ams }) => {
    await ams.gotoWorkspace();
    await installDownloadTextCapture(ams.page);
    expect(await ams.readMockState()).toMatchObject({ downloads: [], pickerRequests: [] });
  });

  test('switches scene mode, opens Scenarios, and verifies Timeline/ToolStrip linkage', async ({
    ams,
  }) => {
    const { page } = ams;

    await expect(page.locator(selectors.workspace.panel('timeline'))).toHaveCount(0);
    await expect(page.locator(selectors.activity.button('scenarios'))).toHaveCount(0);
    await expect(page.locator(selectors.activity.button('layers'))).toBeVisible();
    await expect(page.locator(selectors.mode.button('drawing'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('action-defaultMode')).toBeVisible();
    await expect(page.getByTestId('element-lane')).toBeVisible();
    await expect(page.getByTestId('scene-tool-placeVehicle')).toHaveCount(0);
    await assertViewMenuItem(page, 'view:timeline', false);
    await assertViewMenuItem(page, 'view:scenarios', false);

    await switchAppMode(ams, 'scene');
    await expect(page.locator(selectors.mode.button('scene'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const timeline = timelinePanel(page);
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText('00:00.00');
    await expect(timeline).toContainText('00:30.00');
    await expect(page.locator(selectors.activity.button('scenarios'))).toBeVisible();
    await expect(page.locator(selectors.activity.button('layers'))).toBeVisible();
    for (const tool of [
      'select',
      'placeVehicle',
      'placePedestrian',
      'placeBicycle',
      'placeStatic',
      'placeTrafficLight',
      'drawTrajectory',
      'setEgoStart',
      'setEgoEnd',
      'addWaypoint',
    ]) {
      await expect(page.getByTestId(`scene-tool-${tool}`)).toBeVisible();
    }
    await expect(page.getByTestId('scene-tool-select')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('element-lane')).toHaveCount(0);
    await expect(page.getByTestId('action-defaultMode')).toHaveCount(0);
    await expect(page.getByTestId('action-connectLanes')).toHaveCount(0);
    await expect(page.getByTestId('action-boundaryBrush')).toHaveCount(0);
    await page.getByTestId('scene-tool-placeVehicle').click();
    await expect(page.getByTestId('scene-tool-placeVehicle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('scene-tool-select')).toHaveAttribute('aria-pressed', 'false');
    await assertViewMenuItem(page, 'view:timeline', true);
    await assertViewMenuItem(page, 'view:scenarios', true);

    const browser = await openScenarioBrowser(ams);
    await expect(browser.getByText('选择 Apollo 场景 JSON 文件以加载')).toBeVisible();
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeDisabled();

    await switchAppMode(ams, 'drawing');
    await expect(page.locator(selectors.mode.button('drawing'))).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(selectors.workspace.panel('timeline'))).toHaveCount(0);
    await expect(page.locator(selectors.activity.button('scenarios'))).toHaveCount(0);
    await expect(page.getByTestId('action-defaultMode')).toBeVisible();
    await expect(page.getByTestId('element-lane')).toBeVisible();
    await expect(page.getByTestId('scene-tool-placeVehicle')).toHaveCount(0);
    await expect(page.getByTestId('scene-tool-drawTrajectory')).toHaveCount(0);
    await expect(page.getByTestId('scene-tool-setEgoStart')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^打开场景$/ })).toHaveCount(0);
    await assertViewMenuItem(page, 'view:timeline', false);
    await assertViewMenuItem(page, 'view:scenarios', false);
  });

  test('creates openscenario and classic scenarios and exports the active scenario', async ({
    ams,
  }) => {
    const browser = await openScenarioBrowser(ams);
    const format = browser.getByRole('combobox', { name: '新建场景格式' });

    await expect(format).toHaveValue('openscenario');
    await browser.getByRole('button', { name: /^新建$/ }).click();
    await chooseDefaultProjection(ams.page);
    await expect(browser.getByText('已新建空场景（openscenario）')).toBeVisible();
    await expectScenarioRow(browser, 'untitled-openscenario.json', { active: true, counts: '0 0' });
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeEnabled();

    await format.selectOption('classic');
    await expect(format).toHaveValue('classic');
    await expectScenarioRow(browser, 'untitled-openscenario.json', { active: true, counts: '0 0' });
    await browser.getByRole('button', { name: /^新建$/ }).click();
    await expect(browser.getByText('已新建空场景（classic）')).toBeVisible();
    await expectScenarioRow(browser, 'untitled-openscenario.json', {
      active: false,
      counts: '0 0',
    });
    await expectScenarioRow(browser, 'untitled-classic.json', { active: true, counts: '0 0' });

    await browser.getByRole('button', { name: /^导出$/ }).click();
    await expect(browser.getByText('已导出当前场景')).toBeVisible();
    await expectDownloads(ams, ['untitled-classic.json']);
    const [download] = await expectDownloadTexts(ams.page, ['untitled-classic.json']);
    expectClassicExport(download!.text);
  });

  test('loads scenario fixtures, switches active scenario, removes rows, and exports', async ({
    ams,
  }) => {
    const browser = await openScenarioBrowser(ams);

    await browser.getByRole('button', { name: /^新建$/ }).click();
    await chooseDefaultProjection(ams.page);
    await expectScenarioRow(browser, 'untitled-openscenario.json', {
      active: true,
      counts: '0 0',
    });

    await ams.setNextPickerFiles([
      scenarioFile('open-fixture.json', OPEN_SCENARIO),
      scenarioFile('classic-fixture.json', CLASSIC_SCENARIO),
      { name: 'malformed-fixture.json', mimeType: 'application/json', text: '{' },
    ]);
    await browser.getByRole('button', { name: /^打开场景$/ }).click();

    await expect(browser.getByText('已加载 2 个场景，1 个失败')).toBeVisible();
    await expectPickerRequests(ams, [
      {
        accept: 'application/json,.json',
        multiple: true,
        names: ['open-fixture.json', 'classic-fixture.json', 'malformed-fixture.json'],
      },
    ]);

    await expectScenarioRow(browser, 'open-fixture.json', { active: false, counts: '2 1' });
    await expectScenarioRow(browser, 'classic-fixture.json', { active: true, counts: '1 0' });
    await expectScenarioRow(browser, 'untitled-openscenario.json', {
      active: false,
      counts: '0 0',
    });
    await expect(browser.getByText('障碍物 (1)', { exact: true })).toBeVisible();
    await expect(browser.getByRole('button', { name: /^202 · vehicle\s+动$/ })).toBeVisible();
    await expect(timelinePanel(ams.page)).toContainText('00:45.00');

    await scenarioRow(browser, 'open-fixture.json').click();
    await expectScenarioRow(browser, 'open-fixture.json', { active: true, counts: '2 1' });
    await expectScenarioRow(browser, 'classic-fixture.json', { active: false, counts: '1 0' });
    await expect(browser.getByText('障碍物 (2)', { exact: true })).toBeVisible();
    await expect(browser.getByRole('button', { name: /^car_alpha · vehicle\s+动$/ })).toBeVisible();
    await expect(browser.getByRole('button', { name: /^person_beta · pedestrian$/ })).toBeVisible();
    await expect(browser.getByText('signal_main')).toHaveCount(0);
    await expect(timelinePanel(ams.page)).toContainText('00:30.00');

    await browser.getByRole('button', { name: /^导出$/ }).click();
    await expect(browser.getByText('已导出当前场景')).toBeVisible();
    await expectDownloads(ams, ['open-fixture.json']);
    const [download] = await expectDownloadTexts(ams.page, ['open-fixture.json']);
    expectOpenScenarioExport(download!.text);

    await browser.getByRole('button', { name: /^移除 open-fixture\.json$/ }).click();
    await expect(scenarioRow(browser, 'open-fixture.json')).toHaveCount(0);
    await expectScenarioRow(browser, 'untitled-openscenario.json', {
      active: true,
      counts: '0 0',
    });
    await expectScenarioRow(browser, 'classic-fixture.json', { active: false, counts: '1 0' });

    await browser.getByRole('button', { name: /^移除 untitled-openscenario\.json$/ }).click();
    await expectScenarioRow(browser, 'classic-fixture.json', { active: true, counts: '1 0' });

    await browser.getByRole('button', { name: /^导出$/ }).click();
    await expect(browser.getByText('已导出当前场景')).toBeVisible();
    await expectDownloads(ams, ['open-fixture.json', 'classic-fixture.json']);
    const downloads = await expectDownloadTexts(ams.page, [
      'open-fixture.json',
      'classic-fixture.json',
    ]);
    expectLoadedClassicExport(downloads[1]!.text);

    await browser.getByRole('button', { name: /^移除 classic-fixture\.json$/ }).click();
    await expect(scenarioRow(browser, 'classic-fixture.json')).toHaveCount(0);
    await expect(browser.getByText('选择 Apollo 场景 JSON 文件以加载')).toBeVisible();
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeDisabled();
  });

  test('covers picker cancel, projection cancel, and load error paths', async ({ ams }) => {
    const browser = await openScenarioBrowser(ams);
    const load = browser.getByRole('button', { name: /^打开场景$/ });
    const create = browser.getByRole('button', { name: /^新建$/ });

    await ams.setNextPickerFiles([]);
    await load.click();
    await expect(browser.getByText('选择 Apollo 场景 JSON 文件以加载')).toBeVisible();
    await expect(load).toBeEnabled();
    await expect(load).toHaveText(/打开场景/);
    await expect(ams.page.getByRole('dialog', { name: /Choose Coordinate System/ })).toHaveCount(0);
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeDisabled();
    await expect(browser.getByRole('button', { name: /json/ })).toHaveCount(0);
    await expectPickerRequests(ams, [
      { accept: 'application/json,.json', multiple: true, names: [] },
    ]);
    await expectDownloads(ams, []);

    await create.click();
    await cancelProjection(ams.page);
    await expect(scenarioRow(browser, 'untitled-openscenario.json')).toHaveCount(0);
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeDisabled();

    await ams.setNextPickerFiles([scenarioFile('cancelled-open-fixture.json', OPEN_SCENARIO)]);
    await load.click();
    await expectPickerRequests(ams, [
      { accept: 'application/json,.json', multiple: true, names: [] },
      {
        accept: 'application/json,.json',
        multiple: true,
        names: ['cancelled-open-fixture.json'],
      },
    ]);
    await cancelProjection(ams.page);
    await expect(scenarioRow(browser, 'cancelled-open-fixture.json')).toHaveCount(0);
    await expect(browser.getByText('选择 Apollo 场景 JSON 文件以加载')).toBeVisible();
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeDisabled();

    await ams.setNextPickerFiles([
      {
        name: 'unknown-scenario.json',
        mimeType: 'application/json',
        text: '{"scenario":{"nope":true}}',
      },
      { name: 'bad-json.json', mimeType: 'application/json', text: '{' },
    ]);
    await load.click();
    await chooseDefaultProjection(ams.page);
    await expect(browser.getByText('已加载 0 个场景，2 个失败')).toBeVisible();
    await expect(browser.getByText('选择 Apollo 场景 JSON 文件以加载')).toBeVisible();
    await expect(scenarioRow(browser, 'unknown-scenario.json')).toHaveCount(0);
    await expect(scenarioRow(browser, 'bad-json.json')).toHaveCount(0);
    await expect(browser.getByText(/障碍物 \(/)).toHaveCount(0);
    await expect(browser.getByRole('button', { name: /^导出$/ })).toBeDisabled();
    await expectPickerRequests(ams, [
      { accept: 'application/json,.json', multiple: true, names: [] },
      {
        accept: 'application/json,.json',
        multiple: true,
        names: ['cancelled-open-fixture.json'],
      },
      {
        accept: 'application/json,.json',
        multiple: true,
        names: ['unknown-scenario.json', 'bad-json.json'],
      },
    ]);
    await expectDownloads(ams, []);
  });
});

async function openScenarioBrowser(ams: AmsE2EApp): Promise<Locator> {
  await switchAppMode(ams, 'scene');
  await expect(ams.page.locator(selectors.activity.button('scenarios'))).toBeVisible();
  await ams.openActivityPanel('scenarios');
  const browser = scenarioBrowser(ams.page);
  await expect(browser.getByRole('button', { name: /^打开场景$/ })).toBeVisible();
  return browser;
}

async function switchAppMode(ams: AmsE2EApp, mode: 'drawing' | 'scene'): Promise<void> {
  const expected = mode === 'scene' ? '场景' : '绘图';
  await expect
    .poll(
      async () => {
        try {
          await ams.waitForWorkspaceReady();
          const button = ams.page.locator(selectors.mode.button(mode));
          if ((await button.getAttribute('aria-pressed')) !== 'true') {
            await button.click({ timeout: 5_000 });
          }
          return (await ams.statusField('app-mode').textContent())?.trim() ?? '';
        } catch {
          return '';
        }
      },
      { timeout: 20_000 },
    )
    .toBe(expected);
}

function scenarioBrowser(page: Page): Locator {
  return page.locator(selectors.workspace.panel('sidebar'));
}

function scenarioList(browser: Locator): Locator {
  return browser.locator('ul').first();
}

function timelinePanel(page: Page): Locator {
  return page.locator(selectors.workspace.panel('timeline'));
}

async function chooseDefaultProjection(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /Choose Coordinate System/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Use this projection' }).click();
  await expect(dialog).toHaveCount(0);
}

async function cancelProjection(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /Choose Coordinate System/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
}

async function installDownloadTextCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    type DownloadTextRecord = { filename: string; text: string };
    const target = window as typeof window & {
      __scenarioBrowserE2E?: { downloadTexts: DownloadTextRecord[]; installed: boolean };
    };
    if (target.__scenarioBrowserE2E?.installed) return;

    const state = { downloadTexts: [] as DownloadTextRecord[], installed: true };
    target.__scenarioBrowserE2E = state;

    const blobByUrl = new Map<string, Blob>();
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = ((object: Blob | MediaSource) => {
      const url = originalCreateObjectURL(object);
      if (object instanceof Blob) blobByUrl.set(url, object);
      return url;
    }) as typeof URL.createObjectURL;

    type CreateElement = (
      this: Document,
      tagName: string,
      options?: ElementCreationOptions,
    ) => Element;
    const documentPrototype = Document.prototype as { createElement: CreateElement };
    const originalCreateElement = documentPrototype.createElement;
    documentPrototype.createElement = function createElement(
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
            if (blob) {
              void blob.text().then((text) => {
                state.downloadTexts.push({ filename: element.download, text });
              });
            }
          }
          originalClick();
        };
      }
      return element;
    };
  });
}

async function assertViewMenuItem(
  page: Page,
  actionId: 'view:timeline' | 'view:scenarios',
  visible: boolean,
): Promise<void> {
  await page.locator(selectors.menu.root('View')).click();
  await expect(page.locator(selectors.menu.item('resetLayout'))).toBeVisible();
  const item = page.locator(selectors.menu.item(actionId));
  if (visible) await expect(item).toBeVisible();
  else await expect(item).toHaveCount(0);
  await page.locator(selectors.workspace.main).click({ position: { x: 5, y: 5 } });
  await expect(item).toHaveCount(0);
}

function scenarioRow(browser: Locator, filename: string): Locator {
  return scenarioList(browser).getByRole('button', {
    name: new RegExp(`^${escapeRegExp(filename)}\\s+`),
  });
}

async function expectScenarioRow(
  browser: Locator,
  filename: string,
  options: { active: boolean; counts: string },
): Promise<void> {
  const row = scenarioRow(browser, filename);
  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(
    new RegExp(`^${escapeRegExp(filename)}\\s+${options.counts}$`),
  );
  if (options.active) await expect(row).toHaveAttribute('aria-current', 'true');
  else await expect(row).not.toHaveAttribute('aria-current', 'true');
}

async function expectPickerRequests(
  ams: AmsE2EApp,
  requests: Array<{ accept: string; multiple: boolean; names: string[] }>,
): Promise<void> {
  await expect
    .poll(() => ams.readMockState().then((state) => state.pickerRequests))
    .toEqual(requests);
}

async function expectDownloads(ams: AmsE2EApp, filenames: string[]): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const state = await ams.readMockState();
        return state.downloads.map((download) => ({
          filename: download.filename,
          type: download.type,
          hasBody: download.size > 0,
        }));
      } catch {
        return null;
      }
    })
    .toEqual(
      filenames.map((filename) => ({
        filename,
        type: 'application/json',
        hasBody: true,
      })),
    );
}

async function expectDownloadTexts(page: Page, filenames: string[]): Promise<DownloadTextRecord[]> {
  await expect
    .poll(() => readDownloadTexts(page).then((records) => records.map((r) => r.filename)))
    .toEqual(filenames);
  const records = await readDownloadTexts(page);
  for (const record of records) expect(record.text.trim().length).toBeGreaterThan(0);
  return records;
}

async function readDownloadTexts(page: Page): Promise<DownloadTextRecord[]> {
  return page.evaluate(() => {
    const target = window as typeof window & {
      __scenarioBrowserE2E?: { downloadTexts: DownloadTextRecord[] };
    };
    return [...(target.__scenarioBrowserE2E?.downloadTexts ?? [])];
  });
}

interface DownloadTextRecord {
  filename: string;
  text: string;
}

function expectClassicExport(text: string): void {
  const json = record(JSON.parse(text));
  const scenario = record(json.scenario);
  expect(json.type).toBe('worldsim');
  expect(array(scenario.agent)).toHaveLength(0);
  expect(array(scenario.trafficLights)).toHaveLength(0);
  expect(scenario.simulatorTime).toBe(100);
}

function expectLoadedClassicExport(text: string): void {
  const json = record(JSON.parse(text));
  const scenario = record(json.scenario);
  const agents = array(scenario.agent).map(record);
  const agent = agents[0]!;
  const trackedPoint = array(agent.trackedPoint).map(record);

  expect(json.id).toBe('classic-fixture');
  expect(json.mapId).toBe('scenario-e2e-map');
  expect(scenario.mapDir).toBe('modules/map/data/scenario_e2e');
  expect(scenario.simulatorTime).toBe(45);
  expect(agent.id).toBe(202);
  expect(agent.type).toBe('VEHICLE');
  expect(agent.startVelocity).toBe(2);
  expect(agent.triggerType).toBe('TIME');
  expect(agent.startDistance).toBe(1);
  expect(record(agent.startPosition)).toMatchObject({ x: 2, y: 3, heading: 0, speed: 2 });
  expect(trackedPoint).toHaveLength(2);
  expect(trackedPoint[1]).toMatchObject({ x: 10, y: 3, speed: 2 });
}

function expectOpenScenarioExport(text: string): void {
  const json = record(JSON.parse(text));
  const scenario = record(json.scenario);
  const roadNetwork = record(scenario.roadNetwork);
  const entities = record(scenario.entities);
  const storyboard = record(scenario.storyboard);
  const init = record(storyboard.init);
  const actions = record(init.actions);
  const autoCarInfo = record(scenario.autoCarInfo);
  const objects = array(entities.scenarioObjects).map(record);
  const lights = array(roadNetwork.trafficLights).map(record);
  const privates = array(actions.privates).map(record);
  const stopGroups = array(record(storyboard.stopTrigger).conditionGroups).map(record);
  const firstCondition = record(array(stopGroups[0]!.conditions)[0]);
  const simulationTimeCondition = record(
    record(firstCondition.byValueCondition).simulationTimeCondition,
  );
  const carPrivateActions = array(privates[0]!.privateActions).map(record);
  const carSpeed = record(
    record(record(carPrivateActions[1]!.longitudinalAction).speedAction).speedActionTarget,
  );
  const trajectory = record(
    record(record(carPrivateActions[2]!.routingAction).followTrajectoryAction).trajectoryRef,
  );
  const vertices = array(record(record(record(trajectory.trajectory).shape).polyline).vertices);
  const firstLightState = record(array(lights[0]!.stateGroup)[0]);

  expect(json.id).toBe('open-fixture');
  expect(json.mapId).toBe('scenario-e2e-map');
  expect(record(roadNetwork.logicFile).filepath).toBe('modules/map/data/scenario_e2e');
  expect(objects.map((object) => object.name)).toEqual(['car_alpha', 'person_beta']);
  expect(lights.map((light) => light.id)).toEqual(['signal_main']);
  expect(record(autoCarInfo.start).x).toBe(0);
  expect(record(autoCarInfo.end).x).toBe(20);
  expect(simulationTimeCondition.value).toBe(30);
  expect(record(carSpeed.absoluteTargetSpeed).value).toBe(4);
  expect(vertices).toHaveLength(2);
  expect(record(record(vertices[1]!).position).worldPosition).toMatchObject({ x: 8, y: 1 });
  expect(lights[0]!.triggerValue).toBe(3);
  expect(firstLightState).toMatchObject({ color: 'GREEN', keepTime: 3 });
}

function record(value: unknown): Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

function scenarioFile(name: string, json: unknown) {
  return { name, mimeType: 'application/json', text: JSON.stringify(json) };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
