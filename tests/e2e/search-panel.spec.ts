import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.describe('SearchPanel E2E', () => {
  test.beforeEach(async ({ ams }) => {
    await ams.gotoWorkspace();
    await ams.waitForMapReady();
    await ams.expectStatusField('entity-count', '0');
    await createSearchFixtures(ams.page);
  });

  test('opens Search view and searches by id, type, empty result, and case-insensitive partials', async ({
    ams,
  }) => {
    const { page } = ams;
    const search = await openSearchView(ams);

    await search.fill('oad_');
    await expectMatchCount(page, '1 match');
    await expect(resultRow(page, 'road_1')).toBeVisible();
    await expect(resultRow(page, 'RSU_1')).toHaveCount(0);
    await expect(resultRows(page)).toHaveCount(1);

    await search.fill('rsu');
    await expectMatchCount(page, '1 match');
    await expect(resultRow(page, 'RSU_1')).toContainText('rsu');
    await expect(resultRow(page, 'road_1')).toHaveCount(0);

    await search.fill('lane');
    await expectMatchCount(page, '1 match');
    await expect(resultRow(page, 'lane_1')).toContainText('lane');
    await expect(resultRow(page, 'RSU_1')).toHaveCount(0);
    await expect(resultRows(page)).toHaveCount(1);

    await search.fill('missing-fixture-id');
    await expectMatchCount(page, '0 matches');
    await expect(sidebar(page).getByText('No matches')).toBeVisible();
    await expect(resultRows(page)).toHaveCount(0);

    await search.fill('RS');
    await expect(resultRow(page, 'RSU_1')).toBeVisible();

    await search.fill('ROA');
    await expect(resultRow(page, 'road_1')).toBeVisible();
  });

  test('clicks a result to select the entity and keeps selected state synced from other views', async ({
    ams,
  }) => {
    const { page } = ams;
    const search = await openSearchView(ams);

    await search.fill('rsu');
    await expectMatchCount(page, '1 match');
    const rsu = resultRow(page, 'RSU_1');
    await expect(rsu).toBeVisible();
    await expectSelected(rsu);

    await search.fill('road');
    const road = resultRow(page, 'road_1');
    await expect(road).toBeVisible();
    await expect(road).not.toHaveClass(/bg-cyan-500\/15/);

    await road.click();
    await expect(page.getByTestId('status-editor-mode')).toHaveText('Selected');
    await expect(page.getByTestId('inspector-title')).toHaveText('Road');
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'road_1');
    await expectSelected(road);

    await selectLayerEntity(ams.page, 'rsu', 'RSU_1');
    await openSearchPanel(page);
    await expect(searchInput(page)).toHaveValue('road');
    await expect(resultRow(page, 'road_1')).not.toHaveClass(/bg-cyan-500\/15/);

    await searchInput(page).fill('rsu');
    await expectSelected(resultRow(page, 'RSU_1'));
    await expect(page.getByTestId('inspector-title')).toHaveText('Rsu');
    await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'RSU_1');
  });
});

async function createSearchFixtures(page: Page): Promise<void> {
  const tree = await openLayerTree(page);

  await tree.getByRole('button', { name: /^Road$/ }).click();
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'road_1');

  await tree.getByRole('button', { name: /^RSU$/ }).click();
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', 'RSU_1');

  await drawLaneSearchFixture(page);
  await expect(page.getByTestId('status-entity-count')).toHaveText('3');
  await selectLayerEntity(page, 'rsu', 'RSU_1');
}

async function drawLaneSearchFixture(page: Page): Promise<void> {
  await page.getByTestId('element-lane').click();
  await page.getByTestId('draw-tool-lane-drawBezier').click();
  await expect(page.getByTestId('draw-tool-lane-drawBezier')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const canvas = page.getByTestId('maplibre-canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas did not have a bounding box');

  await drawPoint(page, box.x + box.width * 0.35, box.y + box.height * 0.52);
  await drawPoint(page, box.x + box.width * 0.65, box.y + box.height * 0.48);
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('status-editor-mode')).toHaveText('Idle');
  await expect(page.getByTestId('status-entity-count')).toHaveText('3');
  await selectLayerEntity(page, 'lane', 'lane_1');
}

async function drawPoint(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

async function openSearchView(ams: {
  openActivityPanel(id: string): Promise<void>;
  page: Page;
}): Promise<Locator> {
  await openSearchPanel(ams.page, ams.openActivityPanel.bind(ams));
  const search = searchInput(ams.page);
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  await expect(sidebar(ams.page).getByText('Type to search')).toBeVisible();
  await expect(
    sidebar(ams.page).getByText('Search across all entity ids and types.'),
  ).toBeVisible();
  return search;
}

async function openSearchPanel(
  page: Page,
  openActivityPanel?: (id: string) => Promise<void>,
): Promise<void> {
  await openSidebarActivity({
    page,
    activityId: 'search',
    target: searchInput(page),
    loadingText: 'Loading search...',
    openActivityPanel,
  });
}

async function selectLayerEntity(page: Page, entityType: string, entityId: string): Promise<void> {
  const tree = await openLayerTree(page);

  const group = tree.getByTestId(`layer-tree-node-group-${entityType}`);
  await expect(group).toBeVisible();

  const entity = tree
    .getByTestId(`layer-tree-node-entity-${entityType}`)
    .filter({ has: page.getByText(entityId, { exact: true }) });
  if (!(await isVisible(entity, 500))) {
    await group.click();
  }
  await expect(entity).toBeVisible();
  await entity.click();
  await expect(page.getByTestId('inspector-entity-id')).toHaveAttribute('title', entityId);
}

async function openLayerTree(page: Page): Promise<Locator> {
  const tree = page.getByTestId('layer-tree');
  await openSidebarActivity({
    page,
    activityId: 'layers',
    target: tree,
    loadingText: 'Loading layers...',
  });
  return tree;
}

async function openSidebarActivity({
  page,
  activityId,
  target,
  loadingText,
  openActivityPanel,
}: {
  page: Page;
  activityId: string;
  target: Locator;
  loadingText: string;
  openActivityPanel?: (id: string) => Promise<void>;
}): Promise<void> {
  const activity = page.getByTestId(`activity-${activityId}`);
  await expect(activity).toBeVisible();
  await expect(activity).toBeEnabled();
  if (await isVisible(target, 250)) return;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await isVisible(target, 250)) return;
    if (openActivityPanel) await openActivityPanel(activityId);
    else await activity.click();

    await waitForSidebarReady(page);
    await expect(sidebar(page).getByText(loadingText)).toHaveCount(0, { timeout: 5_000 });
    if (await isVisible(target, 2_500)) return;
  }

  await expect(target).toBeVisible();
}

function sidebar(page: Page): Locator {
  return page.getByTestId('workspace-panel-sidebar');
}

async function waitForSidebarReady(page: Page): Promise<void> {
  await expect(sidebar(page)).toBeVisible();
  await expect
    .poll(async () => {
      const text = (await sidebar(page).textContent())?.trim() ?? '';
      if (!text || text.includes('Loading sidebar...')) return 'loading';
      return 'ready';
    })
    .toBe('ready');
}

function searchInput(page: Page): Locator {
  return sidebar(page).getByRole('searchbox', { name: 'Search entities by id or type' });
}

function resultList(page: Page): Locator {
  return sidebar(page).locator('ul');
}

function resultRows(page: Page): Locator {
  return resultList(page).getByRole('button');
}

function resultRow(page: Page, id: string): Locator {
  return resultList(page).getByTitle(id, { exact: true }).locator('xpath=ancestor::button[1]');
}

async function isVisible(locator: Locator, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function expectMatchCount(page: Page, text: string): Promise<void> {
  await expect(sidebar(page).getByText(text, { exact: true })).toBeVisible();
}

async function expectSelected(row: Locator): Promise<void> {
  await expect(row).toHaveClass(/bg-cyan-500\/15/);
}
