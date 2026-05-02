---
title: electron/main.cts — main-process entry
description: BrowserWindow creation, app lifecycle (single-instance / activate / before-quit), LicenseManager start/stop.
---

# `electron/main.cts` — main-process entry

> Source: `electron/main.cts` · 106 lines · CommonJS module (`.cts`)

## Purpose

`main.cts` is the Electron main-process entry. It does four things:

1. Creates the `BrowserWindow` with all Electron 14+ security defaults on.
2. Manages app lifecycle: single-instance lock, `activate`, `window-all-closed`, `before-quit`.
3. Starts `LicenseManager` _before_ window creation so IPC handlers are ready.
4. Wires the external-link interceptor (`setWindowOpenHandler`).

## Key code

### Window creation

```ts
const mainWindow = new BrowserWindow({
  width: 1440,
  height: 960,
  minWidth: 1024,
  minHeight: 700,
  title: 'Apollo Map Studio',
  backgroundColor: '#101318',
  show: false,
  webPreferences: {
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

- `show: false` + `ready-to-show` listener kills the white-flash on launch.
- `backgroundColor: '#101318'` mirrors the design-system `--ams-bg-deep`, avoiding colour pop on theme switch.
- All three security flags are documented in the [Electron overview](../electron.md#security-configuration-maincts).

### Preload path resolution

```ts
function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function getRendererIndexPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}
```

Note: source files are `.cts`, but compiled output is `.cjs`. `tsconfig.electron.json` sets `module: "commonjs"` and the bundler renames extensions, so ESM `import` keeps working at build time.

### Dev / Prod renderer load

```ts
const rendererUrl = process.env.ELECTRON_RENDERER_URL;

if (rendererUrl) {
  await mainWindow.loadURL(rendererUrl);
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  return;
}

await mainWindow.loadFile(getRendererIndexPath());
```

- Dev: pulls assets from the Vite dev server (electron-vite injects `ELECTRON_RENDERER_URL` via `vite.config.ts`); auto-opens detached DevTools.
- Prod: loads `dist/index.html` from the bundle.

### External-link interception

```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    void shell.openExternal(url);
  }
  return { action: 'deny' };
});
```

Every `target="_blank"` / `window.open` is denied; HTTP(S) URLs are handed to the system browser. **Critical security control** — without this, a hijacked link could open arbitrary content inside the Electron process.

### Single-instance lock

```ts
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    licenseManager = new LicenseManager();
    licenseManager.start(); // ← started *before* createMainWindow
    void createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  });
}
```

- A second launch's `requestSingleInstanceLock` returns `false` → `app.quit()`.
- `second-instance` brings the existing window to focus.
- `LicenseManager` **must** start before `createMainWindow`; otherwise the renderer's first `getState` call would arrive before the IPC handler is registered.

### Quit handlers

```ts
app.on('before-quit', () => {
  licenseManager?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- `before-quit` — calls `licenseManager.stop()` to persist TimeGuard state and clear the interval.
- `window-all-closed` — non-macOS quits; macOS keeps the app alive in the dock.

### Windows AppUserModelId

```ts
if (process.platform === 'win32') {
  app.setAppUserModelId('com.apollo-map-studio.app');
}
```

Stable id for Windows toast / taskbar grouping (required by Microsoft guidelines).

## Public API

### Internal functions

| Symbol                   | Kind     | Summary                                     |
| ------------------------ | -------- | ------------------------------------------- |
| `getPreloadPath()`       | fn       | Returns `__dirname/preload.cjs`             |
| `getRendererIndexPath()` | fn       | Returns `dist/index.html`                   |
| `createMainWindow()`     | async fn | Builds BrowserWindow and loads the renderer |

### Module state

```ts
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
let licenseManager: LicenseManager | null = null;
```

`licenseManager` is `let` so the `before-quit` handler can call `stop()` without losing the reference.

## Side effects

- Registers `app.on(...)` listeners.
- Creates a `BrowserWindow` (GPU / OS resources).
- Starts `LicenseManager` (persisted state + setInterval).
- Installs `setWindowOpenHandler`.

## Test coverage

Main-process logic is normally exercised by Spectron / Playwright-Electron end-to-end tests. The repo currently does a smoke check via `pnpm package` in CI rather than a dedicated unit test.

## Related IPC

`LicenseManager.start()` registers the channels documented in [License Manager](./license-manager.md):

- `license:get-state`
- `license:get-machine-code`
- `license:activate`
- `license:deactivate`

Broadcast channel: `license:state` (sent to every `BrowserWindow`).

## Security checklist

| Item               | Config                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| `contextIsolation` | ✓ true                                                                                 |
| `nodeIntegration`  | ✗ false                                                                                |
| `sandbox`          | ✓ true                                                                                 |
| External links     | denied by default; HTTP(S) routed to `shell.openExternal`                              |
| File dialogs       | **not enabled** — current desktop build keeps file IO inside the worker / browser path |
| Auto-updater       | **not enabled**                                                                        |

## Source map

| Lines   | Content                                   |
| ------- | ----------------------------------------- |
| 1–2     | imports                                   |
| 4       | `LicenseManager` import                   |
| 6       | `rendererUrl` from env                    |
| 8       | `licenseManager` module state             |
| 10–16   | `getPreloadPath` / `getRendererIndexPath` |
| 18–54   | `createMainWindow`                        |
| 56–57   | `app.setName`                             |
| 58–60   | Win32 AppUserModelId                      |
| 62–95   | Single-instance lock + `whenReady`        |
| 97–99   | `before-quit`                             |
| 101–105 | `window-all-closed`                       |

## See also

- [Electron overview](../electron.md)
- [Preload](./preload.md)
- [License Manager](./license-manager.md)
- `tsconfig.electron.json` — compile config (emits `.cjs`)
- `vite.config.ts` — `ELECTRON_RENDERER_URL` injection
