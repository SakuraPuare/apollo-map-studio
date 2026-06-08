---
title: electron/preload.cts — contextBridge IPC bridge
description: Exposes apolloMapStudio / apolloMapStudioLicense via contextBridge.exposeInMainWorld; wraps app, window, native menu, and license IPC.
---

# `electron/preload.cts` — contextBridge IPC bridge

> Source: `electron/preload.cts` · 93 lines · CommonJS module (`.cts`)

## Purpose

`preload.cts` runs inside the Chromium sandbox (`sandbox: true`) and has access to the safe subset of Electron (`ipcRenderer`, etc.). It uses `contextBridge.exposeInMainWorld` to inject two objects into the renderer's `window`:

1. `window.apolloMapStudio` — app info, Help, window controls, window-state subscription, and native-menu action subscription.
2. `window.apolloMapStudioLicense` — the licensing IPC client.

The renderer wraps these via `src/lib/app-bridge.ts` and `src/lib/license-bridge.ts` so the "object is undefined" case (browser preview) never reaches consumer code.

## contextBridge exposure #1: `apolloMapStudio`

```ts
contextBridge.exposeInMainWorld('apolloMapStudio', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getAppInfo() {
    return ipcRenderer.invoke(APP_IPC.GET_INFO);
  },
  openHelp() {
    return ipcRenderer.invoke(APP_IPC.OPEN_HELP);
  },
  getWindowState() {
    return ipcRenderer.invoke(APP_IPC.GET_WINDOW_STATE);
  },
  minimizeWindow() {
    return ipcRenderer.invoke(APP_IPC.WINDOW_MINIMIZE);
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke(APP_IPC.WINDOW_TOGGLE_MAXIMIZE);
  },
  closeWindow() {
    return ipcRenderer.invoke(APP_IPC.WINDOW_CLOSE);
  },
  onWindowStateChange(handler) {
    // register app:window-state listener, return unsubscribe
  },
  onNativeMenuAction(handler) {
    // register app:native-menu-action listener, return unsubscribe
  },
});
```

Minimal app/runtime, Help, window-control, and native-menu action bridge used by `appBridge`:

```ts
window.apolloMapStudio?.platform; // 'darwin' | 'linux' | 'win32'
window.apolloMapStudio?.versions; // { chrome: '120…', electron: '41.0.0', node: '20…' }
await window.apolloMapStudio?.getAppInfo?.();
await window.apolloMapStudio?.openHelp?.();
```

The renderer must use `?.` — `window.apolloMapStudio` is undefined in a browser-preview build.

## contextBridge exposure #2: `apolloMapStudioLicense`

### IPC channel constants

```ts
const STATUS_BROADCAST_CHANNEL = 'license:state';
const LICENSE_IPC = {
  GET_STATE: 'license:get-state',
  GET_MACHINE_CODE: 'license:get-machine-code',
  ACTIVATE: 'license:activate',
  DEACTIVATE: 'license:deactivate',
} as const;
```

The values must match the same constants in `electron/license/manager.cts`. Two copies exist because `manager.cts` runs in the main process and `preload.cts` runs in the sandbox; preload's restricted module resolution prevents shared imports.

### `licenseApi` instance

```ts
const licenseApi = {
  /** Snapshot of the current license state. */
  getState(): Promise<LicenseState> {
    return ipcRenderer.invoke(LICENSE_IPC.GET_STATE) as Promise<LicenseState>;
  },
  /** The 16-character machine code for this device. */
  getMachineCode(): Promise<string> {
    return ipcRenderer.invoke(LICENSE_IPC.GET_MACHINE_CODE) as Promise<string>;
  },
  /** Try to activate with a given code. Result includes updated state. */
  activate(code: string): Promise<ActivationResult> {
    return ipcRenderer.invoke(LICENSE_IPC.ACTIVATE, code) as Promise<ActivationResult>;
  },
  /** Remove the stored license (returns the post-clear state). */
  deactivate(): Promise<LicenseState> {
    return ipcRenderer.invoke(LICENSE_IPC.DEACTIVATE) as Promise<LicenseState>;
  },
  /** Subscribe to push updates. Returns an unsubscribe fn. */
  onChange(handler: (s: LicenseState) => void): () => void {
    const listener = (_evt: Electron.IpcRendererEvent, state: LicenseState) => handler(state);
    ipcRenderer.on(STATUS_BROADCAST_CHANNEL, listener);
    return () => ipcRenderer.off(STATUS_BROADCAST_CHANNEL, listener);
  },
};

contextBridge.exposeInMainWorld('apolloMapStudioLicense', licenseApi);
```

## Type mapping

| Window object                                  | Renderer type                                 | Main-process implementation                  |
| ---------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| `window.apolloMapStudio`                       | inline type in `src/lib/app-bridge.ts`        | app/window/native menu IPC                   |
| `window.apolloMapStudioLicense.getState`       | `() => Promise<LicenseState>`                 | `LicenseManager.refresh()`                   |
| `window.apolloMapStudioLicense.getMachineCode` | `() => Promise<string>`                       | `MachineCodeResult.code`                     |
| `window.apolloMapStudioLicense.activate`       | `(code: string) => Promise<ActivationResult>` | `LicenseManager.activate(code)`              |
| `window.apolloMapStudioLicense.deactivate`     | `() => Promise<LicenseState>`                 | `LicenseManager.deactivate()`                |
| `window.apolloMapStudioLicense.onChange`       | `(h) => unsubscribe`                          | `BrowserWindow.send('license:state', state)` |

## Security notes

### Why contextBridge

Exposing `ipcRenderer` directly (`window.ipcRenderer = ipcRenderer`) is an anti-pattern: the renderer could call `invoke('any:channel')` and bypass the sandbox.

`contextBridge.exposeInMainWorld(name, obj)` clones (by value) and freezes `obj` before attaching it to `window`. The renderer can call only the predefined methods, never the underlying `ipcRenderer`.

### Why Promise-only

`ipcRenderer.invoke` is Promise-based — main-process handlers reject on error. No callbacks, no sync IPC (perf + deadlock risk).

### Why bespoke `onChange` instead of an EventEmitter

Sandbox preload cannot expose a full `EventEmitter` through contextBridge (function chains aren't serialised). The "register + return unsubscribe" pattern fits React `useEffect` cleanup naturally.

## Side effects

- Attaches two objects to the renderer's `window`.
- Each `onChange` call adds a listener on `STATUS_BROADCAST_CHANNEL`.
- Listeners are not auto-cleaned — the caller must invoke the returned unsubscribe (otherwise it leaks until the BrowserWindow is destroyed).

## Test coverage

`pnpm test:electron` includes preload unit tests for the contextBridge surface, IPC routing, and subscription filtering; `pnpm test:electron:e2e` also verifies the renderer-visible preload bridge in the real desktop shell.

## Consumers

Main consumers:

- `src/lib/app-bridge.ts` — wraps the `window.apolloMapStudio` app/runtime, Help, window, and native-menu action APIs.
- [`license-bridge`](../lib/license-bridge.md) — wraps `window.apolloMapStudioLicense?.xxx ?? fallback()`.

UI components must not access these `window` objects directly — they go through `appBridge` / `licenseBridge`.

## Source map

| Lines | Content                            |
| ----- | ---------------------------------- |
| 1     | imports                            |
| 3     | type imports (erased at runtime)   |
| 5     | `STATUS_BROADCAST_CHANNEL`         |
| 6–11  | `LICENSE_IPC` channels             |
| 13–24 | `APP_IPC` / `LICENSE_IPC` channels |
| 29–59 | `apolloMapStudio` exposure         |
| 63–91 | `licenseApi`                       |
| 93    | `apolloMapStudioLicense` exposure  |

## See also

- [Electron overview](../electron.md)
- [Main process](./main-process.md)
- [License Manager](./license-manager.md)
- [`license-bridge`](../lib/license-bridge.md) — renderer wrapper
- [`licenseStore`](../store/license-store.md) — React-state mirror
- Electron docs: [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
