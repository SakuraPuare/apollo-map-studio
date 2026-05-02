---
title: editable-guard — write-permission gate
description: Cross-cutting "is this app currently editable?" guard. Every store mutator and action dispatcher short-circuits through it.
---

# `editable-guard` — write-permission gate

> Source: `src/lib/editable-guard.ts` · 45 lines · no side effects beyond console + dialog prompt

## Purpose

`editable-guard` is the cross-cutting "may I write?" check. Every entry point that could mutate `mapStore` (store mutators, action dispatcher, IPC callbacks) calls `assertEditable()` first:

- `state.canEdit === true` → returns `true`; the caller proceeds.
- `state.canEdit === false` (expired trial / expired licence / tampered / machine mismatch / …) → returns `false`, logs a throttled (5 s) warn, attempts to open the activation dialog.

It uses zustand's `getState()` (not the hook) so the same code path works inside event handlers, store actions, and IPC callbacks.

## Public API

| Symbol           | Kind | Signature                      | Summary                                      |
| ---------------- | ---- | ------------------------------ | -------------------------------------------- |
| `assertEditable` | fn   | `(action?: string) => boolean` | Sync check with side effects (warn / prompt) |
| `isEditable`     | fn   | `() => boolean`                | Pure read — no prompt                        |

## Detailed entries

### `assertEditable(action = 'edit'): boolean`

```ts
export function assertEditable(action = 'edit'): boolean {
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
}
```

- `action`: caller-provided label for the warn line (`'addEntity'`, `'undo'`, …). Defaults to `'edit'`.
- Behaviour:
  1. Read `useLicenseStore.getState()` synchronously.
  2. If `canEdit`, return immediately.
  3. Otherwise, every 5 s, log one warn and attempt to open the activation dialog (try/catch protects against the prompt being unwired during very-early app startup).
  4. Return `false`; the caller should bail out.

Source: `editable-guard.ts:21-36`.

### `isEditable(): boolean`

```ts
export function isEditable(): boolean {
  return useLicenseStore.getState().state.canEdit;
}
```

Pure read — never warns, never prompts. Use from React render paths to disable buttons:

```tsx
<Button disabled={!isEditable()}>Add Lane</Button>
```

This is a snapshot — components do not re-render when `canEdit` flips. If you need reactivity, subscribe to the store:

```tsx
const canEdit = useLicenseStore(selectCanEdit);
```

## Internal state

```ts
let lastWarn = 0;
const WARN_INTERVAL = 5 * 1000;
```

Module-level throttle timestamp. **Shared across the process** — every caller observes one clock, so the console is not flooded.

## Side effects

- Reads `useLicenseStore`.
- Throttled `console.warn`.
- Throttled `promptActivation()` invocation (no-op until the dialog mounts and registers).

## Test coverage

No dedicated tests; covered indirectly by `mapStore.test.ts` (mocked license state must reject writes).

## Consumers

- `src/store/mapStore.ts` — `addEntity` / `updateEntity` / `removeEntity` / etc. mutators
- `src/hooks/useActionDispatcher.ts` — undo/redo entry
- `src/hooks/useDrawCommit.ts` — FSM CONFIRM
- `src/components/menu/*` — disabled state via `isEditable`

## Design notes

Why not enforce in the main-process IPC layer? Because entities live in renderer-side Zustand; the main process only broadcasts the `canEdit` flag and depends on the renderer to short-circuit before writing.

Why not in zundo middleware? Middleware cannot tell read from write and cannot drive UI side-effects (the activation prompt). Manual `assertEditable` at each mutator entry stays the cleanest seam.

Why throttle 5 s? Drag-driven writes can exceed 60 calls/s. Without throttling the console floods. 5 s balances "user notices they are locked" against log readability.

## Source map

| Lines | Content                  |
| ----- | ------------------------ |
| 11    | `import useLicenseStore` |
| 13–14 | Throttle vars            |
| 21–36 | `assertEditable`         |
| 42–44 | `isEditable`             |

## Integration pattern with mutators

A typical `mapStore` mutator looks like:

```ts
// src/store/mapStore.ts
addEntity(entity: MapEntity) {
  if (!assertEditable('addEntity')) return;
  set((s) => ({
    entities: new Map(s.entities).set(entity.id, entity),
  }));
}

updateEntity(id: string, patch: Partial<MapEntity>) {
  if (!assertEditable('updateEntity')) return;
  set((s) => {
    const e = s.entities.get(id);
    if (!e) return s;
    const next = new Map(s.entities);
    next.set(id, { ...e, ...patch } as MapEntity);
    return { entities: next };
  });
}
```

**Conventions**:

- Every write mutator's first line is `if (!assertEditable('actionName')) return;`.
- `actionName` is a verb, useful in the console (`'addEntity'` / `'undo'` / `'paste'` / `'reparent'`).
- Read mutators (`getEntity`, `select`) **must not** guard — read operations are licence-agnostic.

## Cooperation with component disabled state

For reactive UI:

```tsx
import { useLicenseStore, selectCanEdit } from '@/store/licenseStore';

function AddLaneButton() {
  const canEdit = useLicenseStore(selectCanEdit);
  return (
    <Button disabled={!canEdit} onClick={addLane}>
      Add Lane
    </Button>
  );
}
```

The selector path re-renders when `canEdit` flips — better UX than the snapshot read. The click handler still **must** call `assertEditable` — `disabled` is a UX hint, not a security boundary (a hostile user can re-enable in DevTools).

## Throttle boundary

```ts
const WARN_INTERVAL = 5 * 1000; // 5 s
```

Multiple failures in the same 5 s window log once. `Date.now()` is monotonic enough; even a clock rollback never triggers an extra warn (the throttle var only increases).

The throttle is **process-wide** — every mutator shares the same warn quota. This is a feature, not a bug, since it prevents log floods during a 60 fps drag.

## Debugging hint

If a mutator silently no-ops in tests:

1. Check `useLicenseStore.getState().state.status` — is it really `expired` / `tampered`?
2. Check the console — at least one warn within 5 s.
3. Check `useLicenseStore.getState().promptActivation` — has `ActivationDialog` mounted and registered?

## See also

- [`licenseStore`](../store/license-store.md) — state source
- [`license-bridge`](./license-bridge.md) — renderer IPC wrapper
- [`electron/license-manager`](../electron/license-manager.md) — main-process state machine
- `src/store/mapStore.ts` — real-world mutator caller
- `src/hooks/useActionDispatcher.ts` — undo/redo guard
