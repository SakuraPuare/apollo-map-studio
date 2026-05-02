---
title: taskProgressStore — long-running-task progress
description: Single-slot active-task store with visibleAfterMs flicker suppression; the only source of truth for the status bar progress widget.
---

# `taskProgressStore` — long-running-task progress

> Source: `src/store/taskProgressStore.ts` · 66 lines · not undoable · single slot

## Purpose

`taskProgressStore` is a tiny "currently active task" Zustand store, fed by the import / export / reindex paths and consumed by the status bar progress widget. It exists to:

1. **Suppress flicker** — `visibleAfterMs` (default 1 s) keeps the spinner off-screen for tiny operations that finish before the eye notices.
2. **Centralise display** — only one global active task at any time; no stacking spinners.
3. **Normalise progress** — `progress` is always `null` (indeterminate) or in `[0, 1]`; UI never has to clamp.

Trade-off: **no queue**. The product invariant is that long tasks chain serially (import → reindex → render) so a fresh `beginTask` simply overwrites the slot. A late `endTask(oldId)` is silently ignored thanks to id-guarding.

## Public API

| Symbol                  | Kind      | Signature                                                | Summary                       |
| ----------------------- | --------- | -------------------------------------------------------- | ----------------------------- |
| `useTaskProgressStore`  | hook      | `() => TaskProgressState & TaskProgressActions`          | Zustand store                 |
| `TaskProgress`          | interface | see below                                                | All fields of one active task |
| `beginTask(task)`       | action    | `({id,label,detail?,progress?,visibleAfterMs?}) => void` | Start a new task (overwrites) |
| `updateTask(id, patch)` | action    | `(id, patch) => void`                                    | Patch fields, id-guarded      |
| `endTask(id)`           | action    | `(id) => void`                                           | Clear, id-guarded             |

## Detailed entries

### `interface TaskProgress`

```ts
export interface TaskProgress {
  id: string; // globally unique key (suggest 'import:'+filename)
  label: string; // headline ('Importing base_map.bin')
  detail?: string; // sub-line ('Decoding lanes 234/812')
  progress: number | null; // [0,1] or null (indeterminate → spinner)
  startedAt: number; // Date.now() at beginTask
  visibleAfterMs: number; // UI delays render by this much — suppresses 50 ms flickers
}
```

Source: `taskProgressStore.ts:3-10`.

### `beginTask({id, label, detail?, progress?, visibleAfterMs?})`

**Overwrites** the active task wholesale. `progress` defaults to `null` (indeterminate / spinner).

```ts
useTaskProgressStore.getState().beginTask({
  id: 'export:routing_map.txt',
  label: 'Exporting routing map',
  visibleAfterMs: 500,
});
```

Source: `taskProgressStore.ts:31-42`.

### `updateTask(id, patch)`

**Id-guarded** — if the active task's id does not match, the patch is silently dropped. This prevents a late Promise from a stale task from rewinding the bar after a newer task has begun.

`patch` may include only `label` / `detail` / `progress`; `startedAt` / `visibleAfterMs` are immutable post-creation. `progress` is normalised by `clampProgress` to `[0,1]` or `null`.

```ts
useTaskProgressStore.getState().updateTask('import:base.bin', {
  detail: 'Building cold layer (lane 312/812)',
  progress: 312 / 812,
});
```

Source: `taskProgressStore.ts:44-54`.

### `endTask(id)`

Clears `activeTask` only when ids match. Safe to call from a finally-block even if the task was already overwritten.

Source: `taskProgressStore.ts:56-59`.

### `clampProgress(value)` — internal

```ts
function clampProgress(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}
```

`NaN` / `Infinity` collapse to `null` (spinner) so the UI never renders a negative or overflowing bar.

## Internal state

```ts
interface TaskProgressState {
  activeTask: TaskProgress | null;
}
```

Single field. `null` means no work in progress.

## Usage pattern

```ts
const id = 'export:base';
useTaskProgressStore.getState().beginTask({ id, label: 'Exporting base map' });
try {
  await exportBaseMap(map, (p) => useTaskProgressStore.getState().updateTask(id, { progress: p }));
} finally {
  useTaskProgressStore.getState().endTask(id);
}
```

## Side effects

- No IPC, no localStorage, no timers.
- `Date.now()` is sampled inside `beginTask`.
- The decision "should I render?" lives in the consumer (`StatusBar`); the store does not paint anything.

## Test coverage

No dedicated test file; covered indirectly by IO end-to-end tests that assert active task is cleared on import error.

## Consumers

- `src/io/mapIO.ts` — import / export progress callbacks
- `src/components/layout/StatusBar.tsx` — renders the progress chip
- `src/hooks/useColdLayer.ts` — large rebuilds briefly occupy the slot

## Source map

| Lines | Content               |
| ----- | --------------------- |
| 3–10  | `TaskProgress`        |
| 12–14 | `TaskProgressState`   |
| 16–26 | `TaskProgressActions` |
| 28–60 | Store factory         |
| 62–65 | `clampProgress`       |

## Cooperation with StatusBar

```tsx
// simplified StatusBar
function TaskBadge() {
  const task = useTaskProgressStore((s) => s.activeTask);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!task) {
      setVisible(false);
      return;
    }
    const ms = task.visibleAfterMs - (Date.now() - task.startedAt);
    if (ms <= 0) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), ms);
    return () => clearTimeout(t);
  }, [task?.id]);
  if (!task || !visible) return null;
  return (
    <div>
      {task.label}
      {task.detail ? ` — ${task.detail}` : ''}
      {task.progress !== null ? <ProgressBar value={task.progress} /> : <Spinner />}
    </div>
  );
}
```

`visible` is gated by `setTimeout`. If the task finishes before `visibleAfterMs`, `activeTask` flips to `null` and the badge never paints.

## Design trade-off: why no queue

A queue would let "I have five parallel tasks" be expressible, but:

- The status bar can only display one at a time → you still need priority.
- Parallel display overwhelms the UX.
- Apollo Map Studio's real workflow is serial (import → reindex → render); parallel long tasks are rare.

A single slot with overwrite-on-`beginTask` matches the product better.

## Promise integration

Standard IO template:

```ts
async function exportBaseMap(/* ... */) {
  const id = `export:${Date.now()}`;
  const store = useTaskProgressStore.getState();
  store.beginTask({ id, label: 'Exporting base map', visibleAfterMs: 500 });
  try {
    await /* actual export */;
  } finally {
    store.endTask(id);
  }
}
```

`finally` is essential — even on throw the active task is cleared, otherwise the status bar would freeze forever on "Exporting…".

## Test hook

```ts
// inside vitest
import { useTaskProgressStore } from '@/store/taskProgressStore';
useTaskProgressStore.getState().beginTask({ id: 'test', label: 'X' });
expect(useTaskProgressStore.getState().activeTask?.id).toBe('test');
useTaskProgressStore.getState().endTask('test');
expect(useTaskProgressStore.getState().activeTask).toBeNull();
```

Manually `endTask` between tests — Zustand singletons leak across vitest runs in the same file.

## See also

- [`apolloMapStore`](./apollo-map-store.md) — `info.counts` is the post-import summary
- `StatusBar.tsx` — only renderer
- `src/io/mapIO.ts` — primary begin/update/end caller
- `src/hooks/useColdLayer.ts` — uses the slot during heavy rebuilds
