import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: NodeJS.Module | null, isMain: boolean): unknown;
};

type MainModule = {
  __mainTestInternals: {
    configureExternalNavigation(window: Electron.BrowserWindow): void;
    getDevelopmentRendererUrl(): string | null;
    getExternalNavigationTarget(url: string): string | null;
    isInternalNavigationUrl(url: string): boolean;
  };
};

type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };
type NavigationEventName = 'will-navigate' | 'will-redirect';
type NavigationListener = (event: NavigationEvent, url: string) => void;
type ProtocolHandler = (request: { url: string }) => Promise<unknown> | unknown;
type NavigationEvent = {
  defaultPrevented: boolean;
  preventDefault(): void;
};

interface MockApp {
  isPackaged: boolean;
  name: string;
  dock: {
    setIcon(icon: unknown): void;
  };
  getAppPath(): string;
  getName(): string;
  getVersion(): string;
  setAppUserModelId(id: string): void;
  setName(name: string): void;
  setPath(name: string, value: string): void;
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  whenReady(): Promise<void>;
}

const loadCjs = createRequire(__filename);
const mainPath = loadCjs.resolve(path.resolve(__dirname, '..', 'main.cjs'));
const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let appMock: MockApp;
let fetchUrls: string[];
let openExternalUrls: string[];
let protocolHandlers: Record<string, ProtocolHandler>;
let registeredSchemes: unknown[];
let tempRoots: string[];

function createMockApp(): MockApp {
  return {
    isPackaged: false,
    name: 'Apollo Map Studio',
    dock: {
      setIcon() {
        // Test stub.
      },
    },
    getAppPath() {
      return process.cwd();
    },
    getName() {
      return 'Apollo Map Studio';
    },
    getVersion() {
      return '0.0.0-test';
    },
    setAppUserModelId() {
      // Test stub.
    },
    setName(name: string) {
      this.name = name;
    },
    setPath() {
      // Test stub.
    },
    requestSingleInstanceLock() {
      return false;
    },
    quit() {
      // Test stub.
    },
    on() {
      // Test stub.
    },
    whenReady() {
      return Promise.resolve();
    },
  };
}

function createMockBrowserWindowClass() {
  class MockBrowserWindow {
    static windows: MockBrowserWindow[] = [];

    static fromWebContents() {
      return null;
    }

    static getAllWindows() {
      return MockBrowserWindow.windows;
    }

    webContents = {
      send() {
        // Test stub.
      },
      setWindowOpenHandler() {
        // Test stub.
      },
      on() {
        // Test stub.
      },
      openDevTools() {
        // Test stub.
      },
    };

    private destroyed = false;
    private maximized = false;
    private minimized = false;

    constructor() {
      MockBrowserWindow.windows.push(this);
    }

    once(_event: string, listener: () => void) {
      listener();
    }

    on() {
      // Test stub.
    }

    show() {
      // Test stub.
    }

    close() {
      this.destroyed = true;
    }

    destroy() {
      this.destroyed = true;
    }

    focus() {
      // Test stub.
    }

    restore() {
      this.minimized = false;
    }

    minimize() {
      this.minimized = true;
    }

    maximize() {
      this.maximized = true;
    }

    unmaximize() {
      this.maximized = false;
    }

    isDestroyed() {
      return this.destroyed;
    }

    isMinimized() {
      return this.minimized;
    }

    isMaximized() {
      return this.maximized;
    }

    isFullScreen() {
      return false;
    }

    isFocused() {
      return true;
    }

    loadURL() {
      return Promise.resolve();
    }

    loadFile() {
      return Promise.resolve();
    }
  }

  return MockBrowserWindow;
}

function createTempDocsRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'apms-docs-protocol-'));
  tempRoots.push(root);

  const docsRoot = path.join(root, 'dist', 'docs');
  mkdirSync(path.join(docsRoot, 'guide'), { recursive: true });
  writeFileSync(path.join(docsRoot, 'index.html'), '<h1>Docs</h1>');
  writeFileSync(path.join(docsRoot, '404.html'), '<h1>Not found</h1>');
  writeFileSync(path.join(docsRoot, 'guide.html'), '<h1>Guide</h1>');
  writeFileSync(path.join(docsRoot, 'guide', 'index.html'), '<h1>Guide index</h1>');

  return { root, docsRoot };
}

function waitForReadySideEffects() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  appMock = createMockApp();
  fetchUrls = [];
  openExternalUrls = [];
  protocolHandlers = {};
  registeredSchemes = [];
  tempRoots = [];
  delete process.env.APOLLO_MAP_STUDIO_E2E;
  delete process.env.APOLLO_MAP_STUDIO_USER_DATA_DIR;
  delete process.env.ELECTRON_RENDERER_URL;

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: NodeJS.Module | null,
    isMain: boolean,
  ) {
    if (request === 'electron') {
      const BrowserWindow = createMockBrowserWindowClass();

      return {
        app: appMock,
        BrowserWindow,
        dialog: {
          showErrorBox() {
            // Test stub.
          },
        },
        ipcMain: {
          handle() {
            // Test stub.
          },
        },
        Menu: {
          buildFromTemplate(template: unknown) {
            return template;
          },
          setApplicationMenu() {
            // Test stub.
          },
        },
        nativeImage: {
          createFromPath() {
            return {
              isEmpty() {
                return true;
              },
            };
          },
        },
        net: {
          fetch(url: string) {
            fetchUrls.push(url);
            return Promise.resolve(null);
          },
        },
        protocol: {
          handle(scheme: string, handler: ProtocolHandler) {
            protocolHandlers[scheme] = handler;
          },
          registerSchemesAsPrivileged(schemes: unknown[]) {
            registeredSchemes = schemes;
          },
        },
        shell: {
          openExternal(url: string) {
            openExternalUrls.push(url);
            return Promise.resolve();
          },
        },
      };
    }
    if (request === './access-guard-runtime.cjs') {
      return {
        checkAccessGuardAccess() {
          return { allowed: true };
        },
      };
    }
    if (request === './license/manager.cjs') {
      return {
        LicenseManager: class {
          start() {
            // Test stub.
          }

          stop() {
            // Test stub.
          }
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
});

afterEach(() => {
  moduleWithLoad._load = originalLoad;
  delete loadCjs.cache[mainPath];
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  delete process.env.APOLLO_MAP_STUDIO_E2E;
  delete process.env.APOLLO_MAP_STUDIO_USER_DATA_DIR;
  delete process.env.ELECTRON_RENDERER_URL;
});

function loadMain(): MainModule {
  delete loadCjs.cache[mainPath];
  return loadCjs(mainPath) as MainModule;
}

test('app protocol is registered as a secure fetchable docs protocol', () => {
  loadMain();

  assert.deepEqual(registeredSchemes, [
    {
      scheme: 'apollo-map-studio',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
});

test('app protocol serves docs from the docs root and falls back for escapes', async () => {
  const { docsRoot, root } = createTempDocsRoot();
  appMock.getAppPath = () => root;
  appMock.requestSingleInstanceLock = () => true;
  loadMain();
  await waitForReadySideEffects();

  const handler = protocolHandlers['apollo-map-studio'];
  if (!handler) {
    throw new Error('app protocol handler was registered');
  }
  const protocolHandler = handler;

  async function fetchUrl(url: string) {
    fetchUrls = [];
    await protocolHandler({ url });
    assert.equal(fetchUrls.length, 1);
    const fetchedUrl = fetchUrls[0];
    assert.equal(typeof fetchedUrl, 'string');
    return fetchedUrl;
  }

  const indexUrl = pathToFileURL(path.join(docsRoot, 'index.html')).toString();
  const guideUrl = pathToFileURL(path.join(docsRoot, 'guide.html')).toString();
  const guideIndexUrl = pathToFileURL(path.join(docsRoot, 'guide', 'index.html')).toString();
  const fallbackUrl = pathToFileURL(path.join(docsRoot, '404.html')).toString();

  assert.equal(await fetchUrl('apollo-map-studio://app/'), indexUrl);
  assert.equal(await fetchUrl('apollo-map-studio://app/docs'), indexUrl);
  assert.equal(await fetchUrl('apollo-map-studio://app/docs/index.html'), indexUrl);
  assert.equal(await fetchUrl('apollo-map-studio://app/docs/guide'), guideUrl);
  assert.equal(await fetchUrl('apollo-map-studio://app/docs/guide/'), guideIndexUrl);

  for (const url of [
    'apollo-map-studio://app/docs/missing',
    'apollo-map-studio://app/docs/%2e%2e/%2e%2e/package.json',
    'apollo-map-studio://app/docs/%E0%A4%A',
    'not-a-url',
  ]) {
    assert.equal(await fetchUrl(url), fallbackUrl);
  }
});

function createNavigationEvent(): NavigationEvent {
  const event: NavigationEvent = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

function createBrowserWindowHarness() {
  let openHandler: WindowOpenHandler | null = null;
  const listeners: Record<NavigationEventName, NavigationListener[]> = {
    'will-navigate': [],
    'will-redirect': [],
  };

  const window = {
    webContents: {
      setWindowOpenHandler(handler: WindowOpenHandler) {
        openHandler = handler;
      },
      on(event: NavigationEventName, listener: NavigationListener) {
        listeners[event].push(listener);
      },
    },
  } as unknown as Electron.BrowserWindow;

  return {
    window,
    getOpenHandler() {
      assert.ok(openHandler, 'window open handler was registered');
      return openHandler;
    },
    emitNavigation(eventName: NavigationEventName, url: string) {
      const event = createNavigationEvent();
      for (const listener of listeners[eventName]) {
        listener(event, url);
      }
      return event;
    },
  };
}

test('development renderer URL accepts only loopback http(s) URLs', () => {
  const { __mainTestInternals } = loadMain();

  for (const url of [
    'http://localhost:5173/',
    'http://127.0.0.1:5173/',
    'http://[::1]:5173/',
    'https://localhost:5173/',
  ]) {
    process.env.ELECTRON_RENDERER_URL = url;
    assert.equal(__mainTestInternals.getDevelopmentRendererUrl(), url);
  }

  process.env.ELECTRON_RENDERER_URL = 'http://example.com:5173/';
  assert.throws(
    () => __mainTestInternals.getDevelopmentRendererUrl(),
    /Unsupported ELECTRON_RENDERER_URL host: example\.com/,
  );

  process.env.ELECTRON_RENDERER_URL = 'file:///tmp/index.html';
  assert.throws(
    () => __mainTestInternals.getDevelopmentRendererUrl(),
    /Unsupported ELECTRON_RENDERER_URL protocol: file:/,
  );

  appMock.isPackaged = true;
  process.env.ELECTRON_RENDERER_URL = 'http://example.com:5173/';
  assert.equal(__mainTestInternals.getDevelopmentRendererUrl(), null);
});

test('same-window navigation allows internal URLs and blocks non-internal URLs', () => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  const { __mainTestInternals } = loadMain();
  const harness = createBrowserWindowHarness();
  __mainTestInternals.configureExternalNavigation(harness.window);

  assert.equal(
    harness.emitNavigation('will-navigate', 'apollo-map-studio://app/docs/index.html')
      .defaultPrevented,
    false,
  );
  assert.equal(
    harness.emitNavigation('will-navigate', 'http://localhost:5173/editor').defaultPrevented,
    false,
  );
  assert.equal(
    harness.emitNavigation('will-navigate', 'http://localhost:5174/editor').defaultPrevented,
    true,
  );

  const externalFileUrl = pathToFileURL(path.join(process.cwd(), '..', 'not-internal.html'));
  assert.equal(
    harness.emitNavigation('will-navigate', externalFileUrl.toString()).defaultPrevented,
    true,
  );
  assert.equal(
    harness.emitNavigation('will-redirect', 'data:text/html,poc').defaultPrevented,
    true,
  );
  assert.deepEqual(openExternalUrls, []);

  assert.equal(
    harness.emitNavigation('will-navigate', 'https://example.com/docs').defaultPrevented,
    true,
  );
  assert.deepEqual(openExternalUrls, ['https://example.com/docs']);

  assert.equal(
    harness.emitNavigation('will-redirect', 'http://example.com/docs').defaultPrevented,
    true,
  );
  assert.deepEqual(openExternalUrls, ['https://example.com/docs']);
});

test('file navigation is internal only inside the packaged renderer dist root', () => {
  const { __mainTestInternals } = loadMain();
  const distRoot = path.resolve(__dirname, '..', '..', 'dist');
  const indexUrl = pathToFileURL(path.join(distRoot, 'index.html')).toString();
  const assetUrl = pathToFileURL(path.join(distRoot, 'assets', 'index.js')).toString();
  const siblingPrefixUrl = pathToFileURL(
    path.join(path.dirname(distRoot), `${path.basename(distRoot)}-evil`, 'index.html'),
  ).toString();
  const parentUrl = pathToFileURL(path.join(distRoot, '..', 'index.html')).toString();

  assert.equal(__mainTestInternals.isInternalNavigationUrl(indexUrl), true);
  assert.equal(__mainTestInternals.isInternalNavigationUrl(assetUrl), true);
  assert.equal(__mainTestInternals.isInternalNavigationUrl(siblingPrefixUrl), false);
  assert.equal(__mainTestInternals.isInternalNavigationUrl(parentUrl), false);
});

test('external navigation target rejects non-https and credentialed URLs', () => {
  const { __mainTestInternals } = loadMain();

  assert.equal(
    __mainTestInternals.getExternalNavigationTarget('https://example.com/path?q=1'),
    'https://example.com/path?q=1',
  );

  for (const url of [
    'http://example.com/path',
    'mailto:support@example.com',
    'file:///tmp/index.html',
    'data:text/html,poc',
    'https://user@example.com/path',
    'https://:pass@example.com/path',
    'https://user:pass@example.com/path',
    'notaurl',
  ]) {
    assert.equal(__mainTestInternals.getExternalNavigationTarget(url), null);
  }
});

test('new-window navigation is always denied and only clean https opens externally', () => {
  const { __mainTestInternals } = loadMain();
  const harness = createBrowserWindowHarness();
  __mainTestInternals.configureExternalNavigation(harness.window);

  const openHandler = harness.getOpenHandler();
  assert.deepEqual(openHandler({ url: 'https://example.com/path?q=1' }), { action: 'deny' });
  assert.deepEqual(openExternalUrls, ['https://example.com/path?q=1']);

  assert.deepEqual(openHandler({ url: 'http://example.com/path' }), { action: 'deny' });
  assert.deepEqual(openExternalUrls, ['https://example.com/path?q=1']);

  assert.deepEqual(openHandler({ url: 'https://user@example.com/path' }), { action: 'deny' });
  assert.deepEqual(openExternalUrls, ['https://example.com/path?q=1']);

  assert.deepEqual(openHandler({ url: 'data:text/html,poc' }), { action: 'deny' });
  assert.deepEqual(openExternalUrls, ['https://example.com/path?q=1']);
});
