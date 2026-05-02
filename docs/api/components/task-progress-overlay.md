# TaskProgressOverlay

> Source: `src/components/layout/TaskProgressOverlay.tsx`

## Overview

`TaskProgressOverlay` is the global "long-running task" UI. It binds
to `taskProgressStore.activeTask` and shows a centered scrim with a
progress bar — but **only after** the task has been running for
`visibleAfterMs` milliseconds. Short tasks (e.g. a tiny cold-layer
sync) never paint, avoiding flash.

It supports both determinate progress (numeric `progress`) and
indeterminate (a self-animating bar).

## Component props

```ts
export function TaskProgressOverlay(): JSX.Element | null;
```

No props. The component is mounted once at the workspace root and
self-subscribes to `useTaskProgressStore`.

## Behavior

### Active task contract

```ts
interface TaskProgress {
  id: string;
  label: string; // e.g. "Rendering map layers"
  detail?: string; // e.g. "12,438 entities"
  progress: number | null; // 0..1, or null for indeterminate
  visibleAfterMs: number; // grace period before showing
  startedAt: number; // set by beginTask
}
```

`useTaskProgressStore.beginTask(...)` sets `activeTask` and stamps
`startedAt`. `endTask(id)` clears it if the id matches (so an
out-of-order completion doesn't kill an unrelated task).

### Visibility gate

```ts
useEffect(() => {
  if (!activeTask) return;
  setNow(Date.now());
  const timer = window.setInterval(() => setNow(Date.now()), 100);
  return () => window.clearInterval(timer);
}, [activeTask]);

if (!activeTask) return null;
const elapsedMs = now - activeTask.startedAt;
if (elapsedMs < activeTask.visibleAfterMs) return null;
```

The 100ms interval is intentionally coarse — the bar doesn't need
60fps tick precision, and a long interval means the test runs `Date.now`
checks rarely.

### Determinate vs. indeterminate

```tsx
const pct =
  activeTask.progress === null ? null : Math.round(Math.min(1, activeTask.progress) * 100);

{
  pct === null ? (
    <div className="h-full w-1/3 animate-[ams-indeterminate_1.1s_ease-in-out_infinite] rounded bg-cyan-400" />
  ) : (
    <div
      className="h-full rounded bg-cyan-400 transition-[width] duration-200"
      style={{ width: `${pct}%` }}
    />
  );
}
```

The `ams-indeterminate` keyframes are defined in `index.css` — a
smooth left-to-right loop with rounded edges.

### Layering

The overlay sits at `z-[100]` with a 45% black scrim. Other modals
(SettingsPanel, ProjPickerDialog, ActivationDialog) use `z-50` or
`z-[100]` — the overlay is intentionally on top because it represents
"the app is busy, don't touch anything".

## Producing a task

```ts
import { useTaskProgressStore } from '@/store/taskProgressStore';

const store = useTaskProgressStore.getState();

store.beginTask({
  id: 'cold-layer-sync',
  label: 'Rendering map layers',
  detail: `${entities.size.toLocaleString()} entities`,
  progress: null, // indeterminate
  visibleAfterMs: 1000, // hide for the first second
});

try {
  await heavyWork();
} finally {
  store.endTask('cold-layer-sync');
}
```

`useColdLayer` produces this exact task during full SYNC operations.

### Determinate example

```ts
store.beginTask({
  id: 'export-bin',
  label: 'Exporting Apollo .bin',
  detail: 'building proto',
  progress: 0,
  visibleAfterMs: 200,
});
for (let i = 0; i < total; i++) {
  // ...
  if (i % 1000 === 0) store.beginTask({ ...current, progress: i / total });
}
store.endTask('export-bin');
```

The store's `beginTask` overwrites the active task by id — repeatedly
calling it with updated `progress` is the supported way to update
determinate progress.

## Examples

### Mounting

```tsx
<TaskProgressOverlay />
```

Place it at the same level as Dockview / modals in `WorkspaceLayout`.

### Hiding the overlay during tests

```ts
useTaskProgressStore.getState().endTask(currentId);
```

## Related

- [taskProgressStore](/api/store/task-progress-store)
- [useColdLayer](/api/hooks/use-cold-layer) — primary producer
- [Workspace layout](/api/components/workspace-layout)
