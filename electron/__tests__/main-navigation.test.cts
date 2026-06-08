import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
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
let openExternalUrls: string[];

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

beforeEach(() => {
  appMock = createMockApp();
  openExternalUrls = [];
  delete process.env.APOLLO_MAP_STUDIO_E2E;
  delete process.env.APOLLO_MAP_STUDIO_USER_DATA_DIR;
  delete process.env.ELECTRON_RENDERER_URL;

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: NodeJS.Module | null,
    isMain: boolean,
  ) {
    if (request === 'electron') {
      return {
        app: appMock,
        BrowserWindow: {
          fromWebContents() {
            return null;
          },
          getAllWindows() {
            return [];
          },
        },
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
          fetch() {
            return Promise.resolve(null);
          },
        },
        protocol: {
          handle() {
            // Test stub.
          },
          registerSchemesAsPrivileged() {
            // Test stub.
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
    return originalLoad.call(this, request, parent, isMain);
  };
});

afterEach(() => {
  moduleWithLoad._load = originalLoad;
  delete loadCjs.cache[mainPath];
  delete process.env.APOLLO_MAP_STUDIO_E2E;
  delete process.env.APOLLO_MAP_STUDIO_USER_DATA_DIR;
  delete process.env.ELECTRON_RENDERER_URL;
});

function loadMain(): MainModule {
  delete loadCjs.cache[mainPath];
  return loadCjs(mainPath) as MainModule;
}

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
