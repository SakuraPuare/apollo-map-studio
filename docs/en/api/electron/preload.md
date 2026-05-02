---
title: electron/preload.cts — contextBridge IPC bridge
description: Exposes apolloMapStudio / apolloMapStudioLicense via contextBridge.exposeInMainWorld; the only IPC surface visible to the renderer.
---

# `electron/preload.cts` — contextBridge IPC bridge

> Source: `electron/preload.cts` · 47 lines · CommonJS module (`.cts`)

## Purpose

`preload.cts` runs inside the Chromium sandbox (`sandbox: true`) and has access to the safe subset of Electron (`ipcRenderer`, etc.). It uses `contextBridge.exposeInMainWorld` to inject two objects into the renderer's `window`:

1. `window.apolloMapStudio` — read-only platform / version metadata.
2. `window.apolloMapStudioLicense` — the licensing IPC client.

The renderer wraps these via `src/lib/license-bridge.ts` so the "object is undefined" case (browser preview) never reaches consumer code.

## contextBridge exposure #1: `apolloMapStudio`

```ts
contextBridge.exposeInMainWorld('apolloMapStudio', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
```

Read-only metadata used by the About panel / debug header:

```ts
window.apolloMapStudio?.platform; // 'darwin' | 'linux' | 'win32'
window.apolloMapStudio?.versions; // { chrome: '120…', electron: '41.0.0', node: '20…' }
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
| `window.apolloMapStudio`                       | (inline)                                      | `process.platform` / `process.versions`      |
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

No standalone tests; the contextBridge surface is exercised by end-to-end / Spectron tests.

## Consumers

The sole consumer: [`license-bridge`](../lib/license-bridge.md) — wraps `window.apolloMapStudioLicense?.xxx ?? fallback()`.

UI components must not access `window.apolloMapStudioLicense` directly — they go through `licenseBridge`.

## Source map

| Lines | Content                           |
| ----- | --------------------------------- |
| 1     | imports                           |
| 3     | type imports (erased at runtime)  |
| 5     | `STATUS_BROADCAST_CHANNEL`        |
| 6–11  | `LICENSE_IPC` channels            |
| 13–20 | `apolloMapStudio` exposure        |
| 22–45 | `licenseApi`                      |
| 47    | `apolloMapStudioLicense` exposure |

## See also

- [Electron overview](../electron.md)
- [Main process](./main-process.md)
- [License Manager](./license-manager.md)
- [`license-bridge`](../lib/license-bridge.md) — renderer wrapper
- [`licenseStore`](../store/license-store.md) — React-state mirror
- Electron docs: [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
