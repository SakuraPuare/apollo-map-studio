# Store / licenseStore

Source: `src/store/licenseStore.ts`.

`licenseStore` mirrors the Electron license state in the renderer. It
hydrates from `licenseBridge.getState()`, subscribes to main-process
pushes, and exposes `promptActivation` so edit guards can open the
activation dialog.

See [License System](/architecture/license-system) and
[/api/lib/license-bridge](/api/lib/license-bridge).

## State Shape

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

`LicenseState` (re-exported from `@/lib/license-bridge`) includes:

```ts
interface LicenseState {
  status: LicenseStatus; // 'trial' | 'activated' | 'expired_trial' | ...
  canEdit: boolean; // editable-guard reads this
  machineCode: string;
  trialStart: number; // ms epoch
  trialEnd: number;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  license: { id; name; issued; expires } | null;
  checkedAt: number;
  reason: string;
}
```

## Initial State

```ts
{ status: 'trial', canEdit: true, daysRemaining: 7, /* ... */ }
```

The initial state is permissive (`canEdit: true`) so the renderer is
usable while `hydrate()` runs.

## Actions

### `hydrate()`

Calls `licenseBridge.getState()` and writes the result with
`initialized: true`. Called once at app boot before any UI renders.

### `setState(s)`

Sets a new state from a main-process push. The hook into
`licenseBridge.onChange` lives in the activation dialog component
(or wherever the renderer subscribes during mount) and calls this
setter.

### `promptActivation()` / `registerPromptActivation(fn)`

A late-bound callback hook:

- The activation dialog component calls `registerPromptActivation(open)`
  when it mounts.
- `editable-guard.assertEditable` calls `state.promptActivation()`
  when a mutation is blocked.
- The default is a no-op so `assertEditable` doesn't crash before the
  dialog mounts.

## Selectors

```ts
selectCanEdit(s); // s.state.canEdit
selectStatus(s); // s.state.status
```

Pure functions; safe to use with `useLicenseStore(selectCanEdit)`.

## Examples

```ts
// Boot
await useLicenseStore.getState().hydrate();

// Subscribe to main-process push (in a top-level component)
useEffect(() => {
  return licenseBridge.onChange((s) => useLicenseStore.getState().setState(s));
}, []);

// Wire up the dialog's open callback
useLicenseStore.getState().registerPromptActivation(() => setOpen(true));

// Reactive read
const canEdit = useLicenseStore(selectCanEdit);
```

## Related

- [/api/lib/license-bridge](/api/lib/license-bridge) — the IPC bridge
  this store wraps.
- [/api/lib/editable-guard](/api/lib/editable-guard) — reads
  `state.canEdit` and calls `promptActivation`.
- [/architecture/license-system](/architecture/license-system) — full
  license lifecycle.
