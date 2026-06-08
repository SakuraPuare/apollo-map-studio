import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';
import { waitForMapLibreCanvas } from './helpers/mapLibre';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APOLLO_FIXTURE_DIR = path.resolve(__dirname, '../../src/io/__fixtures__/apollo');
const DEMO_MAP_TEXT = readFileSync(path.join(APOLLO_FIXTURE_DIR, 'demo/base_map.txt'), 'utf8');

const APOLLO_IMPORT_ACCEPT = '.bin,.txt,.pb.txt,application/octet-stream,text/plain';
const EMPTY_OUTLINE_TEXT =
  '当前地图还没有实体。导入 Apollo 地图或开始绘制后，这里会显示路网、交通设施和结构检查。';
const NO_METADATA_TEXT = '导入 Apollo 地图后，这里会显示源文件和地图头部信息。';
const SANITIZED_PROJECTION =
  '+proj=tmerc +lat_0=37.413082 +lon_0=-122.013332 +k=0.9999999996 +ellps=WGS84 +no_defs';
const RAW_HEADER_PROJECTION =
  '+proj=tmerc +lat_0={37.413082} +lon_0={-122.013332} +k={0.9999999996} +ellps=WGS84 +no_defs';

type Point = { x: number; y: number };

test.describe('MapOutline and MapMetadata', () => {
  test('shows empty outline and no-import metadata notice', async ({ ams }) => {
    await ams.gotoWorkspace();
    await ams.waitForMapReady();

    const panel = await openOutline(ams.page);

    await expectSummaryMetric(panel, '地图', '0');
    await expectSummaryMetric(panel, '草图', '0');
    await expectSummaryMetric(panel, '检查', '0');
    await expect(panel.getByText(EMPTY_OUTLINE_TEXT, { exact: true })).toBeVisible();
    await expect(panel.getByText(NO_METADATA_TEXT, { exact: true })).toBeVisible();

    for (const title of ['路网结构', '交通控制', '区域与设施', '关联关系', '草图元素']) {
      await expect(panel.getByText(title, { exact: true })).toHaveCount(0);
    }
    await expect(sectionTitle(panel, '结构检查')).toHaveCount(0);
  });

  test('shows imported Apollo stats and metadata from a text map', async ({ ams }) => {
    await ams.gotoWorkspace();
    await ams.waitForMapReady();
    await ams.setNextPickerFiles([
      { name: 'base_map.txt', mimeType: 'text/plain', text: DEMO_MAP_TEXT },
    ]);

    const beforeImport = await ams.page.evaluate(() => Date.now());
    await ams.openMenu('File');
    await expect(ams.page.getByTestId('menuitem-importApollo')).toBeVisible();
    await ams.clickMenuItem('importApollo');

    await expect
      .poll(async () => (await ams.readMockState()).pickerRequests.at(-1), { timeout: 10_000 })
      .toMatchObject({
        accept: APOLLO_IMPORT_ACCEPT,
        multiple: false,
        names: ['base_map.txt'],
      });
    await expect(ams.statusField('entity-count')).toHaveText('2', { timeout: 30_000 });
    await expect(ams.page.getByTestId('status-bar')).toContainText('base_map.txt');
    await expect(ams.page.getByTestId('status-bar')).toContainText('lane=1 road=0');
    const afterImport = await ams.page.evaluate(() => Date.now());
    await waitForImportIdle(ams.page);

    const panel = await openOutline(ams.page);

    await expectSummaryMetric(panel, '地图', '2');
    await expectSummaryMetric(panel, '草图', '0');
    await expectSummaryMetric(panel, '检查', '1');
    await expectOutlineRowCount(panel, '路网结构', '车道', '1');
    await expectOutlineRowCount(panel, '交通控制', '停车标志', '1');
    await expectOutlineRowCount(panel, '结构检查', '未归属车道', '1');
    await expectOutlineRowCount(panel, '结构检查', '失效路口引用', '0');

    await expect(sectionTitle(panel, '来源信息')).toHaveCount(1);
    await expectMetadataValue(panel, '文件', 'base_map.txt');
    await expectImportTimeWithin(panel, ams.page, beforeImport, afterImport);
    await expectMetadataValue(panel, '坐标投影', SANITIZED_PROJECTION);
    await expectMetadataValue(panel, '版本', '03/10/17_22.46.20');
    await expectMetadataValue(panel, '日期', '20161124');
    await expectMetadataValue(panel, '投影', RAW_HEADER_PROJECTION);

    for (const label of ['区域', '生成方式', '主版本', '次版本', '供应方']) {
      await expectMetadataValue(panel, label, '—');
    }
    for (const label of ['左边界', '上边界', '右边界', '下边界']) {
      await expectMetadataValue(panel, label, '—');
    }
  });

  test('updates outline stats after drawing a lane', async ({ page, ams }) => {
    await page.addInitScript(() => {
      localStorage.setItem('apollo-map-studio:mapCenterLng', '116.4');
      localStorage.setItem('apollo-map-studio:mapCenterLat', '39.9');
      localStorage.setItem('apollo-map-studio:mapZoom', '18');
      localStorage.setItem('apollo-map-studio:snapEnabled', 'false');
      localStorage.setItem('apollo-map-studio:gridEnabled', 'false');
      localStorage.setItem('apollo-map-studio:laneHalfWidth', '1.75');
      localStorage.setItem('apollo-map-studio:laneSpeedLimit', String(60 / 3.6));
      localStorage.setItem('apollo-map-studio:laneBoundaryType', 'DOTTED_WHITE');
    });

    await ams.gotoWorkspace();
    await ams.waitForMapReady();
    await drawBezierLane(page);
    await expect(ams.statusField('entity-count')).toHaveText('1');

    const panel = await openOutline(page);

    await expectSummaryMetric(panel, '地图', '1');
    await expectSummaryMetric(panel, '草图', '0');
    await expectSummaryMetric(panel, '检查', '1');
    await expectOutlineRowCount(panel, '路网结构', '车道', '1');
    await expectOutlineRowCount(panel, '结构检查', '未归属车道', '1');
    await expectOutlineRowCount(panel, '结构检查', '失效路口引用', '0');
    await expect(panel.getByText('正常', { exact: true })).toHaveCount(0);
  });
});

async function openOutline(page: Page): Promise<Locator> {
  await page.getByTestId('activity-outline').click();
  const panel = outlinePanel(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Loading sidebar...', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Loading outline...', { exact: true })).toHaveCount(0);
  return panel;
}

function outlinePanel(page: Page): Locator {
  return page.getByTestId('workspace-panel-sidebar');
}

async function expectSummaryMetric(panel: Locator, label: string, value: string): Promise<void> {
  const summary = panel.locator('.grid.grid-cols-3').first();
  const metric = summary.locator(`xpath=./div[./div[1][normalize-space(.)=${xpathString(label)}]]`);
  await expect(metric).toHaveCount(1);
  await expect(metric.locator('xpath=./div[last()]')).toHaveText(value);
}

async function expectOutlineRowCount(
  panel: Locator,
  section: string,
  label: string,
  value: string,
): Promise<void> {
  const row = outlineSection(panel, section).locator(
    `xpath=.//div[./span[1][normalize-space(.)=${xpathString(label)}] and ./span[last()]]`,
  );
  await expect(row).toHaveCount(1);
  await expect(row.locator('xpath=./span[last()]')).toHaveText(value);
}

async function expectMetadataValue(panel: Locator, label: string, value: string): Promise<void> {
  await expect(metadataValue(panel, label)).toHaveText(value);
}

async function expectImportTimeWithin(
  panel: Locator,
  page: Page,
  beforeImport: number,
  afterImport: number,
): Promise<void> {
  const displayed = (await metadataValue(panel, '导入时间').textContent())?.trim() ?? '';
  expect(displayed).not.toBe('');
  expect(displayed).not.toBe('—');

  const candidates = await page.evaluate(
    ({ beforeImport, afterImport }) => {
      const start = Math.floor(beforeImport / 1000) * 1000;
      const end = Math.ceil(afterImport / 1000) * 1000;
      const labels: string[] = [];
      for (let ms = start; ms <= end; ms += 1000) {
        labels.push(new Date(ms).toLocaleString());
      }
      return labels;
    },
    { beforeImport, afterImport },
  );
  expect(candidates).toContain(displayed);
}

function metadataValue(panel: Locator, label: string): Locator {
  return panel
    .locator(`xpath=.//div[./span[1][normalize-space(.)=${xpathString(label)}]]/span[2]`)
    .first();
}

function outlineSection(panel: Locator, title: string): Locator {
  return sectionTitle(panel, title).locator('xpath=ancestor::div[contains(@class, "mb-4")][1]');
}

function sectionTitle(panel: Locator, title: string): Locator {
  return panel.locator(
    `xpath=.//*[self::div or self::h3][not(*) and normalize-space(.)=${xpathString(title)}]`,
  );
}

async function waitForImportIdle(page: Page): Promise<void> {
  await expect(page.getByText('Importing Apollo map')).toHaveCount(0, { timeout: 30_000 });
}

async function drawBezierLane(page: Page): Promise<void> {
  await waitForMapLibreCanvas(page);
  await page.getByTestId('element-lane').click();
  await page.getByTestId('draw-tool-lane-drawBezier').click();
  await expect(page.getByTestId('draw-tool-lane-drawBezier')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('status-editor-mode')).toHaveText('Draw: Bezier');

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

function xpathString(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(`, "'", `)})`;
}
