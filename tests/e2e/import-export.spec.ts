import { expect, test as base, type Page } from '@playwright/test';
import { test as appTest } from './fixtures/app';
import { readMockState, setNextPickerFiles, installDefaultE2EInit } from './helpers/mocks';
import { waitForMapLibreCanvas } from './helpers/mapLibre';
import { selectors } from './helpers/selectors';

const APOLLO_IMPORT_ACCEPT = '.bin,.txt,.pb.txt,application/octet-stream,text/plain';
const PROJ_BEIJING = '+proj=utm +zone=50 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';
const MINIMAL_TEXT_MAP = `header {
  projection {
    proj: "${PROJ_BEIJING}"
  }
}
`;

type Point = { x: number; y: number };

appTest.describe('Apollo import/export happy paths', () => {
  appTest(
    'imports Apollo text protobuf through .txt and .pb.txt picker selections',
    async ({ ams }) => {
      await ams.gotoWorkspace();
      await ams.waitForMapReady();

      await importApolloFixture(ams.page, {
        name: 'tiny-text-map.txt',
        mimeType: 'text/plain',
        text: MINIMAL_TEXT_MAP,
      });
      await expectImportedStatus(ams.page, 'tiny-text-map.txt');

      await importApolloFixture(ams.page, {
        name: 'tiny-text-map.pb.txt',
        mimeType: 'text/plain',
        text: MINIMAL_TEXT_MAP,
      });
      await expectImportedStatus(ams.page, 'tiny-text-map.pb.txt');

      const state = await ams.readMockState();
      expect(state.pickerRequests.slice(-2)).toEqual([
        {
          accept: APOLLO_IMPORT_ACCEPT,
          multiple: false,
          names: ['tiny-text-map.txt'],
        },
        {
          accept: APOLLO_IMPORT_ACCEPT,
          multiple: false,
          names: ['tiny-text-map.pb.txt'],
        },
      ]);
    },
  );

  appTest(
    'imports Apollo binary protobuf and exports imported maps as text and binary',
    async ({ ams }) => {
      await ams.gotoWorkspace();
      await ams.waitForMapReady();

      await importApolloFixture(ams.page, {
        name: 'tiny-bin-map.bin',
        mimeType: 'application/octet-stream',
        bytes: minimalApolloBinBytes(PROJ_BEIJING),
      });
      await expectImportedStatus(ams.page, 'tiny-bin-map.bin');

      await exportViaMenu(ams.page, 'exportApolloText');
      const textDownload = await expectLatestDownload(ams.page, 1);
      expect(textDownload).toMatchObject({
        type: 'text/plain',
      });
      expect(textDownload.filename).toMatch(/^tiny-bin-map-\d{14}\.txt$/);
      expect(textDownload.size).toBeGreaterThan(0);

      await exportViaMenu(ams.page, 'exportApolloBin');
      const binDownload = await expectLatestDownload(ams.page, 2);
      expect(binDownload).toMatchObject({
        type: 'application/octet-stream',
      });
      expect(binDownload.filename).toMatch(/^tiny-bin-map-\d{14}\.bin$/);
      expect(binDownload.size).toBeGreaterThan(0);
    },
  );

  appTest('prompts for projection before exporting a newly created Apollo map', async ({ ams }) => {
    await ams.gotoWorkspace();
    await ams.waitForMapReady();
    await drawBezierLane(ams.page);
    await expect(ams.statusField('entity-count')).toHaveText('1');

    await exportViaMenu(ams.page, 'exportApolloText');

    const dialog = ams.page.getByRole('dialog', { name: /Choose Coordinate System/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('projection-resolved-value')).toContainText(PROJ_BEIJING);
    await dialog.getByRole('button', { name: 'Use this projection' }).click();
    await expect(dialog).toBeHidden();

    const download = await expectLatestDownload(ams.page, 1);
    expect(download.filename).toMatch(/^apollo-map-\d{14}\.txt$/);
    expect(download.type).toBe('text/plain');
    expect(download.size).toBeGreaterThan(0);
    await expectImportedStatus(ams.page, 'apollo-map', 'lane=1 road=0');
    await expect(ams.page.getByTestId('status-apollo-map')).toHaveAttribute(
      'title',
      `PROJ: ${PROJ_BEIJING}`,
    );
  });
});

base.describe('Apollo import/export error paths', () => {
  base(
    'records import and export failures from menu actions without downloads',
    async ({ page }) => {
      const consoleErrors = collectConsoleErrors(page);
      await installDefaultE2EInit(page);
      await gotoWorkspace(page);

      await importApolloFixture(page, {
        name: 'broken.pb.txt',
        mimeType: 'text/plain',
        text: 'header { projection { proj: "unterminated',
      });
      await expect
        .poll(() => hasConsoleError(consoleErrors, '[mapIO] import failed'), { timeout: 15_000 })
        .toBe(true);
      await expect(page.getByTestId('status-apollo-map')).toHaveCount(0);

      await importApolloFixture(page, {
        name: 'download-error-source.txt',
        mimeType: 'text/plain',
        text: MINIMAL_TEXT_MAP,
      });
      await expectImportedStatus(page, 'download-error-source.txt');
      const downloadCountBeforeExport = (await readMockState(page)).downloads.length;
      const consoleErrorCountBeforeExport = consoleErrors.length;
      await makeObjectUrlCreationFail(page);
      await exportViaMenu(page, 'exportApolloText');
      await expect
        .poll(
          () =>
            hasConsoleError(
              consoleErrors.slice(consoleErrorCountBeforeExport),
              '[mapIO] export failed',
            ),
          { timeout: 15_000 },
        )
        .toBe(true);

      const state = await readMockState(page);
      expect(state.downloads).toHaveLength(downloadCountBeforeExport);
      expect(state.pickerRequests.at(-1)).toEqual({
        accept: APOLLO_IMPORT_ACCEPT,
        multiple: false,
        names: ['download-error-source.txt'],
      });
    },
  );
});

async function gotoWorkspace(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(selectors.workspace.layout)).toBeVisible();
  await expect(page.locator(selectors.workspace.main)).toBeVisible();
  await expect(page.locator(selectors.workspace.dockview)).toBeVisible();
  await expect(page.locator(selectors.status.bar)).toBeVisible();
}

async function importApolloFixture(
  page: Page,
  file: { name: string; mimeType: string; text?: string; bytes?: number[] },
): Promise<void> {
  await setNextPickerFiles(page, [file]);
  await page.locator(selectors.menu.root('File')).click();
  await page.locator(selectors.menu.item('importApollo')).click();
}

async function exportViaMenu(page: Page, actionId: 'exportApolloBin' | 'exportApolloText') {
  await page.locator(selectors.menu.root('File')).click();
  await page.locator(selectors.menu.item(actionId)).click();
}

async function expectImportedStatus(
  page: Page,
  filename: string,
  countsText = 'lane=0 road=0',
): Promise<void> {
  const imported = page.getByTestId('status-apollo-map');
  await expect(imported.getByTestId('status-apollo-filename')).toHaveText(filename, {
    timeout: 30_000,
  });
  await expect(imported).toContainText(countsText);
}

async function expectLatestDownload(page: Page, expectedCount: number) {
  await expect
    .poll(async () => (await readMockState(page)).downloads.length, { timeout: 30_000 })
    .toBe(expectedCount);
  const state = await readMockState(page);
  const download = state.downloads.at(-1);
  expect(download).toBeTruthy();
  return download!;
}

function minimalApolloBinBytes(projString: string): number[] {
  const projBytes = Array.from(new TextEncoder().encode(projString));
  const projectionMessage = [0x0a, projBytes.length, ...projBytes];
  const headerMessage = [0x1a, projectionMessage.length, ...projectionMessage];
  return [0x0a, headerMessage.length, ...headerMessage];
}

async function drawBezierLane(page: Page): Promise<void> {
  await waitForMapLibreCanvas(page);
  await page.getByTestId('element-lane').click();
  await page.getByTestId('draw-tool-lane-drawBezier').click();
  await expect(page.getByTestId('draw-tool-lane-drawBezier')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await downUp(page, await relativeCanvasPoint(page, 0.34, 0.52));
  await downUp(page, await relativeCanvasPoint(page, 0.66, 0.48));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
}

async function relativeCanvasPoint(page: Page, xRatio: number, yRatio: number): Promise<Point> {
  const canvas = await waitForMapLibreCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas did not have a bounding box');
  return { x: box.x + box.width * xRatio, y: box.y + box.height * yRatio };
}

async function downUp(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function hasConsoleError(errors: string[], text: string): boolean {
  return errors.some((error) => error.includes(text));
}

async function makeObjectUrlCreationFail(page: Page): Promise<void> {
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error('download unavailable');
    };
  });
}
