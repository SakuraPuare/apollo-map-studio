---
title: apolloMapStore — Apollo import metadata cache
description: Holds import metadata, a header copy, and bounds so the UI and round-trip export reuse the same context.
---

# `apolloMapStore` — Apollo import metadata cache

> Source: `src/store/apolloMapStore.ts` · not undoable

## Purpose

`apolloMapStore` is a small Zustand singleton (no zundo middleware) that owns two responsibilities:

1. The most recent import's metadata — `filename`, `projString`, per-entity counts — surfaced to the status bar, toasts, and the re-export name suggestion.
2. The WGS84 bounds and a shallow copy of `Map.header` so `WorkspaceLayout` can call `map.fitBounds` on first paint after a load.

It deliberately does **not** store editor `entities` or the raw proto tree. Entities live in `mapStore` and are tracked by zundo with a `partialize: { entities }` selector; the full proto tree stays inside the IO worker so React state never structurally clones a 50–200 MB object.

## Public API

| Symbol                | Kind      | Signature                                 | Summary                                           |
| --------------------- | --------- | ----------------------------------------- | ------------------------------------------------- |
| `useApolloMapStore`   | hook      | `() => ApolloMapState & ApolloMapActions` | Zustand store; component subscription entry point |
| `ApolloMapImportInfo` | interface | see below                                 | Per-import diagnostic record                      |
| `ApolloMapBounds`     | type      | `[[number, number], [number, number]]`    | WGS84 `[[minLng, minLat], [maxLng, maxLat]]`      |
| `ApolloMapHeader`     | type      | `Record<string, unknown>`                 | Shallow copy of `Map.header`                      |
| `setImported`         | action    | `(info, bounds, header?) => void`         | Writes import metadata, bounds, and a header copy |
| `clear`               | action    | `() => void`                              | Resets every field to its initial value           |
| `setError`            | action    | `(message: string \| null) => void`       | Surfaces last IO failure to the status bar        |

## Detailed entries

### `interface ApolloMapImportInfo`

```ts
export interface ApolloMapImportInfo {
  /** Source filename, used as the suggested name for re-export. */
  filename: string;
  /** Per-entity counts surfaced for the status bar / toast. */
  counts: Record<string, number>;
  /** PROJ.4 string actually used to project ENU → lon/lat. */
  projString: string;
  /** Imported-at timestamp (ms epoch). */
  importedAt: number;
}
```

Built by `mapIO.importBaseMap` once decoding is complete. The same `projString` is fed back into `mapIO.exportBaseMap` on a round-trip so coordinates land back at their original UTM values.

Source: `apolloMapStore.ts:14`.

### `type ApolloMapBounds`

```ts
export type ApolloMapBounds = [[number, number], [number, number]];
```

Layout: `[[minLng, minLat], [maxLng, maxLat]]`. Directly compatible with maplibre-gl's `LngLatBoundsLike`.

### `type ApolloMapHeader`

```ts
export type ApolloMapHeader = Record<string, unknown>;
```

Intentionally open-typed — proto schema growth must not force store changes; the Header panel narrows fields with a zod schema at render time.

### `interface ApolloMapState`

| Field       | Type                          | Purpose                                           |
| ----------- | ----------------------------- | ------------------------------------------------- |
| `header`    | `ApolloMapHeader \| null`     | Shallow copy of `Map.header` for the Header panel |
| `bounds`    | `ApolloMapBounds \| null`     | Pre-computed WGS84 bounding box                   |
| `info`      | `ApolloMapImportInfo \| null` | Last-import metadata                              |
| `lastError` | `string \| null`              | Human-readable last IO failure                    |

Source: `apolloMapStore.ts`.

### `setImported(info, bounds, header?)`

Import path entry. The proto tree stays inside the IO worker; only metadata, bounds, and a header copy round-trip the `postMessage` boundary, so the main thread never structurally clones the megabyte tree.

Signature: `(info: ApolloMapImportInfo, bounds: ApolloMapBounds | null, header?: ApolloMapHeader | null) => void`

Side effects: clears `lastError`.

```ts
useApolloMapStore.getState().setImported(
  { filename, counts, projString, importedAt: Date.now() },
  [
    [bbox.minLng, bbox.minLat],
    [bbox.maxLng, bbox.maxLat],
  ],
  header,
);
```

Source: `apolloMapStore.ts:74-76`.

### `clear()`

Wipes every field. Called on `File → New Map` / file switching. Does **not** clear `mapStore` — the caller orchestrates that.

Source: `apolloMapStore.ts:78-80`.

### `setError(message)`

Sets `lastError` for status-bar display. The string sticks until the next import or a `clear()` call.

```ts
useApolloMapStore.getState().setError('Failed to decode header: invalid varint at offset 17');
```

Source: `apolloMapStore.ts:82-84`.

## Internal state

- No `subscribe` / `selector` optimisation — write rate is low (only at import/export boundaries), so `useShallow` is unnecessary.
- Because the store sits outside zundo, import context does not enter undo history; the full proto tree stays in the worker.
- Defensive `header && typeof header === 'object'` narrow protects against malformed proto decode results.

## Side effects

- No IPC, no localStorage, no timers — pure in-memory.
- No `console.*` writes; failures surface only through `setError`.
- Wiped on app restart; the product decision is "import state is not persisted".

## Test coverage

No dedicated test file. The contract is exercised end-to-end by `src/io/__tests__/mapIO.test.ts`, which asserts `info.counts` and `bounds` after a round-trip.

## Consumers

- `src/io/mapIO.ts` — sole writer (`setImported` / `setError`)
- `src/components/layout/StatusBar.tsx` — reads `info.filename`, `lastError`, `info.counts`
- `src/components/layout/WorkspaceLayout.tsx` — reads `bounds` to trigger `map.fitBounds`
- `src/components/menu/FileMenu.tsx` — reuses `info.filename` / `projString` as defaults for export

## Source map

| Lines | Content                                            |
| ----- | -------------------------------------------------- |
| 13–23 | `ApolloMapImportInfo` interface                    |
| 25–26 | `ApolloMapBounds` / `ApolloMapHeader` type aliases |
| 28–43 | Internal `ApolloMapState`                          |
| 45–54 | Internal `ApolloMapActions`                        |
| 56–85 | `useApolloMapStore` factory                        |

## Coordination with `mapStore`

End-to-end import flow:

```ts
// mapIO.ts (sketch)
async function importBaseMap(file: File) {
  const apolloStore = useApolloMapStore.getState();
  const mapStore = useMapStore.getState();
  const taskStore = useTaskProgressStore.getState();

  const id = `import:${file.name}`;
  taskStore.beginTask({ id, label: `Importing ${file.name}` });
  try {
    const result = await runImportWorker(file, projString);
    mapStore.replaceAll(result.entities);
    apolloStore.setImported(
      { filename: file.name, counts: result.counts, projString, importedAt: Date.now() },
      result.bounds,
      result.header,
    );
  } catch (e) {
    apolloStore.setError(String(e));
    throw e;
  } finally {
    taskStore.endTask(id);
  }
}
```

Notes:

- `mapStore` and `apolloMapStore` are two separate stores — the caller orchestrates.
- `mapStore` is zundo-tracked, so `replaceAll` enters the undo stack; `apolloMapStore` does not.
- Failure paths still call `endTask` (use `finally`).

## Camera-fit strategy

Once `bounds` is written, `WorkspaceLayout` triggers `map.fitBounds`:

```tsx
useEffect(() => {
  const bounds = useApolloMapStore.getState().bounds;
  if (bounds && map) {
    map.fitBounds(bounds, { padding: 60, duration: 800 });
  }
}, [bounds]);
```

After the camera animates, `bounds` does not need to be cleared — the next import overwrites it via `setImported`. Subsequent zoom / pan goes through `settingsStore.setMapCenter`, unrelated to this store.

## Error display model

`lastError` is "sticky until next import" — the status bar reads:

```tsx
function StatusBarError() {
  const err = useApolloMapStore((s) => s.lastError);
  if (!err) return null;
  return <span className="text-destructive">{err}</span>;
}
```

`setError(null)` may be called explicitly to clear (rarely used).

## See also

- `mapStore` — the entity-level zundo store
- [`projDialogStore`](./proj-dialog-store.md) — modal that resolves missing PROJ strings
- [`taskProgressStore`](./task-progress-store.md) — long-import progress
- `mapIO` (`src/io/mapIO.ts`) — actual writer
- `ARCHITECTURE.md` — global cold/hot layer + worker boundary diagram
