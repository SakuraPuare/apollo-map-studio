# Store / apolloMapStore

Source: `src/store/apolloMapStore.ts`.

`apolloMapStore` holds Apollo import / export context that is **not**
part of the editable entity graph. It exists separately from
`mapStore` so the round-trip path stays lossless: `mapStore` carries
edited entities, `apolloMapStore` carries everything else (the source
filename, the projection string, header metadata, bounds for viewport
fit, error surface for the UI).

## State Shape

```ts
interface ApolloMapState {
  rawMap: Record<string, unknown> | null; // legacy in-process callers/tests
  header: ApolloMapHeader | null; // lightweight clone of Map.header
  bounds: ApolloMapBounds | null; // [[minLng, minLat], [maxLng, maxLat]]
  info: ApolloMapImportInfo | null; // filename, counts, projString, importedAt
  lastError: string | null; // import/export error surface
}

interface ApolloMapImportInfo {
  filename: string;
  counts: Record<string, number>;
  projString: string;
  importedAt: number;
}

type ApolloMapBounds = [[number, number], [number, number]];
type ApolloMapHeader = Record<string, unknown>;
```

`rawMap` is intentionally optional: browser imports keep the full
proto tree inside the IO worker so React state does not clone or
rescan 50–200 MB maps on the main thread. Only legacy in-process
tests populate `rawMap` directly.

## Actions

```ts
interface ApolloMapActions {
  setMap(rawMap: Record<string, unknown> | null, info: ApolloMapImportInfo): void;
  setImported(
    info: ApolloMapImportInfo,
    bounds: ApolloMapBounds | null,
    header?: ApolloMapHeader | null,
  ): void;
  clear(): void;
  setError(message: string | null): void;
}
```

### `setMap(rawMap, info)`

Legacy in-process setter. Extracts `header` from the rawMap (when it
is an object) and clears `bounds` and `lastError`.

### `setImported(info, bounds, header?)`

Worker-import path. Stores `info`, `bounds`, and `header` and clears
`rawMap` and `lastError`. The bridge sends `header` and `bounds` as
part of the `IMPORT_RESULT` message; this setter is the sink.

### `clear()`

Wipes every field — used on "New Map" / "Close map".

### `setError(message)`

Stores import / export error text. `mapIO`'s `try/catch/finally` calls
this on failure so the UI surfaces the error in a banner.

## Role In Export

`mapIO.currentExportContext()` requires `info` to exist:

```ts
const { info } = useApolloMapStore.getState();
if (!info) {
  setError('Nothing to export - import a map first.');
  return null;
}
```

`info.projString` is passed back to the Apollo IO worker for export
so the round-trip reuses the same CRS as import.

## Examples

```ts
// Read import metadata for a status bar
const counts = useApolloMapStore((s) => s.info?.counts ?? {});

// Surface an error
useApolloMapStore.getState().setError('Import failed: invalid header.');
```

## Related

- [/api/io/map-io](/api/io/map-io) — primary writer.
- [/api/io/apollo-io-bridge](/api/io/apollo-io-bridge) — produces the
  `IMPORT_RESULT` payload this store sinks.
- [/api/io/proto-projection](/api/io/proto-projection) — `projString`
  format.
- [/api/store/map-store](/api/store/map-store) — sister store for
  edited entities.
