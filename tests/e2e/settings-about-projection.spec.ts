import { expect, test, type Locator, type Page } from '@playwright/test';

const AMS_STORAGE_PREFIX = 'apollo-map-studio:';
const WEB_LICENSE_KEY = 'ams.webLicense.v1';
const STORAGE_RESET_MARKER = '__ams_settings_about_projection_e2e_reset__';
const BOOT_COUNT_KEY = '__ams_settings_about_projection_e2e_boots__';
const REMOVED_LAYOUT_KEYS_KEY = '__ams_settings_about_projection_e2e_removed_layout_keys__';
const DRAWING_LAYOUT_KEY = 'apollo-map-studio:layout:drawing';
const SCENE_LAYOUT_KEY = 'apollo-map-studio:layout:scene';
const SENTINEL_LAYOUT = '{"sentinel":"settings-reset-e2e"}';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({
      prefix,
      licenseKey,
      resetMarker,
      bootCountKey,
      removedLayoutKeysKey,
      drawingLayoutKey,
      sceneLayoutKey,
    }) => {
      const wrappedWindow = window as Window & { __amsLayoutRemoveRecorder?: boolean };
      if (!wrappedWindow.__amsLayoutRemoveRecorder) {
        wrappedWindow.__amsLayoutRemoveRecorder = true;
        const removeItem = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function removeItemWithLayoutRecorder(key: string) {
          if (this === localStorage && (key === drawingLayoutKey || key === sceneLayoutKey)) {
            try {
              const removed = JSON.parse(
                sessionStorage.getItem(removedLayoutKeysKey) ?? '[]',
              ) as string[];
              removed.push(key);
              sessionStorage.setItem(removedLayoutKeysKey, JSON.stringify(removed));
            } catch {
              // Ignore recorder failures; the original storage operation should still run.
            }
          }
          return removeItem.call(this, key);
        };
      }

      if (sessionStorage.getItem(resetMarker) !== '1') {
        const keysToRemove: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith(prefix) || key === licenseKey) keysToRemove.push(key);
        }
        for (const key of keysToRemove) localStorage.removeItem(key);
        sessionStorage.clear();
        sessionStorage.setItem(resetMarker, '1');
      }

      const bootCount = Number(sessionStorage.getItem(bootCountKey) ?? '0');
      sessionStorage.setItem(bootCountKey, String(bootCount + 1));

      if (!localStorage.getItem(licenseKey)) {
        const now = Date.now();
        localStorage.setItem(
          licenseKey,
          JSON.stringify({
            trialStart: now,
            activation: {
              license: { id: 'e2e', name: 'E2E Mock License', issued: now, expires: 0 },
              expires: 0,
              activatedAt: now,
            },
          }),
        );
      }
    },
    {
      prefix: AMS_STORAGE_PREFIX,
      licenseKey: WEB_LICENSE_KEY,
      resetMarker: STORAGE_RESET_MARKER,
      bootCountKey: BOOT_COUNT_KEY,
      removedLayoutKeysKey: REMOVED_LAYOUT_KEYS_KEY,
      drawingLayoutKey: DRAWING_LAYOUT_KEY,
      sceneLayoutKey: SCENE_LAYOUT_KEY,
    },
  );

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
});

test.describe('Settings, About, and projection picker dialogs', () => {
  test('opens, closes, edits settings tabs, persists values, and resets layout', async ({
    page,
  }) => {
    await openSettings(page);
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();

    await openSettings(page);
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'History limit' }),
    ).toHaveValue('100');
    await expect(
      settingsDialog(page).getByRole('button', { name: 'Reset Layout to Default' }),
    ).toBeVisible();

    await settingsDialog(page).getByRole('spinbutton', { name: 'History limit' }).fill('250');
    await settingsDialog(page).getByRole('spinbutton', { name: 'History limit' }).press('Enter');
    await expectStoredValue(page, 'apollo-map-studio:historyLimit', '250');

    await settingsTab(page, 'Map').click();
    await expect(settingsDialog(page).getByRole('spinbutton', { name: 'Longitude' })).toBeVisible();
    await expect(settingsDialog(page).getByRole('spinbutton', { name: 'Latitude' })).toBeVisible();
    await expect(settingsDialog(page).getByRole('spinbutton', { name: 'Zoom' })).toBeVisible();
    await expect(
      settingsDialog(page).getByRole('checkbox', { name: 'Grid enabled by default' }),
    ).toBeChecked();
    await expect(
      settingsDialog(page).getByRole('checkbox', { name: 'Snap enabled by default' }),
    ).not.toBeChecked();
    await settingsDialog(page).getByRole('checkbox', { name: 'Snap enabled by default' }).check();
    await expectStoredValue(page, 'apollo-map-studio:snapEnabled', 'true');

    await settingsTab(page, 'Editing').click();
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'Default half-width (m)' }),
    ).toBeVisible();
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'Default speed limit (km/h)' }),
    ).toBeVisible();
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'Snap radius (px)' }),
    ).toBeVisible();
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'Click drag threshold (px)' }),
    ).toBeVisible();
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'Handle pick padding (px)' }),
    ).toBeVisible();
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'Entity hit radius (px)' }),
    ).toBeVisible();
    await settingsDialog(page)
      .getByRole('combobox', { name: 'Default boundary type' })
      .selectOption('DOTTED_YELLOW');
    await expectStoredValue(page, 'apollo-map-studio:laneBoundaryType', 'DOTTED_YELLOW');

    await settingsTab(page, 'Rendering').click();
    for (const label of [
      'Arrow size (px)',
      'Arrow spacing (px)',
      'Arrow opacity',
      'Fill opacity',
      'Edge line width (px)',
      'Edge line opacity',
      'Center line width (px)',
      'Center line opacity',
    ]) {
      await expect(settingsDialog(page).getByRole('spinbutton', { name: label })).toBeVisible();
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectWorkspaceReady(page);
    await openSettings(page);
    await expect(
      settingsDialog(page).getByRole('spinbutton', { name: 'History limit' }),
    ).toHaveValue('250');
    await settingsTab(page, 'Map').click();
    await expect(
      settingsDialog(page).getByRole('checkbox', { name: 'Snap enabled by default' }),
    ).toBeChecked();
    await settingsTab(page, 'Editing').click();
    await expect(
      settingsDialog(page).getByRole('combobox', { name: 'Default boundary type' }),
    ).toHaveValue('DOTTED_YELLOW');

    await resetRemovedLayoutKeyRecorder(page);
    await seedLayoutSentinels(page);
    await expectStoredValue(page, DRAWING_LAYOUT_KEY, SENTINEL_LAYOUT);
    await expectStoredValue(page, SCENE_LAYOUT_KEY, SENTINEL_LAYOUT);
    await settingsTab(page, 'General').click();
    const bootCount = await getBootCount(page);
    await settingsDialog(page).getByRole('button', { name: 'Reset Layout to Default' }).click();
    await expect.poll(() => getBootCount(page)).toBeGreaterThan(bootCount);
    await expectWorkspaceReady(page);
    await expect(page.getByTestId('workspace-panel-map')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-sidebar')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-inspector')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-toolbox')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-timeline')).toHaveCount(0);
    await expectRemovedLayoutKeys(page, DRAWING_LAYOUT_KEY, SCENE_LAYOUT_KEY);
    await expectStoredValueNot(page, DRAWING_LAYOUT_KEY, SENTINEL_LAYOUT);
    await expectStoredValueNot(page, SCENE_LAYOUT_KEY, SENTINEL_LAYOUT);
  });

  test('opens and closes the About dialog from the menu and command palette', async ({ page }) => {
    await openAboutFromMenu(page);
    await expectAboutDialogContent(page);

    await aboutDialog(page).getByTestId('about-close-footer').click();
    await expect(aboutDialog(page)).toBeHidden();

    await openAboutFromMenu(page);
    await page.keyboard.press('Escape');
    await expect(aboutDialog(page)).toBeHidden();

    await page.keyboard.press('Control+K');
    const commandSearch = page.getByRole('combobox', { name: 'Command search' });
    await expect(commandSearch).toBeVisible();
    await commandSearch.fill('version');
    await page
      .getByRole('listbox', { name: 'Suggestions' })
      .getByRole('option', { name: /^Version Information\b/ })
      .click();
    await expectAboutDialogContent(page);
    await aboutDialog(page).getByTestId('about-close-header').click();
    await expect(aboutDialog(page)).toBeHidden();
  });

  test('accepts projection preset, UTM, and custom PROJ inputs', async ({ page }) => {
    const presetFilename = 'projection-preset.pb.txt';
    const utmFilename = 'projection-utm.pb.txt';
    const customFilename = 'projection-custom.pb.txt';

    let dialog = await openProjectionPicker(page, presetFilename);
    await expect(dialog.getByRole('radio', { name: /Beijing/ })).toBeChecked();
    await dialog.getByRole('radio', { name: /Sunnyvale, CA/ }).check();
    await expect(resolvedProjection(dialog)).toContainText(/\+zone=10/);
    await dialog.getByRole('button', { name: 'Use this projection' }).click();
    await expect(dialog).toBeHidden();
    await expectImportedMap(page, presetFilename, /PROJ: .*\+zone=10/);

    dialog = await openProjectionPicker(page, utmFilename);
    await dialog.getByRole('button', { name: 'UTM zone' }).click();
    await dialog.getByRole('spinbutton', { name: /UTM zone/ }).fill('33');
    await dialog.getByRole('button', { name: 'Southern (S)' }).click();
    await expect(resolvedProjection(dialog)).toContainText(/\+zone=33/);
    await expect(resolvedProjection(dialog)).toContainText(/\+south/);
    await dialog.getByRole('button', { name: 'Use this projection' }).click();
    await expect(dialog).toBeHidden();
    await expectImportedMap(page, utmFilename, /PROJ: .*\+zone=33.*\+south/);

    dialog = await openProjectionPicker(page, customFilename);
    await dialog.getByRole('button', { name: 'Custom PROJ' }).click();
    const submit = dialog.getByRole('button', { name: 'Use this projection' });
    await expect(submit).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'PROJ.4 string' })
      .fill('+proj=tmerc +lat_0={37.413082} +lon_0={-122.13} +ellps=WGS84 +units=m +no_defs');
    await expect(resolvedProjection(dialog)).toContainText(/\+lat_0=37\.413082/);
    await expect(resolvedProjection(dialog)).toContainText(/\+lon_0=-122\.13/);
    await submit.click();
    await expect(dialog).toBeHidden();
    await expectImportedMap(page, customFilename, /PROJ: .*\+lat_0=37\.413082.*\+lon_0=-122\.13/);
  });
});

function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Settings' });
}

function settingsTab(page: Page, name: string): Locator {
  return settingsDialog(page).getByRole('button', { name, exact: true });
}

function aboutDialog(page: Page): Locator {
  return page.getByTestId('about-dialog');
}

function projectionDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /Choose Coordinate System/ });
}

function resolvedProjection(dialog: Locator): Locator {
  return dialog.getByTestId('projection-resolved-value');
}

async function expectWorkspaceReady(page: Page): Promise<void> {
  await expect(page.getByTestId('workspace-layout')).toBeVisible();
  await expect(page.getByTestId('workspace-main')).toBeVisible();
  await expect(page.getByTestId('workspace-dockview')).toBeVisible();
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

async function getBootCount(page: Page): Promise<number> {
  return page
    .evaluate((key) => Number(sessionStorage.getItem(key) ?? '0'), BOOT_COUNT_KEY)
    .catch(() => -1);
}

async function openSettings(page: Page): Promise<void> {
  await runMenuAction(page, 'File', 'settings');
  await expect(settingsDialog(page)).toBeVisible();
}

async function openAboutFromMenu(page: Page): Promise<void> {
  await runMenuAction(page, 'About', 'about');
  await expect(aboutDialog(page)).toBeVisible();
}

async function runMenuAction(page: Page, menu: string, actionId: string): Promise<void> {
  await page.getByTestId(`menu-${menu.toLowerCase()}`).click();
  const item = page.getByTestId(`menuitem-${actionId}`);
  await expect(item).toBeVisible();
  await item.dispatchEvent('click');
}

async function expectAboutDialogContent(page: Page): Promise<void> {
  const dialog = aboutDialog(page);
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog.getByRole('heading', { name: 'Apollo Map Studio' })).toBeVisible();
  await expect(dialog.getByTestId('about-version-value-version')).toHaveText(/^v(?!\.\.\.).+/);
  await expect(dialog.getByTestId('about-version-value-runtime')).toHaveText('Web');
  await expect(dialog.getByRole('heading', { name: 'License & Activation' })).toBeVisible();
  await expect(dialog.getByTestId('about-license-value-status')).toHaveText('Activated');
  await expect(dialog.getByTestId('about-license-value-access')).toHaveText('Editing enabled');
  await expect(dialog.getByTestId('about-license-value-license-name')).toHaveText(
    'E2E Mock License',
  );
  await expect(dialog.getByTestId('about-license-value-device-code')).toHaveText('WEB-BROWSER');
}

async function openProjectionPicker(page: Page, filename: string): Promise<Locator> {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByTestId('menuitem-importApollo').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('header {}'),
  });
  await expect(projectionDialog(page)).toBeVisible();
  return projectionDialog(page);
}

async function expectImportedMap(
  page: Page,
  filename: string,
  projectionTitle: RegExp,
): Promise<void> {
  const importedMap = page.getByTestId('status-apollo-map').filter({ hasText: filename });
  await expect(importedMap.getByTestId('status-apollo-filename')).toHaveText(filename);
  await expect(importedMap).toHaveAttribute('title', projectionTitle);
}

async function expectStoredValue(page: Page, key: string, expected: string | null): Promise<void> {
  await expect
    .poll(() => page.evaluate((storageKey) => localStorage.getItem(storageKey), key))
    .toBe(expected);
}

async function expectStoredValueNot(page: Page, key: string, unexpected: string): Promise<void> {
  await expect
    .poll(() => page.evaluate((storageKey) => localStorage.getItem(storageKey), key))
    .not.toBe(unexpected);
}

async function resetRemovedLayoutKeyRecorder(page: Page): Promise<void> {
  await page.evaluate((key) => sessionStorage.removeItem(key), REMOVED_LAYOUT_KEYS_KEY);
}

async function expectRemovedLayoutKeys(page: Page, ...expectedKeys: string[]): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = sessionStorage.getItem(key);
        return value ? (JSON.parse(value) as string[]) : [];
      }, REMOVED_LAYOUT_KEYS_KEY),
    )
    .toEqual(expect.arrayContaining(expectedKeys));
}

async function seedLayoutSentinels(page: Page): Promise<void> {
  await page.evaluate(
    ({ drawingKey, sceneKey, value }) => {
      localStorage.setItem(drawingKey, value);
      localStorage.setItem(sceneKey, value);
    },
    { drawingKey: DRAWING_LAYOUT_KEY, sceneKey: SCENE_LAYOUT_KEY, value: SENTINEL_LAYOUT },
  );
}
