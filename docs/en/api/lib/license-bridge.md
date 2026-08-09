---
title: license-bridge — renderer IPC wrapper for licensing
description: Wraps window.apolloMapStudioLicense (exposed by preload), unifies the browser fallback, and types LicenseState / ActivationResult.
---

# `license-bridge` — renderer IPC wrapper for licensing

> Source: `src/lib/license-bridge.ts` · 106 lines

## Purpose

`license-bridge` wraps `window.apolloMapStudioLicense` (exposed by `electron/preload.cts` via `contextBridge.exposeInMainWorld`) so the rest of the renderer never deals with `undefined` global checks.

In a pure web build (no Electron), every call falls back to a perpetual "trial" state with `canEdit=true` so dev / Storybook / browser preview still works.

## Public API

| Symbol             | Kind      | Signature             | Summary                         |
| ------------------ | --------- | --------------------- | ------------------------------- |
| `LicenseStatus`    | union     | 8 status strings      | Renderer-side license status    |
| `LicenseState`     | interface | see below             | Full state snapshot             |
| `ActivationResult` | interface | see below             | Activation outcome              |
| `licenseBridge`    | const     | `LicenseApi` instance | Default object with 5 methods   |
| `isDesktopBuild()` | fn        | `() => boolean`       | Whether running inside Electron |

### `type LicenseStatus`

```ts
export type LicenseStatus =
  | 'trial'
  | 'activated'
  | 'expired_trial'
  | 'expired_license'
  | 'tampered'
  | 'machine_mismatch'
  | 'invalid'
  | 'not_started';
```

| Status             | canEdit | Trigger                                               |
| ------------------ | ------- | ----------------------------------------------------- |
| `trial`            | true    | Within 7 days of first launch                         |
| `activated`        | true    | Activated, within validity window                     |
| `expired_trial`    | false   | Trial expired                                         |
| `expired_license`  | false   | Activated license expired                             |
| `tampered`         | false   | Clock rolled back / HMAC mismatch / fingerprint drift |
| `machine_mismatch` | false   | Token's `machine` ≠ current code                      |
| `invalid`          | false   | Signature verification failed                         |
| `not_started`      | false   | System time < trial start (clock skew)                |

### `interface LicenseState`

```ts
export interface LicenseState {
  status: LicenseStatus;
  canEdit: boolean;
  machineCode: string; // 16-char code for this device
  trialStart: number; // Trial start (epoch ms)
  trialEnd: number; // Trial end (epoch ms)
  daysRemaining: number | null; // Days left (null = perpetual)
  hoursRemaining: number | null; // Hours left
  license: { id: string; name: string; issued: number; expires: number } | null;
  checkedAt: number; // Last main-process check (epoch ms)
  reason: string; // Human-readable status line
}
```

### `interface ActivationResult`

```ts
export interface ActivationResult {
  ok: boolean;
  state: LicenseState; // Post-attempt state
  errorCode?:
    | 'invalid_format'
    | 'invalid_signature'
    | 'machine_mismatch'
    | 'expired'
    | 'replay'
    | 'storage_error'
    | 'unknown';
  errorMessage?: string;
}
```

`replay` — replay protection: same `lic` id is already stored _and_ the new token's `expires` is older (downgrade attempt).

### `interface LicenseApi` (internal)

```ts
interface LicenseApi {
  getState(): Promise<LicenseState>;
  getMachineCode(): Promise<string>;
  activate(code: string): Promise<ActivationResult>;
  deactivate(): Promise<LicenseState>;
  onChange(handler: (s: LicenseState) => void): () => void;
}
```

## Detailed entries

### `licenseBridge.getState()`

```ts
async getState() {
  return window.apolloMapStudioLicense?.getState() ?? Promise.resolve(fallbackState());
}
```

Returns the main-process `LicenseState`. Browser builds use `fallbackState()`:

```ts
{
  status: 'trial',
  canEdit: true,
  machineCode: 'WEB-NO-LICENSE',
  trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
  // ...
  reason: 'Browser preview — licensing disabled.',
}
```

### `licenseBridge.getMachineCode()`

Returns the 16-char machine code, or `'WEB-NO-LICENSE'` in browser builds.

### `licenseBridge.activate(code)`

```ts
async activate(code: string) {
  if (!window.apolloMapStudioLicense) {
    return {
      ok: false,
      state: fallbackState(),
      errorCode: 'unknown',
      errorMessage: 'Activation is only available in the desktop build.',
    };
  }
  return window.apolloMapStudioLicense.activate(code);
}
```

The only fallback that **does not silently succeed** — activation is meaningless in the browser, so we tell the user explicitly.

### `licenseBridge.deactivate()`

Clears any stored license; browser build still returns `fallbackState()`.

### `licenseBridge.onChange(handler)`

```ts
onChange(handler) {
  return window.apolloMapStudioLicense?.onChange(handler) ?? (() => undefined);
}
```

Subscribes to the main-process `license:state` broadcast. The returned unsubscribe is a no-op in browser builds. Components must call it on unmount:

```tsx
useEffect(() => {
  const off = licenseBridge.onChange((s) => useLicenseStore.getState().setState(s));
  return off;
}, []);
```

### `isDesktopBuild()`

```ts
export function isDesktopBuild(): boolean {
  return typeof window !== 'undefined' && Boolean(window.apolloMapStudioLicense);
}
```

For render branches — hide the activation button or show a "Desktop only" hint in browser builds.

## Global type augmentation

```ts
declare global {
  interface Window {
    apolloMapStudioLicense?: LicenseApi;
  }
}
```

Makes `window.apolloMapStudioLicense` typed in every `.ts` file without per-caller re-declaration.

## Side effects

- Writes a global `Window` augmentation (compile-time only).
- Method calls round-trip through `ipcRenderer.invoke`.
- `onChange` registers a listener on the IPC channel; the unsubscribe must be called.

## Test coverage

No standalone tests; covered indirectly through `licenseStore`. Unit tests can stub via `vi.stubGlobal('window.apolloMapStudioLicense', { ... })`.

## Consumers

- `src/store/licenseStore.ts` — `hydrate()` / `setState` / `onChange`
- `src/components/license/ActivationDialog.tsx` — `activate(code)`
- `src/components/license/LicenseBanner.tsx` — `getMachineCode` for the copy button

## Source map

| Lines   | Content                  |
| ------- | ------------------------ |
| 11–19   | `LicenseStatus`          |
| 21–32   | `LicenseState`           |
| 34–46   | `ActivationResult`       |
| 48–54   | `LicenseApi`             |
| 56–60   | `Window` augmentation    |
| 62–75   | `fallbackState()`        |
| 77–101  | `licenseBridge` instance |
| 103–105 | `isDesktopBuild()`       |

## Full `fallbackState()` body

```ts
function fallbackState(): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'WEB-NO-LICENSE',
    trialStart: Date.now(),
    trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
    daysRemaining: 7,
    hoursRemaining: 7 * 24,
    license: null,
    checkedAt: Date.now(),
    reason: 'Browser preview — licensing disabled.',
  };
}
```

Returns a _new_ object on every call (sampled `Date.now()`), so tests that hydrate multiple times do not see a frozen "remaining 7 days".

## Full `licenseBridge` implementation

```ts
export const licenseBridge: LicenseApi = {
  async getState() {
    return window.apolloMapStudioLicense?.getState() ?? Promise.resolve(fallbackState());
  },
  async getMachineCode() {
    return window.apolloMapStudioLicense?.getMachineCode() ?? Promise.resolve('WEB-NO-LICENSE');
  },
  async activate(code: string) {
    if (!window.apolloMapStudioLicense) {
      return {
        ok: false,
        state: fallbackState(),
        errorCode: 'unknown',
        errorMessage: 'Activation is only available in the desktop build.',
      };
    }
    return window.apolloMapStudioLicense.activate(code);
  },
  async deactivate() {
    return window.apolloMapStudioLicense?.deactivate() ?? Promise.resolve(fallbackState());
  },
  onChange(handler) {
    return window.apolloMapStudioLicense?.onChange(handler) ?? (() => undefined);
  },
};
```

The `?.xxx() ?? Promise.resolve(...)` pattern keeps the Promise contract identical for Electron and browser builds.

## Unit-test mock pattern

```ts
import { vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal(
    'window',
    Object.assign(globalThis, {
      apolloMapStudioLicense: {
        getState: vi.fn().mockResolvedValue({/* mock state */}),
        getMachineCode: vi.fn().mockResolvedValue('TEST-MACHINE'),
        activate: vi.fn().mockResolvedValue({
          ok: true,
          state: {/* ... */},
        }),
        deactivate: vi.fn().mockResolvedValue({/* ... */}),
        onChange: vi.fn().mockReturnValue(() => undefined),
      },
    }),
  );
});
```

Vitest's `vi.stubGlobal` + jsdom is enough to exercise `licenseStore.hydrate()` / `setState` / etc.

## Electron vs. fallback semantics

| Operation        | Electron                      | Browser fallback                      |
| ---------------- | ----------------------------- | ------------------------------------- |
| `getState`       | ~5 ms IPC round-trip          | Immediate `Promise.resolve`           |
| `getMachineCode` | Cached main-process value     | `'WEB-NO-LICENSE'`                    |
| `activate`       | parseToken + verify + storage | `{ ok: false, errorCode: 'unknown' }` |
| `deactivate`     | Removes three files           | Immediate Promise resolve             |
| `onChange`       | Registers IPC listener        | Returns no-op unsubscribe             |

`activate` is the only fallback that **does not silently succeed** — product decision: browser users must be told "activation is desktop-only" rather than fed a fake success.

## See also

- [`licenseStore`](../store/license-store.md) — React-state mirror
- [`editable-guard`](./editable-guard.md) — store-mutator guard
- [`preload.cts`](../electron/preload.md) — exposes `apolloMapStudioLicense`
- [`license-manager`](../electron/license-manager.md) — main-process state machine
- `src/components/license/*` — UI consumers
