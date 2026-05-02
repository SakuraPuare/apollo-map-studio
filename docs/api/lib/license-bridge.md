# License Bridge

> Source: `src/lib/license-bridge.ts`

## Overview

`license-bridge.ts` is the renderer-side wrapper around
`window.apolloMapStudioLicense` — the contextBridge API that
`electron/preload.cts` exposes to the renderer process. The wrapper:

1. **Hides the global**. Renderer code never reaches into `window`
   directly; it imports `licenseBridge` and gets a typed object.
2. **Provides a fallback** for pure web builds (no Electron). All
   methods resolve to a perpetual "trial" `LicenseState` with
   `canEdit = true` so dev / Storybook / browser preview builds keep
   working.
3. **Carries the wire types** (`LicenseStatus`, `LicenseState`,
   `ActivationResult`) that flow between the main process license
   manager and the renderer license store.

The bridge does NOT keep state. State lives in `useLicenseStore`,
which subscribes via `licenseBridge.onChange(...)` and re-renders the
banner / activation dialog / read-only enforcement when the main
process pushes an update.

## Exports

| Symbol             | Purpose                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `LicenseStatus`    | Union of every license status the main process can report.                              |
| `LicenseState`     | Full state shape (status, canEdit, machine code, trial dates, license payload, etc.).   |
| `ActivationResult` | `{ ok, state, errorCode?, errorMessage? }` returned by `activate(code)`.                |
| `licenseBridge`    | The wrapper object: `getState`, `getMachineCode`, `activate`, `deactivate`, `onChange`. |
| `isDesktopBuild`   | `() => boolean` — true iff `window.apolloMapStudioLicense` is present.                  |

### `LicenseStatus`

```ts
export type LicenseStatus =
  | 'trial' // active trial period
  | 'activated' // valid offline license bound to this machine
  | 'expired_trial' // trial period ended, no license
  | 'expired_license' // license payload past `expires`
  | 'tampered' // signature check failed
  | 'machine_mismatch' // license bound to a different machine code
  | 'invalid' // malformed or unparsable
  | 'not_started'; // license starts in the future (clock skew)
```

### `LicenseState`

```ts
export interface LicenseState {
  status: LicenseStatus;
  canEdit: boolean; // editable-guard reads this
  machineCode: string; // local machine fingerprint (16-char hex)
  trialStart: number; // ms epoch
  trialEnd: number; // ms epoch
  daysRemaining: number | null; // null when not applicable
  hoursRemaining: number | null;
  license: { id; name; issued; expires } | null;
  checkedAt: number; // ms epoch — last verification
  reason: string; // human-readable diagnostic
}
```

### `ActivationResult`

```ts
export interface ActivationResult {
  ok: boolean;
  state: LicenseState;
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

### `licenseBridge` shape

```ts
interface LicenseApi {
  getState(): Promise<LicenseState>;
  getMachineCode(): Promise<string>;
  activate(code: string): Promise<ActivationResult>;
  deactivate(): Promise<LicenseState>;
  onChange(handler: (s: LicenseState) => void): () => void;
}
```

`onChange` returns an unsubscribe function. The license store hooks
into this on first hydrate so subsequent main-process pushes update
the renderer state without polling.

## Behavior

### Global declaration

```ts
declare global {
  interface Window {
    apolloMapStudioLicense?: LicenseApi;
  }
}
```

The `?` is essential: in pure web builds the global is undefined and
`isDesktopBuild()` returns `false`.

### Fallback state

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

Every fallback method returns this object (or a copy of it) so the
renderer never needs `if (isDesktopBuild)` branches in normal flow.
The 7-day trial window is cosmetic — `canEdit: true` is what actually
unlocks the editor.

### Method dispatch

Each method nullish-coalesces to the fallback:

```ts
async getState() {
  return window.apolloMapStudioLicense?.getState() ?? Promise.resolve(fallbackState());
}
```

Two cases yield the fallback:

1. The global is undefined (pure web).
2. The global exists but the method is undefined (unreachable in
   practice; defensive).

### Activation in web mode

```ts
async activate(code) {
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

The web fallback for `activate` is intentionally a failure response —
the user should know that pasting a license code in the browser preview
isn't honoured. The dialog can render the `errorMessage` directly.

### `onChange` no-op fallback

```ts
onChange(handler) {
  return window.apolloMapStudioLicense?.onChange(handler) ?? (() => undefined);
}
```

Returns an inert unsubscribe. The license store calls it on cleanup
without checking the build type.

### `isDesktopBuild`

```ts
export function isDesktopBuild(): boolean {
  return typeof window !== 'undefined' && Boolean(window.apolloMapStudioLicense);
}
```

The `typeof window !== 'undefined'` guard supports SSR / Node environments
(Vitest, type-check builds). The function is safe to call from anywhere.

## Examples

### Hydrate the license store on app boot

```ts
// src/main.tsx (sketch)
import { useLicenseStore } from '@/store/licenseStore';

await useLicenseStore.getState().hydrate();
```

`hydrate` calls `licenseBridge.getState()` and writes the result.

### Subscribe to main-process pushes

```ts
import { licenseBridge } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';

useEffect(() => {
  return licenseBridge.onChange((state) => {
    useLicenseStore.getState().setState(state);
  });
}, []);
```

### Activate from the dialog

```tsx
import { licenseBridge } from '@/lib/license-bridge';

const result = await licenseBridge.activate(code);
if (result.ok) toast.success('License activated.');
else toast.error(result.errorMessage ?? 'Activation failed.');
```

### Show the machine code in the activation dialog

```ts
const machineCode = await licenseBridge.getMachineCode();
// "WEB-NO-LICENSE" in browser, 16-char hex on desktop
```

### Branch on desktop vs web

```ts
import { isDesktopBuild } from '@/lib/license-bridge';

if (isDesktopBuild()) showActivationDialog();
else showWebPreviewBanner();
```

## Related

- [License Store](../store/license-store.md) — Zustand store that
  wraps this bridge.
- [Editable Guard](./editable-guard.md) — reads `state.canEdit` from
  the store this bridge populates.
- [/api/electron](/api/electron) — main-process license manager that
  produces `LicenseState`.
