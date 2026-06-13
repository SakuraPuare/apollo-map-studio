import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';

type ExposedGlobals = Record<string, unknown>;
type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: NodeJS.Module | null, isMain: boolean): unknown;
};
type IpcListener = (event: unknown, payload: unknown) => void;
type InvokeRecord = {
  channel: string;
  args: unknown[];
};
type ListenerRecord = {
  channel: string;
  listener: IpcListener;
};

const loadCjs = createRequire(__filename);
const preloadPath = loadCjs.resolve(path.resolve(__dirname, '..', 'preload.cjs'));
const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
let exposed: ExposedGlobals;
let invokeRecords: InvokeRecord[];
let onRecords: ListenerRecord[];
let offRecords: ListenerRecord[];
let syncChannels: string[];
let callbackId = 0;

function nextCallbackId(): number {
  callbackId += 1;
  return callbackId;
}

beforeEach(() => {
  exposed = {};
  invokeRecords = [];
  onRecords = [];
  offRecords = [];
  syncChannels = [];
  callbackId = 0;

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: NodeJS.Module | null,
    isMain: boolean,
  ) {
    if (request === 'electron') {
      return {
        contextBridge: {
          exposeInMainWorld(name: string, api: unknown) {
            exposed[name] = api;
          },
        },
        ipcRenderer: {
          invoke(channel: string, ...args: unknown[]) {
            invokeRecords.push({ channel, args });
            return Promise.resolve(null);
          },
          on(channel: string, listener: IpcListener) {
            onRecords.push({ channel, listener });
            return listener;
          },
          off(channel: string, listener: IpcListener) {
            offRecords.push({ channel, listener });
            return listener;
          },
          sendSync(channel: string) {
            syncChannels.push(channel);
            return null;
          },
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
});

afterEach(() => {
  moduleWithLoad._load = originalLoad;
  delete loadCjs.cache[preloadPath];
});

function loadPreload(): void {
  delete loadCjs.cache[preloadPath];
  loadCjs(preloadPath);
}

function onRecordAt(index: number): ListenerRecord {
  const record = onRecords[index];
  assert.ok(record, `expected IPC listener record at index ${index}`);
  return record;
}

test('preload exposes only the renderer API and license API globals', () => {
  loadPreload();

  assert.deepEqual(Object.keys(exposed).sort(), ['apolloMapStudio', 'apolloMapStudioLicense']);
  assert.equal('accessGuardIdentity' in exposed, false);
  assert.equal(syncChannels.length, 0);
});

test('apolloMapStudio routes through the expected app IPC channels', async () => {
  loadPreload();
  const api = exposed.apolloMapStudio as {
    getAppInfo(): Promise<unknown>;
    openHelp(): Promise<unknown>;
    getWindowState(): Promise<unknown>;
    minimizeWindow(): Promise<unknown>;
    toggleMaximizeWindow(): Promise<unknown>;
    closeWindow(): Promise<unknown>;
    onWindowStateChange(handler: (state: unknown) => void): () => void;
    onNativeMenuAction(handler: (actionId: string) => void): () => void;
  };

  await api.getAppInfo();
  await api.openHelp();
  await api.getWindowState();
  await api.minimizeWindow();
  await api.toggleMaximizeWindow();
  await api.closeWindow();

  assert.deepEqual(invokeRecords, [
    { channel: 'app:get-info', args: [] },
    { channel: 'app:open-help', args: [] },
    { channel: 'app:get-window-state', args: [] },
    { channel: 'app:window-minimize', args: [] },
    { channel: 'app:window-toggle-maximize', args: [] },
    { channel: 'app:window-close', args: [] },
  ]);

  const unsubWindow = api.onWindowStateChange(() => nextCallbackId());
  const unsubMenu = api.onNativeMenuAction(() => nextCallbackId());
  assert.deepEqual(
    onRecords.map((record) => record.channel),
    ['app:window-state', 'app:native-menu-action'],
  );

  unsubWindow();
  unsubMenu();
  assert.deepEqual(offRecords, onRecords);
});

test('apolloMapStudio subscription callbacks forward payloads and filter native menu actions', () => {
  loadPreload();
  const api = exposed.apolloMapStudio as {
    onWindowStateChange(handler: (state: unknown) => void): () => void;
    onNativeMenuAction(handler: (actionId: string) => void): () => void;
  };
  const windowStates: unknown[] = [];
  const nativeActions: string[] = [];

  const unsubscribeWindow = api.onWindowStateChange((state) => windowStates.push(state));
  const unsubscribeMenu = api.onNativeMenuAction((actionId) => nativeActions.push(actionId));
  const windowState = {
    platform: 'linux',
    isMaximized: true,
    isFullscreen: false,
    isFocused: true,
  };
  const windowStateRecord = onRecordAt(0);
  const nativeMenuRecord = onRecordAt(1);

  windowStateRecord.listener({}, windowState);
  nativeMenuRecord.listener({}, 'settings');
  nativeMenuRecord.listener({}, 42);
  nativeMenuRecord.listener({}, { actionId: 'about' });
  nativeMenuRecord.listener({}, 'view:mapEditor');

  assert.deepEqual(windowStates, [windowState]);
  assert.deepEqual(nativeActions, ['settings', 'view:mapEditor']);

  unsubscribeWindow();
  unsubscribeMenu();
  assert.deepEqual(offRecords, onRecords);
});

test('license API routes through expected license IPC channels and unsubscribes', async () => {
  loadPreload();
  const api = exposed.apolloMapStudioLicense as {
    getState(): Promise<unknown>;
    getMachineCode(): Promise<unknown>;
    activate(code: string): Promise<unknown>;
    deactivate(): Promise<unknown>;
    onChange(handler: (state: unknown) => void): () => void;
  };

  await api.getState();
  await api.getMachineCode();
  await api.activate('APMS1.test.sig');
  await api.deactivate();

  assert.deepEqual(invokeRecords, [
    { channel: 'license:get-state', args: [] },
    { channel: 'license:get-machine-code', args: [] },
    { channel: 'license:activate', args: ['APMS1.test.sig'] },
    { channel: 'license:deactivate', args: [] },
  ]);

  const unsubscribe = api.onChange(() => nextCallbackId());
  assert.deepEqual(
    onRecords.map((record) => record.channel),
    ['license:state'],
  );

  unsubscribe();
  assert.deepEqual(offRecords, onRecords);
});

test('license API exposes only the expected bridge shape', () => {
  loadPreload();
  const api = exposed.apolloMapStudioLicense as Record<string, unknown>;

  assert.deepEqual(Object.keys(api).sort(), [
    'activate',
    'deactivate',
    'getMachineCode',
    'getState',
    'onChange',
  ]);
  assert.equal(typeof api.getState, 'function');
  assert.equal(typeof api.getMachineCode, 'function');
  assert.equal(typeof api.activate, 'function');
  assert.equal(typeof api.deactivate, 'function');
  assert.equal(typeof api.onChange, 'function');
  assert.equal((api.getState as Function).length, 0);
  assert.equal((api.getMachineCode as Function).length, 0);
  assert.equal((api.activate as Function).length, 1);
  assert.equal((api.deactivate as Function).length, 0);
  assert.equal((api.onChange as Function).length, 1);

  for (const forbidden of [
    'token',
    'privateKey',
    'publicKey',
    'manager',
    'storage',
    'ipcRenderer',
    'LICENSE_IPC',
  ]) {
    assert.equal(forbidden in api, false, `license bridge leaked ${forbidden}`);
  }
});

test('license onChange forwards state payload and unsubscribes the registered listener', () => {
  loadPreload();
  const api = exposed.apolloMapStudioLicense as {
    onChange(handler: (state: unknown) => void): () => void;
  };
  const states: unknown[] = [];
  const state = {
    status: 'active',
    machineCode: '0123456789ABCDEF',
    license: {
      lic: 'LIC-001',
      name: 'Test User',
      expires: 0,
    },
  };

  const unsubscribe = api.onChange((nextState) => states.push(nextState));
  onRecordAt(0).listener({}, state);

  assert.deepEqual(states, [state]);

  unsubscribe();
  assert.deepEqual(offRecords, onRecords);
});
