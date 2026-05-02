---
title: io / file-io
description: src/io/fileIO.ts — browser file picker and download primitives
---

# io / file-io

`src/io/fileIO.ts` is a pure-DOM toolkit for browser-side file IO.
No React, no store — easy to mock in unit tests via
`document.createElement` stubs.

## Exported symbols

```ts
export function pickFile(accept: string): Promise<File | null>;
export function readFileAsBytes(file: Blob): Promise<Uint8Array>;
export function readFileAsText(file: Blob): Promise<string>;
export function downloadBlob(blob: Blob, filename: string): void;
```

> Source: `src/io/fileIO.ts:1-66`.

## `pickFile(accept)`

Open a hidden `<input type="file">` and resolve to the selected
`File` or `null` (cancellation). `accept` is a comma-separated list
of extensions and MIME types, e.g.
`'.bin,.txt,application/octet-stream'`.

Notes:

- Reads `input.files[0]` from the `'change'` event.
- Uses the native `'cancel'` event for cancellation. We deliberately
  avoid focus-based heuristics; on macOS the window can re-focus
  before the file is committed, racing with `'change'` and producing
  false cancellations.
- Removes the hidden input from the DOM after settling.
- A `settled` flag prevents late `cancel` from overriding a real
  `change`.

```ts
const file = await pickFile('.bin,.txt,.pb.txt');
if (file) {
  const bytes = await readFileAsBytes(file);
}
```

## `readFileAsBytes(file)`

```ts
const buf = await file.arrayBuffer();
return new Uint8Array(buf);
```

## `readFileAsText(file)`

```ts
return file.text(); // UTF-8 decode
```

## `downloadBlob(blob, filename)`

Synthesise an `<a href="${objectURL}" download="${filename}">` and
click it. The object URL is revoked after a 1 s timeout so the
download has time to start:

```ts
const blob = new Blob([bytes.buffer], { type: 'application/octet-stream' });
downloadBlob(blob, 'apollo-base-map.bin');
```

## Constraints

- Browser-only (including Tauri webview). Electron main-process
  dialogs come from `electron/preload`.
- Single-file selection only. The current Apollo import path expects
  one file, so `input.multiple = false`.
- `pickFile` never rejects; cancellation falls through to `null`.

## See also

- [io/map-io](/en/api/io/map-io) — primary consumer.
- [Import / Parse Base Map](/en/api/import-parse-base-map)
- [Export / Base Map](/en/api/export-base-map)
