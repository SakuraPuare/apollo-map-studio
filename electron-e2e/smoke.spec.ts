import { test, expect } from './fixtures.js';
import type { ElectronApplication } from '@playwright/test';

const MACHINE_CODE_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
type WindowCommand = 'maximize' | 'unmaximize' | 'minimize' | 'restore' | 'close';
type WindowCommandStore = typeof globalThis & {
  __apolloE2eWindowCommands?: WindowCommand[];
};

type BridgeSnapshot = {
  apolloGlobals: string[];
  hasRequire: boolean;
  hasProcess: boolean;
  hasIpcRenderer: boolean;
  appKeys: string[];
  licenseKeys: string[];
  info: {
    productName: string;
    runtime: string;
    platform: string;
    docsAvailable: boolean;
    versions: Record<string, string | undefined>;
  };
  state: {
    status: string;
    canEdit: boolean;
    machineCode: string;
    reason: string;
  };
  machineCode: string;
};

type ElectronLicenseState = BridgeSnapshot['state'] & {
  trialStart: number;
  trialEnd: number;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  license: { id: string; name: string; issued: number; expires: number } | null;
  checkedAt: number;
};

type ElectronBridgeWindow = Window &
  typeof globalThis & {
    apolloMapStudio?: {
      platform: string;
      versions: Record<string, string | undefined>;
      getAppInfo?: () => Promise<BridgeSnapshot['info']>;
      getWindowState?: () => Promise<{
        platform: string;
        isMaximized: boolean;
        isFullscreen: boolean;
        isFocused: boolean;
      } | null>;
      openHelp?: () => Promise<boolean>;
      minimizeWindow?: () => Promise<void>;
      toggleMaximizeWindow?: () => Promise<void>;
      closeWindow?: () => Promise<void>;
      onNativeMenuAction?: (handler: (actionId: string) => void) => () => void;
      onWindowStateChange?: (handler: (state: unknown) => void) => () => void;
    };
    apolloMapStudioLicense?: {
      getState: () => Promise<ElectronLicenseState>;
      getMachineCode: () => Promise<string>;
      activate: (code: string) => Promise<{
        ok: boolean;
        state: ElectronLicenseState;
        errorCode?: string;
        errorMessage?: string;
      }>;
      deactivate: () => Promise<ElectronLicenseState>;
      onChange: (handler: (state: ElectronLicenseState) => void) => () => void;
    };
  };

async function installWindowStateShim(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!target) throw new Error('No BrowserWindow available for window state shim.');

    const store = globalThis as WindowCommandStore;
    store.__apolloE2eWindowCommands = [];

    const commandWindow = target as Electron.BrowserWindow &
      Record<WindowCommand, (...args: unknown[]) => unknown> & {
        isMaximized: () => boolean;
        isMinimized: () => boolean;
      };
    const original = {
      close: commandWindow.close.bind(target),
      isMaximized: commandWindow.isMaximized.bind(target),
      isMinimized: commandWindow.isMinimized.bind(target),
      maximize: commandWindow.maximize.bind(target),
      minimize: commandWindow.minimize.bind(target),
      restore: commandWindow.restore.bind(target),
      unmaximize: commandWindow.unmaximize.bind(target),
    };
    let maximized = original.isMaximized();
    let minimized = original.isMinimized();

    const publish = () => {
      target.webContents.send('app:window-state', {
        platform: process.platform,
        isMaximized: maximized,
        isFullscreen: target.isFullScreen(),
        isFocused: target.isFocused(),
      });
    };
    const record = (command: WindowCommand) => {
      store.__apolloE2eWindowCommands?.push(command);
    };

    commandWindow.isMaximized = () => maximized || original.isMaximized();
    commandWindow.isMinimized = () => minimized || original.isMinimized();
    commandWindow.maximize = (...args: unknown[]) => {
      record('maximize');
      maximized = true;
      const result = original.maximize(...args);
      publish();
      return result;
    };
    commandWindow.unmaximize = (...args: unknown[]) => {
      record('unmaximize');
      maximized = false;
      const result = original.unmaximize(...args);
      publish();
      return result;
    };
    commandWindow.minimize = (...args: unknown[]) => {
      record('minimize');
      minimized = true;
      return original.minimize(...args);
    };
    commandWindow.restore = (...args: unknown[]) => {
      record('restore');
      minimized = false;
      const result = original.restore(...args);
      publish();
      return result;
    };
    commandWindow.close = (...args: unknown[]) => {
      record('close');
      return original.close(...args);
    };

    publish();
  });
}

async function getWindowCommands(electronApp: ElectronApplication): Promise<WindowCommand[]> {
  return electronApp.evaluate(
    () => (globalThis as WindowCommandStore).__apolloE2eWindowCommands ?? [],
  );
}

async function clickNativeMenuItem(electronApp: ElectronApplication, menuPath: string[]) {
  return electronApp.evaluate(({ BrowserWindow, Menu }, pathSegments) => {
    const appMenu = Menu.getApplicationMenu();
    if (!appMenu) throw new Error('Application menu is not installed.');

    const normalize = (value: string) =>
      value
        .replace(/&/g, '')
        .replace(/\.{3}|…/g, '')
        .trim();
    let items = appMenu.items;
    let target = null as Electron.MenuItem | null;

    for (const segment of pathSegments) {
      const wanted = normalize(segment);
      target =
        items.find((item) => {
          const label = item.label ? normalize(item.label) : '';
          return label === wanted || item.id === segment;
        }) ?? null;
      if (!target) throw new Error(`Native menu item not found: ${pathSegments.join(' > ')}`);
      if (segment !== pathSegments[pathSegments.length - 1]) {
        if (!target.submenu) throw new Error(`Native menu item has no submenu: ${segment}`);
        items = target.submenu.items;
      }
    }

    if (!target?.enabled) {
      throw new Error(`Native menu item is disabled: ${pathSegments.join(' > ')}`);
    }
    const window =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    target.click({}, window, window?.webContents);
    return { label: target.label, checked: target.checked };
  }, menuPath);
}

test.describe('Electron desktop smoke', () => {
  test('launches Electron and exposes only the expected preload bridge', async ({ mainWindow }) => {
    await expect(mainWindow).toHaveTitle(/Apollo Map Studio/);
    await expect(mainWindow.getByTestId('desktop-titlebar')).toBeVisible();

    const snapshot = await mainWindow.evaluate(async (): Promise<BridgeSnapshot> => {
      const bridgeWindow = window as ElectronBridgeWindow;
      const appApi = bridgeWindow.apolloMapStudio;
      const licenseApi = bridgeWindow.apolloMapStudioLicense;
      if (!appApi || !licenseApi) throw new Error('Expected Electron preload bridge.');

      const [info, state, machineCode] = await Promise.all([
        appApi.getAppInfo?.(),
        licenseApi.getState(),
        licenseApi.getMachineCode(),
      ]);

      if (!info) throw new Error('getAppInfo is unavailable.');

      return {
        apolloGlobals: Object.keys(window).filter((key) => key.startsWith('apolloMapStudio')),
        hasRequire: 'require' in window,
        hasProcess: 'process' in window,
        hasIpcRenderer: 'ipcRenderer' in window,
        appKeys: Object.keys(appApi).sort(),
        licenseKeys: Object.keys(licenseApi).sort(),
        info,
        state,
        machineCode,
      };
    });

    expect(snapshot.apolloGlobals.sort()).toEqual(['apolloMapStudio', 'apolloMapStudioLicense']);
    expect(snapshot.hasRequire).toBe(false);
    expect(snapshot.hasProcess).toBe(false);
    expect(snapshot.hasIpcRenderer).toBe(false);
    expect(snapshot.appKeys).toEqual([
      'closeWindow',
      'getAppInfo',
      'getWindowState',
      'minimizeWindow',
      'onNativeMenuAction',
      'onWindowStateChange',
      'openHelp',
      'platform',
      'toggleMaximizeWindow',
      'versions',
    ]);
    expect(snapshot.licenseKeys).toEqual([
      'activate',
      'deactivate',
      'getMachineCode',
      'getState',
      'onChange',
    ]);
    expect(snapshot.info).toMatchObject({
      productName: 'Apollo Map Studio',
      runtime: 'desktop',
      platform: snapshot.info.platform,
      docsAvailable: true,
    });
    expect(snapshot.info.versions.electron).toEqual(expect.any(String));
    expect(snapshot.info.versions.chrome).toEqual(expect.any(String));
    expect(snapshot.info.versions.node).toEqual(expect.any(String));
    expect(snapshot.state.status).not.toBe('not_started');
    expect(snapshot.machineCode).toBe(snapshot.state.machineCode);
    expect(snapshot.machineCode).toMatch(MACHINE_CODE_RE);
  });

  test('drives title-bar window controls through the preload bridge', async ({
    electronApp,
    mainWindow,
  }) => {
    const platform = await mainWindow.evaluate(
      () => (window as ElectronBridgeWindow).apolloMapStudio?.platform,
    );

    const browserWindow = await electronApp.browserWindow(mainWindow);
    await installWindowStateShim(electronApp);
    if (platform === 'darwin') {
      await expect(mainWindow.getByTestId('desktop-titlebar')).toBeVisible();
      await expect(mainWindow.getByTestId('window-minimize')).toHaveCount(0);
      await expect(mainWindow.getByTestId('window-maximize-toggle')).toHaveCount(0);
      await expect(mainWindow.getByTestId('window-close')).toHaveCount(0);

      await mainWindow.evaluate(async () => {
        const api = (window as ElectronBridgeWindow).apolloMapStudio;
        if (!api?.toggleMaximizeWindow || !api.minimizeWindow || !api.closeWindow) {
          throw new Error('window controls bridge missing');
        }
        await api.toggleMaximizeWindow();
      });
      await expect.poll(() => getWindowCommands(electronApp)).toContain('maximize');
      await expect.poll(() => browserWindow.evaluate((window) => window.isMaximized())).toBe(true);

      await mainWindow.evaluate(async () => {
        await (window as ElectronBridgeWindow).apolloMapStudio?.toggleMaximizeWindow?.();
      });
      await expect.poll(() => getWindowCommands(electronApp)).toContain('unmaximize');
      await expect.poll(() => browserWindow.evaluate((window) => window.isMaximized())).toBe(false);

      await mainWindow.evaluate(async () => {
        await (window as ElectronBridgeWindow).apolloMapStudio?.minimizeWindow?.();
      });
      await expect.poll(() => getWindowCommands(electronApp)).toContain('minimize');
      await expect.poll(() => browserWindow.evaluate((window) => window.isMinimized())).toBe(true);
      await browserWindow.evaluate((window) => window.restore());
      await expect(mainWindow.getByTestId('workspace-layout')).toBeVisible();

      const closePromise = mainWindow.waitForEvent('close');
      await mainWindow.evaluate(() => {
        void (window as ElectronBridgeWindow).apolloMapStudio?.closeWindow?.();
      });
      await closePromise;
      return;
    }

    await mainWindow.getByTestId('window-maximize-toggle').click();
    await expect.poll(() => getWindowCommands(electronApp)).toContain('maximize');
    await expect.poll(() => browserWindow.evaluate((window) => window.isMaximized())).toBe(true);
    await expect(mainWindow.getByTestId('window-maximize-toggle')).toHaveAttribute(
      'title',
      'Restore',
    );

    await mainWindow.getByTestId('window-maximize-toggle').click();
    await expect.poll(() => getWindowCommands(electronApp)).toContain('unmaximize');
    await expect.poll(() => browserWindow.evaluate((window) => window.isMaximized())).toBe(false);
    await expect(mainWindow.getByTestId('window-maximize-toggle')).toHaveAttribute(
      'title',
      'Maximize',
    );

    await mainWindow.getByTestId('window-minimize').click();
    await expect.poll(() => getWindowCommands(electronApp)).toContain('minimize');
    await expect.poll(() => browserWindow.evaluate((window) => window.isMinimized())).toBe(true);
    await browserWindow.evaluate((window) => window.restore());
    await expect(mainWindow.getByTestId('workspace-layout')).toBeVisible();

    const closePromise = mainWindow.waitForEvent('close');
    await mainWindow.getByTestId('window-close').click();
    await closePromise;
  });

  test('opens about/help and routes native menu file actions into the renderer', async ({
    electronApp,
    mainWindow,
  }) => {
    await mainWindow.getByTestId('menu-about').click();
    await mainWindow.getByTestId('menuitem-about').click();
    await expect(mainWindow.getByTestId('about-dialog')).toBeVisible();
    await expect(mainWindow.getByText('Runtime')).toBeVisible();
    await expect(mainWindow.getByText('Electron').first()).toBeVisible();

    const helpPromise = electronApp.waitForEvent('window');
    await mainWindow.getByTestId('about-help').click();
    const helpWindow = await helpPromise;
    await helpWindow.waitForLoadState('domcontentloaded');
    expect(helpWindow.url()).toBe('apollo-map-studio://app/docs/index.html');
    await expect(helpWindow.getByText(/Apollo Map Studio|Apollo HD/i).first()).toBeVisible();
    await helpWindow.close();

    const nativeHelpPromise = electronApp.waitForEvent('window');
    await clickNativeMenuItem(electronApp, ['Help', 'Help Documentation']);
    const nativeHelpWindow = await nativeHelpPromise;
    await nativeHelpWindow.waitForLoadState('domcontentloaded');
    expect(nativeHelpWindow.url()).toBe('apollo-map-studio://app/docs/index.html');
    await expect(nativeHelpWindow.getByText(/Apollo Map Studio|Apollo HD/i).first()).toBeVisible();
    await nativeHelpWindow.close();

    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.getByTestId('about-dialog')).toHaveCount(0);

    const nativeAboutPath =
      process.platform === 'darwin'
        ? ['Apollo Map Studio', 'About Apollo Map Studio']
        : ['Help', 'About Apollo Map Studio'];
    await clickNativeMenuItem(electronApp, nativeAboutPath);
    await expect(mainWindow.getByTestId('about-dialog')).toBeVisible();
    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.getByTestId('about-dialog')).toHaveCount(0);

    await mainWindow.evaluate(() => {
      window.__apolloE2eFilePickers = [];
      window.__apolloE2eDownloads = [];
      window.__apolloE2eNativeActions = [];

      const api = (window as ElectronBridgeWindow).apolloMapStudio;
      if (!api?.onNativeMenuAction) throw new Error('native menu bridge missing');
      api.onNativeMenuAction((actionId) => {
        window.__apolloE2eNativeActions.push(actionId);
      });

      const originalCreateElement = document.createElement.bind(document);
      document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
        const element = originalCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'input') {
          const input = element as HTMLInputElement;
          input.click = () => {
            if (input.type !== 'file') return;
            const picker = {
              accept: input.accept,
              clicked: true,
              multiple: input.multiple,
              type: input.type,
            };
            window.__apolloE2eFilePickers.push(picker);
            setTimeout(() => input.dispatchEvent(new Event('change')), 0);
          };
        }
        if (tagName.toLowerCase() === 'a') {
          const anchor = element as HTMLAnchorElement;
          anchor.click = () => {
            window.__apolloE2eDownloads.push({
              download: anchor.download,
              href: anchor.href,
            });
          };
        }
        return element;
      }) as typeof document.createElement;
      URL.createObjectURL = () => 'blob:apollo-e2e-download';
      URL.revokeObjectURL = () => undefined;
    });
    await clickNativeMenuItem(electronApp, ['File', 'Import Apollo Map']);
    await expect
      .poll(() => mainWindow.evaluate(() => window.__apolloE2eNativeActions))
      .toContain('importApollo');
    await expect
      .poll(() => mainWindow.evaluate(() => window.__apolloE2eFilePickers[0]))
      .toEqual({
        accept: '.bin,.txt,.pb.txt,application/octet-stream,text/plain',
        clicked: true,
        multiple: false,
        type: 'file',
      });

    await clickNativeMenuItem(electronApp, ['File', 'Export Apollo Map (.bin)']);
    await expect
      .poll(() => mainWindow.evaluate(() => window.__apolloE2eNativeActions))
      .toContain('exportApolloBin');

    await clickNativeMenuItem(electronApp, ['File', 'Export Apollo Map (.txt)']);
    await expect
      .poll(() => mainWindow.evaluate(() => window.__apolloE2eNativeActions))
      .toContain('exportApolloText');
  });

  test('runs the license activation dialog basic flow', async ({ mainWindow }) => {
    const state = await mainWindow.evaluate(() =>
      (window as ElectronBridgeWindow).apolloMapStudioLicense?.getState(),
    );
    expect(state?.machineCode).toMatch(MACHINE_CODE_RE);

    await mainWindow.getByTestId('license-chip').click();
    await expect(mainWindow.getByTestId('activation-dialog')).toBeVisible();
    await expect(mainWindow.getByTestId('activation-status')).toContainText(
      `status: ${state?.status}`,
    );
    await expect(mainWindow.getByTestId('activation-machine-code')).toHaveText(state!.machineCode);

    await expect(mainWindow.getByTestId('activation-submit')).toBeDisabled();
    await mainWindow.getByTestId('activation-code-input').fill('not-a-license');
    await expect(mainWindow.getByTestId('activation-submit')).toBeEnabled();
    await mainWindow.getByTestId('activation-submit').click();
    await expect(mainWindow.getByText('Activation code is malformed.')).toBeVisible();

    const changeResult = await mainWindow.evaluate(async () => {
      const api = (window as ElectronBridgeWindow).apolloMapStudioLicense;
      if (!api) throw new Error('license bridge missing');
      const before = await api.getState();
      let unsubscribe: (() => void) | undefined;
      const changed = new Promise<ElectronLicenseState>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          unsubscribe?.();
          reject(new Error('license onChange timed out'));
        }, 5_000);
        unsubscribe = api.onChange((next) => {
          window.clearTimeout(timeoutId);
          unsubscribe?.();
          resolve(next);
        });
      });
      const after = await api.deactivate();
      return { after, before, changed: await changed };
    });
    expect(changeResult.after.status).not.toBe('not_started');
    expect(changeResult.after.machineCode).toBe(changeResult.before.machineCode);
    expect(changeResult.after.license).toBeNull();
    expect(changeResult.changed).toMatchObject({
      status: changeResult.after.status,
      canEdit: changeResult.after.canEdit,
      machineCode: changeResult.after.machineCode,
      license: null,
    });
    await expect(mainWindow.getByTestId('activation-status')).toContainText(
      `status: ${changeResult.after.status}`,
    );

    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.getByTestId('activation-dialog')).toHaveCount(0);
  });
});
