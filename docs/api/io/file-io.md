# File IO

> Source: `src/io/fileIO.ts`

## Overview

`fileIO.ts` is a tiny, framework-free toolbox of browser DOM helpers for
file input and output. It is the lowest layer of the Apollo IO stack —
no React, no Zustand, no protobufjs. The module exists for two reasons:

1. **Decouple `mapIO` from the DOM.** `mapIO.pickAndImportApollo` and
   the export flows orchestrate the worker bridge; they should not have
   to inline `<input type="file">` shims and `URL.createObjectURL`
   plumbing.
2. **Make IO unit-testable.** Every function takes only standard
   parameters (a MIME accept string, a `Blob`, a `Uint8Array`); tests
   can mock `document.createElement` without touching React.

The Electron preload bridge intentionally does **not** intercept these
helpers. Electron uses the native browser file picker exposed inside
the BrowserWindow; binary read uses the standard `Blob.arrayBuffer()`.
Where Electron-specific paths exist (license activation, app updates),
those go through `window.apolloMapStudioLicense` (see
`src/lib/license-bridge.ts`), not `fileIO`.

## Exports

| Symbol            | Signature                                   | Purpose                                                                 |
| ----------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `pickFile`        | `(accept: string) => Promise<File \| null>` | Open a hidden `<input type="file">` and resolve with the selected file. |
| `readFileAsBytes` | `(file: Blob) => Promise<Uint8Array>`       | Read the blob as raw bytes (no encoding).                               |
| `readFileAsText`  | `(file: Blob) => Promise<string>`           | Read the blob as UTF-8 text.                                            |
| `downloadBlob`    | `(blob: Blob, filename: string) => void`    | Trigger a browser download via a synthetic `<a download>` click.        |

## Behavior

### `pickFile(accept)`

```ts
const file = await pickFile('.bin,.txt,.pb.txt,application/octet-stream,text/plain');
```

- Creates a hidden `<input type="file">`, attaches it to `document.body`,
  and synthetically clicks it.
- Resolves with the selected `File` on `change`.
- Resolves with `null` on the native `cancel` event.
- Idempotent settle: a `settled` flag prevents double-resolution if
  both events fire.
- Removes the input element from the DOM after settling.

::: warning macOS focus race
The implementation deliberately does **not** infer cancellation from
`window.focus`. On macOS the window can regain focus before the
selected file is committed to the input; relying on focus would race
the later `change` event and surface real selections as cancellations.
The native `cancel` event is the only signal honoured.
:::

### `readFileAsBytes(file)`

Wraps `Blob.arrayBuffer()` and constructs a `Uint8Array` view:

```ts
const buf = await file.arrayBuffer();
return new Uint8Array(buf);
```

The bytes returned are owned by the caller. `apolloIOBridge` transfers
the underlying `ArrayBuffer` to the worker, so callers should not reuse
the array after handing it off.

### `readFileAsText(file)`

Thin pass-through to `Blob.text()`. Useful for proto-text files small
enough not to warrant the worker round-trip (e.g. fixture loading in
unit tests).

### `downloadBlob(blob, filename)`

- Creates an object URL via `URL.createObjectURL(blob)`.
- Constructs a hidden anchor with `href` = the URL and `download` =
  the filename, appends it, and clicks it.
- Defers `revokeObjectURL` and `a.remove()` by 1 s so the browser has
  time to start the download before the URL is invalidated.

The 1-second deferral is empirically sufficient on Chrome/Firefox/Safari
for files up to several hundred MB. If a future host browser behaves
differently, the constant lives at the bottom of the function and can
be tuned.

## Examples

### Round-trip through a worker import

```ts
import { pickFile, readFileAsBytes } from '@/io/fileIO';
import { apolloIOBridge } from '@/io/apolloIOBridge';

const file = await pickFile('.bin,.txt,.pb.txt');
if (!file) return;

const bytes = await readFileAsBytes(file);
const result = await apolloIOBridge.importBin(file.name, bytes);
```

### Browser download after worker export

```ts
import { downloadBlob } from '@/io/fileIO';

const bytes = await apolloIOBridge.exportBin(entities, projString);
const copy = new Uint8Array(bytes.byteLength);
copy.set(bytes);
const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
downloadBlob(blob, 'base_map-20260502.bin');
```

The defensive `Uint8Array.set` copy is needed because the worker may
have transferred ownership of the buffer; constructing a `Blob` from a
detached buffer raises an error.

### Reading a fixture in tests

```ts
import { readFileAsText } from '@/io/fileIO';

const fixture = await fetch('/fixtures/sunnyvale_loop.pb.txt');
const text = await readFileAsText(await fixture.blob());
```

## Related

- [Apollo IO Bridge](./apollo-io-bridge.md) — primary consumer of
  `pickFile` / `readFileAsBytes`.
- [Map IO](./map-io.md) — orchestrates `pickFile` + `apolloIOBridge` +
  `downloadBlob` end-to-end.
- `src/lib/license-bridge.ts` — Electron-specific
  IPC bridge; intentionally separate from `fileIO`.
