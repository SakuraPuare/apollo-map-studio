import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';
import { selectors } from './helpers/selectors';

test.setTimeout(60_000);

test.describe('Timeline panel', () => {
  test('appears in scene mode with empty tracks when no scenario is active', async ({ ams }) => {
    await ams.gotoWorkspace();

    await expect(timelinePanel(ams.page)).toHaveCount(0);

    await switchToSceneTimeline(ams);
    const timeline = timelinePanel(ams.page);
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:30.00' });
    await expect(timeline.getByText('Ego', { exact: true })).toHaveCount(0);
    await expect(timeline.getByText('1 · vehicle', { exact: true })).toHaveCount(0);
    await expect(timeline.getByText('Signal TL-1', { exact: true })).toHaveCount(0);
    await expect(timeline.locator('[title*=" @ "]')).toHaveCount(0);
  });

  test('renders tracks and keyframes for loaded and newly created scenarios', async ({ ams }) => {
    await ams.gotoWorkspace();
    await switchToSceneTimeline(ams);

    await loadTimelineScenario(ams, { simulatorTime: 12, filename: 'timeline-fixture.json' });
    const timeline = timelinePanel(ams.page);

    await expect(timeline.getByText('Ego', { exact: true })).toBeVisible();
    await expect(timeline.getByText('1 · vehicle', { exact: true })).toBeVisible();
    await expect(timeline.getByText('Signal TL-1', { exact: true })).toBeVisible();
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:12.00' });
    await expectKeyframe(timeline, 'start @ 0.00s');
    await expectKeyframe(timeline, 'end @ 12.00s');
    await expectKeyframe(timeline, 'move @ 2.00s');
    await expectKeyframe(timeline, 'GREEN @ 1.00s');
    await expectKeyframe(timeline, 'RED @ 4.00s');

    await createBlankScenario(ams.page);
    await expect(timeline.getByText('Ego', { exact: true })).toBeVisible();
    await expect(timeline.getByText('1 · vehicle', { exact: true })).toHaveCount(0);
    await expect(timeline.getByText('Signal TL-1', { exact: true })).toHaveCount(0);
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '01:40.00' });
    await expectKeyframe(timeline, 'start @ 0.00s');
    await expectKeyframe(timeline, 'end @ 100.00s');

    await timelineControls(timeline).stepForward.click();
    await expectTimelineTimes(timeline, { current: '00:01.00', duration: '01:40.00' });

    const browser = scenarioBrowser(ams.page);
    await scenarioRow(browser, 'timeline-fixture.json').click();
    await expect(scenarioRow(browser, 'timeline-fixture.json')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:12.00' });
    await expect(timeline.getByText('1 · vehicle', { exact: true })).toBeVisible();
    await expect(timeline.getByText('Signal TL-1', { exact: true })).toBeVisible();
    await expectKeyframe(timeline, 'end @ 12.00s');
  });

  test('handles play, pause, stop, step, speed, and time clamping', async ({ ams }) => {
    await ams.gotoWorkspace();
    await switchToSceneTimeline(ams);
    await loadTimelineScenario(ams, { simulatorTime: 12, filename: 'timeline-playback.json' });

    const timeline = timelinePanel(ams.page);
    const controls = timelineControls(timeline);
    await expect(controls.buttons).toHaveCount(4);
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:12.00' });

    await controls.stepBack.click();
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:12.00' });

    await controls.stepForward.click();
    await expectTimelineTimes(timeline, { current: '00:01.00', duration: '00:12.00' });

    await controls.stepForward.click();
    await controls.stepBack.click();
    await expectTimelineTimes(timeline, { current: '00:01.00', duration: '00:12.00' });

    for (let index = 0; index < 20; index += 1) await controls.stepForward.click();
    await expectTimelineTimes(timeline, { current: '00:12.00', duration: '00:12.00' });

    await controls.stop.click();
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:12.00' });

    const speed = timeline.locator('select[title="Playback speed"]');
    await expect(speed).toHaveValue('1');
    await speed.selectOption('4');
    await expect(speed).toHaveValue('4');

    await controls.play.click();
    await expect(controls.pause).toBeVisible();
    await expect.poll(() => readTimelineSeconds(timeline)).toBeGreaterThan(0);
    await controls.pause.click();
    await expect(controls.play).toBeVisible();

    await controls.stop.click();
    await expectTimelineTimes(timeline, { current: '00:00.00', duration: '00:12.00' });
  });
});

async function switchToSceneTimeline(ams: {
  page: Page;
  switchMode(mode: 'scene'): Promise<void>;
  expectStatusField(field: 'app-mode', value: string | RegExp): Promise<void>;
  waitForMapReady(): Promise<Locator>;
}) {
  await ams.switchMode('scene');
  await ams.expectStatusField('app-mode', '场景');
  await ams.waitForMapReady();
  await expect(timelinePanel(ams.page)).toBeVisible({ timeout: 15_000 });
  await expect(timelinePanel(ams.page).locator('select[title="Playback speed"]')).toBeVisible({
    timeout: 15_000,
  });
}

async function loadTimelineScenario(
  ams: {
    page: Page;
    openActivityPanel(id: string): Promise<void>;
    setNextPickerFiles(
      files: Array<{ name: string; mimeType: string; text: string }>,
    ): Promise<void>;
  },
  options: { simulatorTime: number; filename: string },
) {
  await ams.openActivityPanel('scenarios');
  await ams.setNextPickerFiles([
    {
      name: options.filename,
      mimeType: 'application/json',
      text: JSON.stringify(timelineScenarioJson(options.simulatorTime)),
    },
  ]);

  await ams.page.getByRole('button', { name: /打开场景/ }).click();
  const projectionDialog = ams.page.getByRole('dialog', { name: /Choose Coordinate System/ });
  await projectionDialog
    .getByRole('button', { name: 'Use this projection' })
    .click({ timeout: 1_000 })
    .catch(() => undefined);
  await expect(ams.page.getByText('已加载 1 个场景')).toBeVisible();
}

async function createBlankScenario(page: Page) {
  await page.getByRole('button', { name: /新建/ }).click();
  await expect(page.getByText(/已新建空场景/)).toBeVisible();
}

function timelinePanel(page: Page) {
  return page.locator(selectors.workspace.panel('timeline'));
}

function timelineControls(timeline: Locator) {
  const transport = timeline.locator('select[title="Playback speed"]').locator('xpath=..');
  const buttons = transport.getByRole('button');
  return {
    buttons,
    stepBack: transport.getByRole('button', { name: 'Step back' }),
    play: transport.getByRole('button', { name: 'Play playback' }),
    pause: transport.getByRole('button', { name: 'Pause playback' }),
    stop: transport.getByRole('button', { name: 'Stop playback' }),
    stepForward: transport.getByRole('button', { name: 'Step forward' }),
  };
}

async function expectKeyframe(timeline: Locator, title: string) {
  await expect(timeline.locator(`[title="${title}"]`)).toBeVisible();
}

async function expectTimelineTimes(
  timeline: Locator,
  expected: { current: string; duration: string },
) {
  await expect.poll(() => readTimelineTimes(timeline)).toMatchObject(expected);
}

async function readTimelineSeconds(timeline: Locator) {
  return parseTimelineTime((await readTimelineTimes(timeline)).current);
}

async function readTimelineTimes(timeline: Locator) {
  const texts = (await timelineTimeSpans(timeline).allTextContents()).map((text) => text.trim());
  return { current: texts[0] ?? '', duration: texts[1] ?? '' };
}

function timelineTimeSpans(timeline: Locator) {
  const transport = timeline.locator('select[title="Playback speed"]').locator('xpath=..');
  return transport.locator('span').filter({ hasText: /^\d+:\d{2}\.\d{2}$/ });
}

function scenarioBrowser(page: Page): Locator {
  return page.locator(selectors.workspace.panel('sidebar'));
}

function scenarioRow(browser: Locator, filename: string): Locator {
  return browser
    .locator('ul')
    .first()
    .getByRole('button', {
      name: new RegExp(`^${escapeRegExp(filename)}\\s+`),
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTimelineTime(value: string) {
  const match = /^(\d+):(\d{2})\.(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 100;
}

function timelineScenarioJson(simulatorTime: number) {
  return {
    id: 'timeline-e2e',
    type: 'worldsim',
    mapId: 'timeline-map',
    tags: [],
    scenario: {
      mapDir: 'maps/test',
      simulatorTime,
      start: { x: 0, y: 0, heading: 0 },
      end: { x: 10, y: 0 },
      agent: [
        {
          id: 1,
          type: 'VEHICLE',
          length: 4.5,
          width: 2,
          height: 1.5,
          startPosition: { x: 1, y: 1, heading: 0, speed: 2 },
          startVelocity: 2,
          motiontype: 'TRACKED',
          triggerType: 'TIME',
          startDistance: 2,
          trackedPoint: [
            { x: 1, y: 1, speed: 2 },
            { x: 5, y: 1, speed: 2 },
          ],
        },
      ],
      trafficLights: [
        {
          id: 'TL-1',
          location: { x: 2, y: 2 },
          triggerType: 'TIME',
          triggerValue: 1,
          initialState: { color: 'GREEN' },
          stateGroup: [
            { color: 'GREEN', keepTime: 3 },
            { color: 'RED', keepTime: 4 },
          ],
        },
      ],
    },
  };
}
