import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appBridge, isDesktopRuntime, type DesktopWindowState } from '../app-bridge';
import { version } from '@/../package.json';

const webNavigator = {
  platform: 'Linux x86_64',
  userAgent: 'Mozilla/5.0 Chrome/123.4.5.6',
};

beforeEach(() => {
  vi.stubGlobal('navigator', webNavigator);
  vi.stubGlobal('window', {
    open: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('appBridge web fallback', () => {
  it('returns browser runtime info when no desktop API exists', async () => {
    await expect(appBridge.getAppInfo()).resolves.toEqual({
      name: 'Apollo Map Studio',
      productName: 'Apollo Map Studio',
      version,
      platform: 'Linux x86_64',
      runtime: 'web',
      docsAvailable: true,
      versions: {
        chrome: '123.4.5.6',
      },
    });
    expect(isDesktopRuntime()).toBe(false);
  });

  it('falls back to generic web platform and no chrome version for non-chromium browsers', async () => {
    vi.stubGlobal('navigator', {
      platform: '',
      userAgent: 'Mozilla/5.0 Firefox/127.0',
    });

    await expect(appBridge.getAppInfo()).resolves.toMatchObject({
      platform: 'web',
      runtime: 'web',
      versions: {
        chrome: undefined,
      },
    });
  });

  it('opens static docs in web runtime', async () => {
    await expect(appBridge.openHelp()).resolves.toBe(true);

    expect(window.open).toHaveBeenCalledWith('/docs/index.html', '_blank', 'noopener,noreferrer');
  });

  it('normalizes a configured base URL without a trailing slash for static docs', async () => {
    vi.stubEnv('BASE_URL', '/studio');

    await expect(appBridge.openHelp()).resolves.toBe(true);

    expect(window.open).toHaveBeenCalledWith(
      '/studio/docs/index.html',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('uses root static docs when the configured base URL is empty', async () => {
    vi.stubEnv('BASE_URL', '');

    await expect(appBridge.openHelp()).resolves.toBe(true);

    expect(window.open).toHaveBeenCalledWith('/docs/index.html', '_blank', 'noopener,noreferrer');
  });

  it('falls back optional desktop window methods to no-ops/null', async () => {
    await expect(appBridge.getWindowState()).resolves.toBeNull();
    await expect(appBridge.minimizeWindow()).resolves.toBeUndefined();
    await expect(appBridge.toggleMaximizeWindow()).resolves.toBeUndefined();
    await expect(appBridge.closeWindow()).resolves.toBeUndefined();

    const onWindow = vi.fn();
    const onMenu = vi.fn();
    expect(appBridge.onWindowStateChange(onWindow)()).toBeUndefined();
    expect(appBridge.onNativeMenuAction(onMenu)()).toBeUndefined();
  });
});

describe('appBridge desktop API', () => {
  function installDesktopApi(overrides: Record<string, unknown> = {}) {
    const state: DesktopWindowState = {
      platform: 'linux',
      isMaximized: false,
      isFullscreen: false,
      isFocused: true,
    };
    window.apolloMapStudio = {
      platform: 'linux',
      versions: { electron: '42.0.0', chrome: '142.0.0', node: '25.0.0' },
      getWindowState: vi.fn().mockResolvedValue(state),
      minimizeWindow: vi.fn().mockResolvedValue(undefined),
      toggleMaximizeWindow: vi.fn().mockResolvedValue(undefined),
      closeWindow: vi.fn().mockResolvedValue(undefined),
      openHelp: vi.fn().mockResolvedValue(false),
      onWindowStateChange: vi.fn(() => vi.fn()),
      onNativeMenuAction: vi.fn(() => vi.fn()),
      ...overrides,
    };
    return window.apolloMapStudio;
  }

  it('uses explicit desktop getAppInfo when available', async () => {
    const api = installDesktopApi({
      getAppInfo: vi.fn().mockResolvedValue({
        name: 'AMS',
        productName: 'Apollo Map Studio Desktop',
        version: '9.9.9',
        platform: 'linux',
        runtime: 'desktop',
        docsAvailable: true,
        versions: { electron: '42.0.0' },
      }),
    });

    await expect(appBridge.getAppInfo()).resolves.toMatchObject({
      productName: 'Apollo Map Studio Desktop',
      runtime: 'desktop',
      version: '9.9.9',
    });
    expect(api?.getAppInfo).toHaveBeenCalledTimes(1);
    expect(isDesktopRuntime()).toBe(true);
  });

  it('builds desktop runtime info from bridge metadata when getAppInfo is absent', async () => {
    installDesktopApi();

    await expect(appBridge.getAppInfo()).resolves.toMatchObject({
      name: 'Apollo Map Studio',
      platform: 'linux',
      runtime: 'desktop',
      versions: { electron: '42.0.0', chrome: '142.0.0', node: '25.0.0' },
    });
  });

  it('delegates help, window commands, and native event subscriptions to desktop API', async () => {
    const unsubscribeWindow = vi.fn();
    const unsubscribeMenu = vi.fn();
    const api = installDesktopApi({
      onWindowStateChange: vi.fn(() => unsubscribeWindow),
      onNativeMenuAction: vi.fn(() => unsubscribeMenu),
    });
    const windowHandler = vi.fn();
    const menuHandler = vi.fn();

    await expect(appBridge.openHelp()).resolves.toBe(false);
    await appBridge.minimizeWindow();
    await appBridge.toggleMaximizeWindow();
    await appBridge.closeWindow();
    await expect(appBridge.getWindowState()).resolves.toMatchObject({ isFocused: true });

    expect(api?.openHelp).toHaveBeenCalledTimes(1);
    expect(api?.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(api?.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(api?.closeWindow).toHaveBeenCalledTimes(1);
    expect(appBridge.onWindowStateChange(windowHandler)).toBe(unsubscribeWindow);
    expect(appBridge.onNativeMenuAction(menuHandler)).toBe(unsubscribeMenu);
    expect(api?.onWindowStateChange).toHaveBeenCalledWith(windowHandler);
    expect(api?.onNativeMenuAction).toHaveBeenCalledWith(menuHandler);
  });

  it('uses web fallbacks when a desktop bridge omits optional methods', async () => {
    installDesktopApi({
      openHelp: undefined,
      getWindowState: undefined,
      minimizeWindow: undefined,
      toggleMaximizeWindow: undefined,
      closeWindow: undefined,
      onWindowStateChange: undefined,
      onNativeMenuAction: undefined,
    });

    await expect(appBridge.openHelp()).resolves.toBe(true);
    await expect(appBridge.getWindowState()).resolves.toBeNull();
    await expect(appBridge.minimizeWindow()).resolves.toBeUndefined();
    await expect(appBridge.toggleMaximizeWindow()).resolves.toBeUndefined();
    await expect(appBridge.closeWindow()).resolves.toBeUndefined();

    expect(window.open).toHaveBeenCalledWith('/docs/index.html', '_blank', 'noopener,noreferrer');
    expect(appBridge.onWindowStateChange(vi.fn())()).toBeUndefined();
    expect(appBridge.onNativeMenuAction(vi.fn())()).toBeUndefined();
    expect(isDesktopRuntime()).toBe(true);
  });
});
