import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { attachDebugArtifacts } from './debug';
import { waitForMapLibreCanvas } from './mapLibre';
import { readMockState, setNextPickerFiles, type MockFileSpec } from './mocks';
import { resetStorage } from './storage';
import { selectors, type AppMode, type StatusField } from './selectors';

export class AmsE2EApp {
  constructor(
    readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {}

  locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  async gotoWorkspace(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.waitForWorkspaceReady();
  }

  async waitForWorkspaceReady(): Promise<void> {
    await expect(this.page.locator(selectors.workspace.layout)).toBeVisible();
    await expect(this.page.locator(selectors.workspace.main)).toBeVisible();
    await expect(this.page.locator(selectors.workspace.dockview)).toBeVisible();
    await expect(this.page.locator(selectors.status.bar)).toBeVisible();
  }

  async waitForMapReady(): Promise<Locator> {
    await expect(this.page.locator(selectors.workspace.panel('map'))).toBeVisible();
    return waitForMapLibreCanvas(this.page);
  }

  statusField(field: StatusField): Locator {
    return this.page.locator(selectors.status.field(field));
  }

  async expectStatusField(field: StatusField, value: string | RegExp): Promise<void> {
    await expect(this.statusField(field)).toHaveText(value);
  }

  async switchMode(mode: AppMode): Promise<void> {
    await this.page.locator(selectors.mode.button(mode)).click();
  }

  async openMenu(label: string): Promise<void> {
    await this.page.locator(selectors.menu.root(label)).click();
  }

  async clickMenuItem(actionId: string): Promise<void> {
    await this.page.locator(selectors.menu.item(actionId)).click();
  }

  async openActivityPanel(id: string): Promise<void> {
    await this.page.locator(selectors.activity.button(id)).click();
  }

  async resetStorage(options: { reload?: boolean } = {}): Promise<void> {
    await resetStorage(this.page, options);
  }

  async setNextPickerFiles(files: MockFileSpec[]): Promise<void> {
    await setNextPickerFiles(this.page, files);
  }

  async readMockState(): ReturnType<typeof readMockState> {
    return readMockState(this.page);
  }

  async attachDebug(label = 'ams-debug'): Promise<void> {
    await attachDebugArtifacts(this.page, this.testInfo, label);
  }
}
