---
title: licenseStore — renderer-side license state
description: Mirrors the Electron main-process license state machine and is the single source of truth for the renderer banner, activation dialog, and read-only enforcement guards.
---

# `licenseStore` — renderer-side license state

> Source: `src/store/licenseStore.ts` · 65 lines · not undoable

## Purpose

`licenseStore` is a renderer-process Zustand singleton. Its job is to mirror the main-process license manager (`electron/license/manager.cts`) into React state.

Three responsibilities:

1. **State mirror.** Subscribes to `licenseBridge.onChange` (the `license:state` IPC broadcast) and pipes updates into `state`.
2. **First-paint hydrate.** Calls `licenseBridge.getState()` once on mount so the banner does not flicker.
3. **Decoupled activation prompt.** `promptActivation` is a registration slot — `ActivationDialog` mounts and replaces the no-op default via `registerPromptActivation`. Any caller (e.g. `editable-guard`) can call `useLicenseStore.getState().promptActivation()` to open the modal without importing the component.

The browser preview build (no Electron) hits the `licenseBridge` fallback that pretends a perpetual `trial` with `canEdit=true`, so `pnpm dev` works without licensing infrastructure.

## Public API

| Symbol                     | Kind     | Signature                                 | Summary                                           |
| -------------------------- | -------- | ----------------------------------------- | ------------------------------------------------- |
| `useLicenseStore`          | hook     | `() => LicenseStoreState`                 | Zustand hook                                      |
| `selectCanEdit`            | selector | `(s: LicenseStoreState) => boolean`       | Whether editing is currently allowed              |
| `selectStatus`             | selector | `(s: LicenseStoreState) => LicenseStatus` | Status string projection                          |
| `hydrate`                  | action   | `() => Promise<void>`                     | Pull latest state from main process               |
| `setState`                 | action   | `(s: LicenseState) => void`               | Push state (called by `licenseBridge.onChange`)   |
| `promptActivation`         | action   | `() => void`                              | Open activation modal (default no-op)             |
| `registerPromptActivation` | action   | `(fn: () => void) => void`                | Replaces the no-op when `ActivationDialog` mounts |

## Detailed entries

### `interface LicenseStoreState`

```ts
interface LicenseStoreState {
  state: LicenseState;
  initialized: boolean;
  hydrate(): Promise<void>;
  setState(s: LicenseState): void;
  promptActivation: () => void;
  registerPromptActivation(fn: () => void): void;
}
```

- `state` is the full `LicenseState` (see [license-bridge](../lib/license-bridge.md)).
- `initialized` flips to `true` after the first `hydrate()` or `setState`. The banner renders a skeleton while it stays `false`.
- `promptActivation` / `registerPromptActivation` form a registration slot to avoid importing dialog code from inside store mutators.

### Initial state

```ts
const initial: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};
```

`canEdit: true` is intentional — SSR / Storybook / browser preview must not block editing. The real values come from `hydrate()` once the IPC bridge is ready.

Source: `licenseStore.ts:23-34`.

### `hydrate()` — first-paint pull

```ts
async hydrate() {
  const next = await licenseBridge.getState();
  set({ state: next, initialized: true });
}
```

Call once from the topmost `useEffect` (typically in `LicenseProvider`). After that, state diffs flow in via `licenseBridge.onChange(setState)`, so this is **not** called repeatedly.

### `setState(s)` — IPC broadcast sink

Wired by `LicenseProvider`:

```ts
useEffect(() => {
  const off = licenseBridge.onChange((s) => useLicenseStore.getState().setState(s));
  return off;
}, []);
```

Always sets `initialized: true` defensively in case a broadcast lands before `hydrate()` resolves.

### `promptActivation()` — default no-op

Starts as `() => {}`. The `ActivationDialog` component runs

```ts
useEffect(() => useLicenseStore.getState().registerPromptActivation(() => setOpen(true)), []);
```

so subsequent calls open the modal. Any store mutator (e.g. `editable-guard.assertEditable`) can fire `useLicenseStore.getState().promptActivation()` without importing the dialog.

### `registerPromptActivation(fn)`

```ts
registerPromptActivation(fn) {
  set({ promptActivation: fn });
}
```

The slot is single-occupant — last writer wins. Multiple `ActivationDialog` instances (mid-route-change) follow normal `useEffect` mount/unmount ordering.

### Selectors

```ts
export function selectCanEdit(s: LicenseStoreState): boolean {
  return s.state.canEdit;
}
export function selectStatus(s: LicenseStoreState): LicenseState['status'] {
  return s.state.status;
}
```

Prefer the selector form (`useLicenseStore(selectCanEdit)`) over reading the whole state — `daysRemaining` ticks every minute and would otherwise force a render.

## Internal state

- `state` is the full main-process `LicenseState`. Renderer-side fields are advisory; an attacker who patches React state cannot bypass enforcement because the actual gate (`assertEditable` in `editable-guard.ts` and main-process activation logic) re-reads from the same source.

## Side effects

- Reaches the main process via `licenseBridge` → `window.apolloMapStudioLicense` (exposed by [preload.cts](../electron/preload.md)).
- `hydrate` is async IPC; expected < 5ms round-trip.
- Does **not** write localStorage — state lives on disk in the main process only.

## Test coverage

No dedicated unit test. The end-to-end license flow is covered in main-process tests (`electron/license/__tests__`); banner UI behavior is covered by component tests / Storybook.

## Consumers

- `src/components/license/LicenseProvider.tsx` — wires `onChange` + calls `hydrate`
- `src/components/license/LicenseBanner.tsx` — `useLicenseStore(selectStatus, ...)`
- `src/components/license/ActivationDialog.tsx` — calls `registerPromptActivation`
- `src/lib/editable-guard.ts` — `useLicenseStore.getState()` reads `canEdit`
- `src/store/mapStore.ts` — guards mutators with `if (!isEditable()) return;`

## Source map

| Lines | Content                   |
| ----- | ------------------------- |
| 13–21 | `LicenseStoreState`       |
| 23–34 | `initial` default         |
| 36–54 | `useLicenseStore` factory |
| 56–60 | `selectCanEdit`           |
| 62–64 | `selectStatus`            |

## Full LicenseProvider pattern

```tsx
// src/components/license/LicenseProvider.tsx
export function LicenseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const store = useLicenseStore.getState();
    void store.hydrate();
    const off = licenseBridge.onChange((s) => {
      useLicenseStore.getState().setState(s);
    });
    return off;
  }, []);
  return <>{children}</>;
}
```

Mount near the root of the React tree (inside `App.tsx`). `hydrate()` triggers an async IPC; `onChange` registers a listener; the `useEffect` cleanup invokes the unsubscribe.

## ActivationDialog registration pattern

```tsx
// src/components/license/ActivationDialog.tsx
export function ActivationDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    useLicenseStore.getState().registerPromptActivation(() => setOpen(true));
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* ... activation form ... */}
    </Dialog>
  );
}
```

Registers once on mount. After that, any store mutator's `editable-guard` can open this dialog.

## Banner countdown

```tsx
function Banner() {
  const status = useLicenseStore(selectStatus);
  const days = useLicenseStore((s) => s.state.daysRemaining);
  if (status === 'trial' && days !== null && days <= 3) {
    return <div>Trial ends in {days} day(s) — activate to continue editing.</div>;
  }
  if (status === 'expired_trial') {
    return (
      <div>
        Trial expired.{' '}
        <button onClick={() => useLicenseStore.getState().promptActivation()}>Activate</button>
      </div>
    );
  }
  // ...
}
```

`daysRemaining` ticks via the main-process 60 s timer; React re-renders through `setState`.

## Security notes

- **State is advisory**: an attacker patching React state via DevTools cannot bypass enforcement because mutators read `useLicenseStore.getState()` directly through `editable-guard.assertEditable()` — the same store, but consulted at the mutation site.
- **The real enforcement lives at the mutator call site**, not at the UI layer.
- **In production builds** React DevTools is disabled (unless re-enabled manually), but a local user can always patch their own renderer — accepted scope (licensing here defends against casual piracy, not against reverse engineering).

## See also

- [`license-bridge`](../lib/license-bridge.md) — renderer IPC wrapper
- [`editable-guard`](../lib/editable-guard.md) — store-mutator guard
- [`electron/license-manager`](../electron/license-manager.md) — main-process state machine
- [`preload.cts`](../electron/preload.md) — exposes `apolloMapStudioLicense`
- `src/components/license/LicenseProvider.tsx` — integration site
- `src/components/license/ActivationDialog.tsx` — modal
