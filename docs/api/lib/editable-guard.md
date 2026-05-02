# Editable Guard

> Source: `src/lib/editable-guard.ts`

## Overview

`editable-guard.ts` is the cross-cutting "is this app currently
editable?" check used by every store mutator and the action
dispatcher. It short-circuits any state change attempted while the
license is in a read-only state — expired trial, expired license,
tampered data, machine mismatch, or "not started yet" (clock skew).

The guard uses Zustand's `getState()` rather than a hook, so the same
code path works inside event handlers, store action methods, and
Electron IPC callbacks where React hooks are not available.

::: tip Two entry points, one source of truth

- `assertEditable(action)` — for **mutators**: returns `true` if
  editing is allowed; warns + opens activation otherwise. Throttled.
- `isEditable()` — for **render paths**: pure read, no side effects.

Both read from `useLicenseStore.getState().state.canEdit` so the
license-store is the single source of truth.
:::

## Exports

| Symbol           | Signature                      | Purpose                                                            |
| ---------------- | ------------------------------ | ------------------------------------------------------------------ |
| `assertEditable` | `(action?: string) => boolean` | Mutator-side gate. Returns `true` to proceed, `false` to bail out. |
| `isEditable`     | `() => boolean`                | Pure-read selector for render paths (button-disabled state).       |

## Behavior

### `assertEditable(action)`

```ts
const { state, promptActivation } = useLicenseStore.getState();
if (state.canEdit) return true;

const now = Date.now();
if (now - lastWarn > WARN_INTERVAL) {
  lastWarn = now;
  console.warn(`[license] Blocked ${action}: status=${state.status}. ${state.reason}`);
  try {
    promptActivation();
  } catch {
    // promptActivation may not be wired before the dialog mounts.
  }
}
return false;
```

Three responsibilities:

1. **Decide.** Reads `state.canEdit` directly — no fallback, no
   inference. The license bridge is the source of truth.
2. **Warn the user.** When blocked, throttled at one warning per 5 s
   (`WARN_INTERVAL`) so a click-spamming user gets one toast, not
   fifty.
3. **Side-effect: open activation.** Calls
   `useLicenseStore.getState().promptActivation()`, which is wired to
   open the activation dialog when the dialog component mounts. The
   `try`/`catch` defends against early calls (e.g. during initial
   hydration) when the dialog hasn't registered its prompt callback
   yet.

The `action` parameter is purely diagnostic — it appears in the warn
log and in any future telemetry. Callers conventionally pass
`'addEntity'`, `'removeEntity'`, `'reparentEntity'`, etc.

### `isEditable()`

```ts
return useLicenseStore.getState().state.canEdit;
```

Pure synchronous read with no side effects. Used in render paths to
disable buttons / inputs without triggering activation prompts on
every re-render.

### Throttle implementation

```ts
let lastWarn = 0;
const WARN_INTERVAL = 5 * 1000;
```

A module-scoped `lastWarn` timestamp gates the console.warn + activation
prompt to one fire per 5 s. The throttle is a single global — even if
twenty different mutators fire `assertEditable` in the same tick, only
the first surfaces a prompt.

## Examples

### Wrapping a store mutator

```ts
// src/store/mapStore.ts
addEntity(entity) {
  if (!assertEditable('addEntity')) return;
  set((state) => { state.entities.set(entity.id, entity); /* ... */ });
},
```

Every mutator on `useMapStore` follows this pattern: guard first, mutate
second. Mutators that fail the guard return silently — no exception, no
state change, no history entry.

### Disabling a button in a component

```tsx
import { isEditable } from '@/lib/editable-guard';

function DeleteButton({ id }: { id: string }) {
  const editable = isEditable();
  return (
    <Button disabled={!editable} onClick={() => removeEntity(id)}>
      Delete
    </Button>
  );
}
```

For reactive UI, prefer subscribing through `useLicenseStore` directly
(`useLicenseStore((s) => s.state.canEdit)`) so the component re-renders
when the license state flips. `isEditable()` is fine for one-shot reads
inside callbacks.

### Used by `useActionDispatcher`

```ts
// src/hooks/useActionDispatcher.ts (excerpt)
function dispatch(actionId: string) {
  if (action.requiresEdit && !assertEditable(actionId)) return;
  // ... run action ...
}
```

Every action declared with `requiresEdit: true` in the action registry
flows through the same gate before its `run()` is invoked. Read-only
actions (zoom, fit-bounds, toggle layer, undo/redo of _no-ops_) bypass.

## Related

- [License Bridge](./license-bridge.md) — Electron-side IPC that
  populates `useLicenseStore.state`.
- [License Store](../store/license-store.md) — store this guard reads.
- [Map Store](../store/map-store.md) — primary consumer, every mutator
  starts with `assertEditable(...)`.
- [/api/core/actions/registry](/api/core/actions/registry) —
  action-level `requiresEdit` flag wired into the dispatcher.
- [/api/hooks/use-action-dispatcher](/api/hooks/use-action-dispatcher) —
  centralised action runner that calls `assertEditable`.
