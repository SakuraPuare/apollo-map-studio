# Store / taskProgressStore

Source: `src/store/taskProgressStore.ts`.

`taskProgressStore` exposes one active long-running task for import,
export, overlap recompute, and large render syncs. Only one task can
be active at a time — newer tasks replace older ones — so the store
is a single `activeTask: TaskProgress | null` slot.

## State Shape

```ts
interface TaskProgress {
  id: string;
  label: string;
  detail?: string;
  progress: number | null; // [0,1] or null for indeterminate
  startedAt: number; // ms epoch
  visibleAfterMs: number; // delay before mounting the UI
}

interface TaskProgressState {
  activeTask: TaskProgress | null;
}
```

`progress` is clamped to `[0, 1]`; `null` signals indeterminate
(spinner without a percentage).

`visibleAfterMs` is a UX detail: the StatusBar / progress overlay
only mounts itself if the task has been active for longer than this
threshold. Tasks faster than the threshold never flash a spinner.

## Actions

```ts
interface TaskProgressActions {
  beginTask(task: {
    id: string;
    label: string;
    detail?: string;
    progress?: number | null;
    visibleAfterMs?: number; // default 1000
  }): void;
  updateTask(id: string, patch: Partial<Pick<TaskProgress, 'label' | 'detail' | 'progress'>>): void;
  endTask(id: string): void;
}
```

### `beginTask(task)`

Sets `activeTask` to a new record with `startedAt = Date.now()`. The
previous task (if any) is replaced silently.

### `updateTask(id, patch)`

Merges the patch into `activeTask` only if `id` matches. **Updates
are ignored if `id` does not match the active task.** This prevents a
late progress event from clearing or corrupting a newer task — for
example, an import that finished after the user already started an
export.

### `endTask(id)`

Sets `activeTask = null` only if `id` matches. Same guard against
stale events.

## Reserved IDs

| ID              | Producer                                     |
| --------------- | -------------------------------------------- |
| `apollo-import` | `mapIO.pickAndImportApollo`                  |
| `apollo-export` | `mapIO.exportApolloBin` / `exportApolloText` |

Future task IDs should follow the same kebab-case convention.

## Examples

```ts
// Begin
useTaskProgressStore.getState().beginTask({
  id: 'apollo-import',
  label: 'Importing Apollo map',
  detail: 'base_map.bin',
  progress: null,
  visibleAfterMs: 1000,
});

// Update
useTaskProgressStore.getState().updateTask('apollo-import', {
  detail: 'Decoding lanes',
  progress: 0.4,
});

// End
useTaskProgressStore.getState().endTask('apollo-import');

// Subscribe in a component
const task = useTaskProgressStore((s) => s.activeTask);
if (task && Date.now() - task.startedAt > task.visibleAfterMs) {
  return <ProgressOverlay task={task} />;
}
```

## Related

- [/api/io/apollo-io-bridge](/api/io/apollo-io-bridge) — emits progress
  events via the `onProgress` callback that `mapIO` forwards here.
- [/api/io/map-io](/api/io/map-io) — primary `beginTask` / `endTask`
  caller.
- [/api/components/status-bar](/api/components/status-bar) — primary
  subscriber.
