# Electron Integration

The desktop build wraps the same Vite renderer in Electron. The renderer is
still the editor; Electron adds a privileged main process, offline license
state and a preload bridge.

## Main Process

Source: `electron/main.cts`.

Startup sequence:

1. Resolve renderer URL or built `index.html`.
2. Create `LicenseManager`.
3. Start license IPC handlers before the first window opens.
4. Create a `BrowserWindow` with `preload.cts`.
5. Load Vite dev server in dev mode or built HTML in packaged mode.
6. Stop the license manager on app shutdown.

The main process does not decode or edit Apollo maps. Map IO remains in the
renderer worker stack.

## Preload Bridge

Source: `electron/preload.cts`.

The bridge exposes one global:

```ts
window.apolloMapStudioLicense;
```

Methods:

- `getState()`
- `getMachineCode()`
- `activate(code)`
- `deactivate()`
- `onChange(listener)`

Renderer code wraps this in `src/lib/license-bridge.ts`, which provides a
permissive fallback when the global is absent in web builds.

## Renderer Boundary

The renderer never imports Electron directly. It talks to:

- `licenseBridge` for desktop license IPC;
- `licenseStore` for React state;
- `assertEditable()` for edit guards.

This keeps web development and desktop packaging on the same UI code path.

## Build Commands

Relevant scripts in `package.json`:

- `pnpm electron:dev`
- `pnpm build:electron`
- `pnpm build:desktop`
- `pnpm electron:start`
- `pnpm package`
- `pnpm package:linux`
- `pnpm package:mac`
- `pnpm package:win`

`build:desktop` runs the web build first, then compiles Electron TypeScript.
