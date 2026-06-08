import { expect, test } from './fixtures/app';
import { selectors } from './helpers/selectors';

test.describe('E2E harness smoke', () => {
  test('starts the app shell, guards console errors, and waits for MapLibre canvas', async ({
    ams,
  }, testInfo) => {
    await ams.gotoWorkspace();

    await expect(ams.page).toHaveTitle(/Apollo Map Studio/);
    await expect(ams.page.locator(selectors.workspace.layout)).toBeVisible();
    await expect(ams.page.locator(selectors.workspace.dockview)).toBeVisible();
    await expect(ams.page.locator(selectors.status.bar)).toBeVisible();
    await expect(ams.statusField('app-mode')).toBeVisible();
    await expect(ams.statusField('entity-count')).toBeVisible();

    const canvas = await ams.waitForMapReady();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.width ?? 0).toBeGreaterThan(100);
    expect(canvasBox?.height ?? 0).toBeGreaterThan(100);
    await expect(ams.page.evaluate(() => 'apolloMapStudio' in window)).resolves.toBe(false);

    await ams.setNextPickerFiles([{ name: 'fixture.txt', mimeType: 'text/plain', text: 'ok' }]);
    const pickedNames = await ams.page.evaluate(async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt';

      return new Promise<string[]>((resolve) => {
        input.addEventListener('change', () =>
          resolve(Array.from(input.files ?? []).map((file) => file.name)),
        );
        input.addEventListener('cancel', () => resolve([]));
        input.click();
      });
    });
    expect(pickedNames).toEqual(['fixture.txt']);

    await ams.page.evaluate(() => {
      const anchor = document.createElement('a');
      anchor.download = 'fixture.txt';
      anchor.href = URL.createObjectURL(new Blob(['ok'], { type: 'text/plain' }));
      anchor.click();
    });

    const mockState = await ams.readMockState();
    expect(mockState.pickerRequests.at(-1)).toEqual({
      accept: '.txt',
      multiple: false,
      names: ['fixture.txt'],
    });
    expect(mockState.downloads.at(-1)).toMatchObject({
      filename: 'fixture.txt',
      type: 'text/plain',
      size: 2,
    });

    if (testInfo.retry > 0) await ams.attachDebug('retry-debug');
  });
});
