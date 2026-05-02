---
title: TaskProgressOverlay
description: Full-screen modal progress bar — drives long-running tasks (import/export, spatial worker rebuilds); honors `visibleAfterMs` to avoid flashing for quick jobs.
---

# TaskProgressOverlay

> Source: `src/components/layout/TaskProgressOverlay.tsx`

## Purpose & UX role

`TaskProgressOverlay` is the **singleton** full-screen mask used for visualizing heavy operations:

- Apollo `.bin/.txt` import (parse + entityOps translation)
- Apollo `.bin/.txt` export
- Large spatial worker SYNC passes (first load with 1e4+ entities)
- Future: bulk replace, bulk region-overlap recompute

It consumes `useTaskProgressStore.activeTask` — any caller invoking `taskProgressStore.start({ ... })` triggers this overlay; calling `finish()` closes it.

UX guarantees:

- **`visibleAfterMs` delay**: tasks finishing inside 500ms never flash, eliminating visual noise.
- **No close button**: long tasks intentionally block the user — otherwise they would double-trigger import/export.
- **Two progress modes**: `progress: number` → percentage + width animation; `progress: null` → indeterminate cyan stripe loop.

## Component API

```ts
export function TaskProgressOverlay(): JSX.Element | null;
```

No props. Everything comes from `useTaskProgressStore`:

```ts
interface ActiveTask {
  label: string;
  detail?: string;
  startedAt: number;
  visibleAfterMs: number;
  progress: number | null; // 0..1 or null for indeterminate
}
```

## Internal state

| Hook                                 | Purpose                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| `useTaskProgressStore(s.activeTask)` | Subscribes to the current task (null when idle)                       |
| `useState<number>(Date.now())` `now` | Updated every 100ms via `setInterval(setNow, 100)` — drives the delay |

## Side effects

```ts
useEffect(() => {
  if (!activeTask) return;
  setNow(Date.now());
  const timer = window.setInterval(() => setNow(Date.now()), 100);
  return () => window.clearInterval(timer);
}, [activeTask]);
```

While a task is active, ticks at 100ms — only used to evaluate the `elapsedMs >= visibleAfterMs` gate. Cleanup stops the timer the moment the task ends.

## Render anatomy

```jsx
if (!activeTask) return null;
const elapsedMs = now - activeTask.startedAt;
if (elapsedMs < activeTask.visibleAfterMs) return null;

const pct =
  activeTask.progress === null ? null : Math.round(Math.min(1, activeTask.progress) * 100);

return (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45">
    <div className="w-[min(420px,calc(100vw-32px))] rounded-md border border-white/10 bg-zinc-950/95 p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="truncate text-sm font-medium text-zinc-100">{activeTask.label}</div>
          {activeTask.detail && (
            <div className="mt-1 truncate text-xs text-zinc-500">{activeTask.detail}</div>
          )}
        </div>
        {pct !== null && <div className="font-mono text-xs text-cyan-300">{pct}%</div>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded bg-zinc-800">
        {pct === null ? (
          <div className="h-full w-1/3 animate-[ams-indeterminate_1.1s_ease-in-out_infinite] rounded bg-cyan-400" />
        ) : (
          <div
            className="h-full rounded bg-cyan-400 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  </div>
);
```

The `ams-indeterminate` keyframes live in `src/index.css`.

## Performance notes

- **100ms tick**: smooth enough for percentage display, frugal on CPU.
- **z-[100]**: above CommandPalette / SettingsPanel (z-50) — long tasks must not be obscured.
- **`bg-black/45` vs CommandPalette `bg-black/60`**: deliberately lighter to read as "blocking task" rather than "modal dialog".

## Known gaps

- **No cancel button**: tasks cannot be aborted yet; cancellation would need worker protocol support.
- **Progress granularity is caller-provided**: today the worker SYNC task jumps 0% → 100% with no intermediate updates.
- Only **one** task can be visible at a time; concurrent tasks would need queueing (`taskProgressStore` already has stack semantics for `start/finish`, but the overlay only reads `activeTask`).

## Source map

| Concern              | File location                    |
| -------------------- | -------------------------------- |
| Component body       | `TaskProgressOverlay.tsx:4-49`   |
| 100ms tick effect    | `TaskProgressOverlay.tsx:8-13`   |
| Progress bar styling | `TaskProgressOverlay.tsx:36-44`  |
| Keyframe definition  | `src/index.css`                  |
| Store                | `src/store/taskProgressStore.ts` |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — always mounted at the root
- [`taskProgressStore`](/en/api/store) — start/finish API
- Callers: `src/io/mapIO.ts` / `src/io/apolloIOBridge.ts` / `src/io/apolloIO.worker.ts` / `src/core/workers/spatialBridge.ts`

## Collaboration with other components

| Component                                                                     | Collaboration                                                                                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [WorkspaceLayout](./workspace-layout.md)                                      | Always mounted at the root (`WorkspaceLayout.tsx:177`)                                                                                          |
| `taskProgressStore` callers                                                   | `src/io/mapIO.ts` / `src/io/apolloIOBridge.ts` / `src/io/apolloIO.worker.ts` / `src/core/workers/spatialBridge.ts` and other long-task starters |
| [CommandPalette](./command-palette.md) / [SettingsPanel](./settings-panel.md) | z-index does not collide (Overlay z=100 > modal z=50)                                                                                           |

## Troubleshooting

| Symptom                            | Likely cause                                                     | Fix                                            |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Progress flashes for short tasks   | `visibleAfterMs` is too low                                      | Restore the 500ms default                      |
| Never shows                        | Caller didn't `start({ ... })` or fired `finish()` synchronously | Audit the task call stack                      |
| Stuck at 100% forever              | `finish()` not called in the catch path                          | Wrap with `try/finally` and always `finish()`  |
| z-index dominated by another modal | Third-party lib uses a higher z                                  | Lower the third party below 100 / use a portal |

## Design decisions

**Why is `visibleAfterMs` 500ms by default?**
Sub-500ms tasks are below the perception threshold; flashing a spinner becomes noise instead of feedback. 500ms aligns with the NN/g "user starts to feel anxious" threshold.

**Why does the indeterminate animation cycle at 1.1s?**
Empirical: a touch slower than 1s prevents visual sync with the 60Hz refresh rate (which causes a "jumpy" feel), while staying faster than 1.5s to avoid feeling sluggish.

**Why a singleton instead of a queue?**
Long tasks are user-initiated (import/export); concurrent long tasks already produce a confusing UX. If concurrency is ever needed, switch the store to a stack and have the overlay show the newest task with the older ones layered behind.
