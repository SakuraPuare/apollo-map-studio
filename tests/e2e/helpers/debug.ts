import { selectors } from './selectors';
import type { Locator, Page, TestInfo } from '@playwright/test';

interface LocatorDebug {
  selector: string;
  count: number;
  visible: boolean;
  text: string | null;
  box: Awaited<ReturnType<Locator['boundingBox']>>;
}

async function locatorDebug(page: Page, selector: string): Promise<LocatorDebug> {
  const locator = page.locator(selector).first();
  const count = await page.locator(selector).count();
  if (count === 0) return { selector, count, visible: false, text: null, box: null };

  return {
    selector,
    count,
    visible: await locator.isVisible().catch(() => false),
    text: await locator.textContent().catch(() => null),
    box: await locator.boundingBox().catch(() => null),
  };
}

async function writeAttachment(
  testInfo: TestInfo,
  name: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  await testInfo.attach(name, { body, contentType });
}

async function attachSafely(
  testInfo: TestInfo,
  label: string,
  collector: () => Promise<void>,
): Promise<void> {
  try {
    await collector();
  } catch (error) {
    await writeAttachment(
      testInfo,
      `${label}-failed.txt`,
      error instanceof Error ? (error.stack ?? error.message) : String(error),
      'text/plain',
    );
  }
}

export async function attachDomDebug(
  page: Page,
  testInfo: TestInfo,
  label = 'dom-debug',
): Promise<void> {
  const html = await page.locator('body').evaluate((body) => body.outerHTML);
  const text = await page.locator('body').evaluate((body) => body.textContent ?? '');

  await testInfo.attach(`${label}.txt`, {
    body: text,
    contentType: 'text/plain',
  });
  await testInfo.attach(`${label}.html`, {
    body: html,
    contentType: 'text/html',
  });
}

export async function attachAriaSnapshot(
  page: Page,
  testInfo: TestInfo,
  label = 'aria',
): Promise<void> {
  const snapshot = await page.locator('body').ariaSnapshot();
  await writeAttachment(testInfo, `${label}.yml`, snapshot, 'text/yaml');
}

export async function attachDebugJson(
  page: Page,
  testInfo: TestInfo,
  label = 'debug',
): Promise<void> {
  const debug = {
    url: page.url(),
    title: await page.title().catch(() => ''),
    viewport: page.viewportSize(),
    test: {
      title: testInfo.title,
      project: testInfo.project.name,
      retry: testInfo.retry,
    },
    locators: await Promise.all([
      locatorDebug(page, selectors.workspace.layout),
      locatorDebug(page, selectors.workspace.dockview),
      locatorDebug(page, selectors.status.bar),
      locatorDebug(page, selectors.map.host),
      locatorDebug(page, selectors.map.canvas),
    ]),
    canvas: await page
      .locator(selectors.map.canvas)
      .first()
      .evaluate((canvas) => {
        const node = canvas as HTMLCanvasElement;
        const rect = node.getBoundingClientRect();
        return {
          clientWidth: node.clientWidth,
          clientHeight: node.clientHeight,
          width: node.width,
          height: node.height,
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          hasWebGL: Boolean(
            node.getContext('webgl2') ??
            node.getContext('webgl') ??
            node.getContext('experimental-webgl'),
          ),
        };
      })
      .catch(() => null),
  };

  await writeAttachment(
    testInfo,
    `${label}.json`,
    JSON.stringify(debug, null, 2),
    'application/json',
  );
}

export async function attachMapCanvasScreenshot(
  page: Page,
  testInfo: TestInfo,
  label = 'map-canvas',
): Promise<void> {
  const target = page.locator(selectors.map.host).first();
  if ((await target.count()) === 0) return;

  await writeAttachment(testInfo, `${label}.png`, await target.screenshot(), 'image/png');
}

export async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  label = 'page',
): Promise<void> {
  await testInfo.attach(`${label}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

export async function attachDebugArtifacts(
  page: Page,
  testInfo: TestInfo,
  label = 'debug',
): Promise<void> {
  await attachSafely(testInfo, label, () => attachDebugJson(page, testInfo, label));
  await attachSafely(testInfo, `${label}-aria`, () =>
    attachAriaSnapshot(page, testInfo, `${label}-aria`),
  );
  await attachSafely(testInfo, `${label}-map-canvas`, () =>
    attachMapCanvasScreenshot(page, testInfo, `${label}-map-canvas`),
  );
  await attachSafely(testInfo, `${label}-dom`, () => attachDomDebug(page, testInfo, label));
  await attachSafely(testInfo, `${label}-page`, () => attachScreenshot(page, testInfo, label));
}
