---
title: io / map-io
description: src/io/mapIO.ts — file-path glue for Apollo HD-map import/export
---

# io / map-io

`src/io/mapIO.ts` glues the browser file picker / download, the
`taskProgressStore` progress UI, the `apolloIOBridge` worker calls,
and the `mapStore` / `apolloMapStore` state into three high-level
helpers:

```ts
export function pickAndImportApollo(): Promise<ApolloMapImportInfo | null>;
export function exportApolloBin(): Promise<void>;
export function exportApolloText(): Promise<void>;
```

> Source: `src/io/mapIO.ts:1-141`.

## Internal helpers (not exported)

```ts
function reportProgress(taskId: string, progress: ApolloIOProgress): void;
function beginTask(id: string, label: string, detail?: string): void;
function endTask(id: string): void;
function importApolloBinFile(file: File): Promise<ApolloImportWorkerResult>;
function importApolloTextFile(file: File): Promise<ApolloImportWorkerResult>;
function suggestedFilename(originalName: string, ext: 'bin' | 'txt'): string;
function currentExportContext(): { info: ApolloMapImportInfo; entities: MapEntity[] } | null;
```

Task constants: `TASK_IMPORT = 'apollo-import'`,
`TASK_EXPORT = 'apollo-export'`.

## `pickAndImportApollo()`

```ts
export async function pickAndImportApollo(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.bin,.txt,.pb.txt,application/octet-stream,text/plain');
  if (!file) return null;

  beginTask(TASK_IMPORT, 'Importing Apollo map', file.name);
  try {
    const isText = /\.(pb\.txt|txt)$/i.test(file.name);
    const result = isText ? await importApolloTextFile(file) : await importApolloBinFile(file);
    useApolloMapStore.getState().setImported(result.info, result.bounds, result.header);
    useMapStore.getState().replaceImportedEntities(result.entities);
    return result.info;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useApolloMapStore.getState().setError(`Import failed: ${msg}`);
    console.error('[mapIO] import failed', error);
    return null;
  } finally {
    endTask(TASK_IMPORT);
  }
}
```

Notes:

- The `accept` string covers `.bin`, `.txt`, `.pb.txt`, plus
  `application/octet-stream` / `text/plain` MIME fallbacks.
- File-name pattern routes to text or binary decoding.
- On success, write `apolloMapStore.setImported` (non-undoable
  context) **before** `useMapStore.replaceImportedEntities` (clears
  zundo history). The order matters because the latter forces a
  spatial-index reset; reads in between would observe partially-
  initialised state.

## `exportApolloBin / exportApolloText`

Both share `currentExportContext()` and the same task plumbing. The
full pipeline is documented in
[Export / Base Map](/en/api/export-base-map). Invariants particular
to this layer:

- The `Uint8Array` returned by the bridge is **copied** into a fresh
  buffer before being wrapped in a `Blob`, so the transferable
  buffer that came back from the worker stays valid.
- `downloadBlob` uses a synthetic `<a>` click; the object URL is
  revoked one second later via `setTimeout`.

## Filename convention

`suggestedFilename` keeps the original base name minus the `.bin /
.txt / .pb.txt` extension, appends `-YYYYMMDDHHmmss`, then re-adds
the extension:

```
input  : Sunnyvale-base-map.bin
output : Sunnyvale-base-map-20260502143015.bin
```

The timestamp is `new Date().toISOString().replace(/[-:T]/g,
'').slice(0, 14)`.

## See also

- [Export / Base Map](/en/api/export-base-map)
- [Import / Parse Base Map](/en/api/import-parse-base-map)
- [io/file-io](/en/api/io/file-io)
- [io/apollo-io-bridge](/en/api/io/apollo-io-bridge)
