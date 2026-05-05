---
title: Export Apollo Maps (Overview)
description: Entry points, base_map / sim_map / routing_map outputs, binary vs text protobuf, filename conventions, command palette + shortcuts, and common export failures.
---

# Export Apollo Maps

> Export serializes the in-memory `mapStore.entities` into a `base_map.bin` or `base_map.txt` file that is bit-compatible with the Apollo HD-map proto (`modules/map/proto/map.proto`) and consumable by Apollo 9.0 / Lumina downstream.

This is the **entry-level overview**: UI, output semantics, naming, and first-line troubleshooting. For the pipeline (reprojection, overlap reconcile, header preservation, etc.) read [Exporting (deep dive)](./exporting.md).

## Overview

| Aspect          | Behavior                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| Entry           | `File → Export Apollo Map (.bin / .txt)`, command palette, `⌘S` / `⇧⌘S`              |
| Function        | `exportApolloBin` / `exportApolloText` (`src/io/mapIO.ts:95-141`)                    |
| Off-main-thread | `apolloIOBridge` posts the job to `apolloIO.worker.ts`; main thread stays responsive |
| Progress        | `TaskProgressOverlay` (only surfaces after 1s)                                       |
| File write      | `downloadBlob()` in `src/io/fileIO.ts` triggers a browser download                   |
| Filename        | `<original stem>-<UTC YYYYMMDDHHMMSS>.<ext>`                                         |
| Precondition    | Exportable Apollo entities exist; new maps prompt for a projection first             |

::: tip Why projection is required
Export needs the Apollo `Header.projection.proj` (a PROJ.4 string) to reproject WGS84 lng/lat back to UTM meters. If the current map came from Import, AMS reuses `apolloMapStore.info.projString`; if it is a new map, AMS opens the projection picker before continuing.
:::

::: warning Export behavior
For imported maps, export still depends on the raw Apollo map cached during import: `cachedRawLonLatMap` in `apolloIO.worker.ts`. The worker merges edited entities back into that raw map before encoding, preserving fields that are not bridged into `MapEntity`. For a new map, the worker uses a projection-only blank base_map as the merge target, so drawn Apollo elements can be exported directly.
:::

## Three Apollo map variants

Apollo's runtime consumes three map files:

| Output                  | Meaning                                                          | AMS produces?                                                             |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `base_map.bin` / `.txt` | Full HD map (lane / road / junction / signal / …)                | ✅ direct                                                                 |
| `sim_map.bin`           | Simulation-display-only simplification (polygons + a few fields) | ⚠️ generated offline by Apollo `sim_map_generator`; not produced here     |
| `routing_map.bin`       | Topology graph for planning (lane connections only)              | ⚠️ generated offline by Apollo `routing_map_generator`; not produced here |

::: warning base_map only
The current AMS version only produces `base_map`. `sim_map` and `routing_map` still come from `bazel run //modules/map/tools:sim_map_generator -- --map_dir=...` in the Apollo toolchain. AMS already exposes hooks for the other two formats (`format` union in `apolloIOProtocol.ts`), but the worker path is not wired yet.
:::

## Binary vs Text

| Aspect     | `.bin` (binary protobuf)       | `.txt` (text protobuf)                   |
| ---------- | ------------------------------ | ---------------------------------------- |
| Codec      | `protobufjs` via `binCodec.ts` | hand-rolled ASCII codec `textCodec.ts`   |
| Size       | Compact, ~1 MB                 | ~5–10× `.bin`                            |
| Readable   | No                             | Yes — human-readable, diff/grep friendly |
| Load speed | Fast                           | Slower (parsing)                         |
| Use case   | Deployment, vehicle runtime    | Code review, regression fixtures         |
| Shortcut   | `⌘S` / `Ctrl+S`                | `⇧⌘S` / `Ctrl+Shift+S`                   |

::: tip protobuf textproto != JSON
`.txt` is protobuf textproto: `field_name: value`, nested messages in braces. Same `map.proto`, different serialization.
:::

## Entry points

```
                  ┌─────────────────────────────────┐
                  │           MenuBar               │
                  │  File → Export Apollo Map (.bin)│  ← Cmd/Ctrl+S
                  │       → Export Apollo Map (.txt)│  ← Cmd/Ctrl+Shift+S
                  └────────┬────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │     Command Palette     │  ← Cmd/Ctrl+K then "export"
              │  Export Apollo Map (.bin)│
              │  Export Apollo Map (.txt)│
              └────────────┬────────────┘
                           │
                           ▼
                exportApolloBin / exportApolloText
                  (src/io/mapIO.ts:95-141)
```

Source: `src/core/actions/registry/definitions.ts:33-53`

```ts
{ id: 'exportApolloBin',  shortcut: '⌘S',  keybinding: { key: 's', ctrl: true } },
{ id: 'exportApolloText', shortcut: '⇧⌘S', keybinding: { key: 's', ctrl: true, shift: true } },
```

## Filename rule

`suggestedFilename` (`mapIO.ts:75-79`) computes:

```
<base>-<YYYYMMDDHHMMSS>.<ext>
  where base = info.filename minus .bin/.txt/.pb.txt
```

Example: imported `sunnyvale_with_two_offices.bin`, exported as `.bin` at 14:23:05 UTC →

```
sunnyvale_with_two_offices-20260502142305.bin
```

::: tip Timestamp is UTC
To avoid timezone confusion the timestamp is UTC: `new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)`.
:::

## Steps

1. **Import** an Apollo map (if you haven't). See [Import](./import.md).
2. **Edit / add** entities.
3. **Trigger export**:
   - Menu: `File → Export Apollo Map (.bin)`, **or**
   - `⌘S` / `Ctrl+S`, **or**
   - Command palette → search `export`.
4. The browser starts a download via `<a download>` and a Blob URL. Electron currently uses the same browser download path; there is no native save dialog in this code path.
5. Allow a few seconds (30–60s for large maps).
6. Watch the `TaskProgressOverlay` near the bottom — only visible if the run exceeds 1s.

## Progress visualization

Progress messages are pushed by `apolloIO.worker.ts` via `PROGRESS`, captured into `taskProgressStore`, and rendered by `TaskProgressOverlay.tsx`. Five visible bands:

| Phase                         | Range     | Example label                          |
| ----------------------------- | --------- | -------------------------------------- |
| Pre-serialize                 | 0.00–0.02 | "Preparing export"                     |
| Entity chunks                 | 0.02–0.10 | "Sending entities 12,000 / 18,250"     |
| Reproject + overlap reconcile | 0.10–0.60 | "Reprojecting + reconciling overlaps"  |
| protobuf encode               | 0.60–0.95 | "Encoding map_lane / map_junction / …" |
| Write                         | 0.95–1.00 | "Writing file"                         |

## Troubleshooting

| Symptom                                                               | Cause                                                            | Fix                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Error "Nothing to export - draw or import Apollo map elements first." | No exportable Apollo entities are present                        | Draw Apollo elements, or import a map first                                           |
| Error "Export failed: …"                                              | Worker threw; caught at `mapIO.ts:108-111`                       | Open DevTools console for stack — most often an invalid PROJ string                   |
| `.bin` downloads but Apollo refuses to load                           | Field-type mismatch, often a new entity field missing from proto | Re-export `.txt` and diff to find the offending entity                                |
| `.txt` lane lacks `successor_id` / `predecessor_id`                   | Topology not reconciled                                          | Verify [Topology](./topology.md) before export                                        |
| Overlap throws "Region polygon empty"                                 | All lane corridors collapse during reconcile                     | `_userOverrides` may have pinned `regionOverlaps` for an entity that no longer exists |
| Big map (>50k entities) export times out                              | Default 10-min timeout still not enough                          | Bump `DEFAULT_TIMEOUT_MS` in `apolloIOBridge.ts:14`, or split the map                 |
| Error "No imported Apollo map is cached in the IO worker."            | Worker lost its import-time `cachedRawLonLatMap`                 | Re-import the source base_map, then export again                                      |

## Persistence

Export itself **does not write `localStorage`**. It only **reads** `apolloMapStore.info.projString` (set on the most recent Import). To force a different PROJ, use `ProjPickerDialog` — see [Importing](./importing.md#projection-picker).

## Source

- `src/io/mapIO.ts:75-141` — filename + main flow
- `src/io/fileIO.ts:53-67` — browser download helper
- `src/io/apolloIOBridge.ts:88-178` — main-thread ↔ worker bridge
- `src/io/apolloIO.worker.ts` — actual reconcile + encode
- `src/io/proto/binCodec.ts:17-23` — `.bin` encode
- `src/io/proto/textCodec.ts:13-16` — `.txt` encode
- `src/core/actions/registry/definitions.ts:33-53` — `exportApolloBin` / `exportApolloText` registrations

## Advanced use cases

### 1. Batch export

AMS exports one map per run (paired with one import). To batch, drive headless Playwright:

```bash
pnpm exec playwright test e2e/export-batch.spec.ts \
  --grep "batch export" \
  -- --maps=foo.bin,bar.bin,baz.bin
```

Or use Apollo's CLI `bazel run //modules/map/tools:map_diff`. AMS does not duplicate existing Apollo command-line tools.

### 2. Incremental export of edited entities only

::: warning Not supported
Current export is **full**: it serializes every entity in `mapStore.entities.values()`. The current release does not produce a patch containing only edited entities; compare full `base_map` outputs with an external diff tool when needed.
:::

### 3. Force-ignore `_userOverrides`

For a "fully auto-derived" clean export (reset all manual pins), temporarily clear `_userOverrides`:

```js
// DevTools console
useMapStore.getState().entities.forEach((e, id) => {
  if (e._userOverrides) {
    useMapStore.getState().updateEntity(id, { ...e, _userOverrides: undefined });
  }
});
// Then ⌘S to export.
```

::: danger Irreversible
After clearing, manual values will be overwritten by derive. Back up first by exporting a `.bin` copy.
:::

### 4. Round-trip verification

```bash
# 1. import foo.bin → export foo-A.bin
# 2. import foo-A.bin → export foo-B.bin
# 3. diff
diff <(protoc --decode_raw < foo-A.bin) <(protoc --decode_raw < foo-B.bin)
# Output should be empty (modulo timestamps / derived fields).
```

## Known limitations

| Item            | Constraint                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| Size            | Files > 200 MB risk OOM in browser Blob URLs; use desktop or split              |
| Concurrency     | Only one import / export at a time; `taskProgressStore` rejects concurrent jobs |
| sim_map         | Not produced directly                                                           |
| routing_map     | Not produced directly                                                           |
| Web filename    | Some browsers mangle extensions (Safari appends `.txt` for binaries)            |
| Sub-1s progress | Progress bar suppressed below 1s — appears as a sudden file dialog              |

## Filename suffix strategy

`mapIO.ts:75-79`:

| Input filename                 | .bin output                      | .txt output    |
| ------------------------------ | -------------------------------- | -------------- |
| `foo.bin`                      | `foo-<ts>.bin`                   | `foo-<ts>.txt` |
| `foo.txt`                      | `foo-<ts>.bin`                   | `foo-<ts>.txt` |
| `foo.pb.txt`                   | `foo-<ts>.bin`                   | `foo-<ts>.txt` |
| `something_with_no_ext`        | `something_with_no_ext-<ts>.bin` | `…-<ts>.txt`   |
| empty (`info.filename === ''`) | `apollo-map-<ts>.bin`            | same           |

## Web vs Desktop download

| Behavior              | Browser                                                       | Electron                        |
| --------------------- | ------------------------------------------------------------- | ------------------------------- |
| Trigger               | `<a href={blobUrl} download={name}>`                          | same (Electron native download) |
| Save-dialog popup     | Default to `~/Downloads` (unless Chrome's "Always ask" is on) | Native dialog                   |
| Size limit            | Blob URL ~ 2 GB (GPU-dependent)                               | No limit (file system)          |
| Filename sanitisation | Browser strips `/`                                            | Same                            |

## See also

- [Exporting (deep dive)](./exporting.md) — full pipeline, reconcile, overlap, header preservation
- [Import](./import.md) — import flow (precondition)
- [Coordinate System](./coordinate-system.md) — PROJ.4 / UTM explained
- [Troubleshooting](./troubleshooting.md) — general debugging

## CLI alternatives

The repo ships headless helpers if you don't want the UI:

```bash
# Convert base_map.bin to .txt (direct codec)
node scripts/bin-to-text.mjs --in foo.bin --out foo.txt

# Schema-validate a .bin
node scripts/verify-map.mjs --in foo.bin
```

::: warning Not a main-path replacement
These scripts are for CI and tooling. The main path is the GUI `⌘S`. The scripts skip derive / overlap reconcile.
:::

## Interop with Apollo CLI

```bash
# 1. Export from AMS
# 2. Generate sim_map / routing_map with Apollo's toolchain
bazel run //modules/map/tools:sim_map_generator -- \
  --map_dir=/path/to/exported/dir \
  --output_dir=/path/to/exported/dir
bazel run //modules/map/tools:routing_map_generator -- \
  --map_dir=/path/to/exported/dir
```

Final directory layout (what Apollo runtime expects):

```
/path/to/map/
├── base_map.bin        ← AMS output
├── base_map.txt        ← AMS output (optional)
├── sim_map.bin         ← Apollo sim_map_generator
├── routing_map.bin     ← Apollo routing_map_generator
└── routing_map.txt     ← same
```

## Pre-release checklist

| ✓   | Item                                                                               |
| --- | ---------------------------------------------------------------------------------- |
| ☐   | `⌘S` produces a sensibly-sized `.bin` (KB to MB)                                   |
| ☐   | `⇧⌘S` produces `.txt` parseable by `protoc`                                        |
| ☐   | Round-trip validation (`importBin → exportBin → importBin`) preserves entity count |
| ☐   | Overlap count stable (no growth, no loss)                                          |
| ☐   | `_userOverrides` survive round-trip                                                |
| ☐   | `header.projection / vendor / district` unchanged                                  |
| ☐   | Big map (>10k entities) finishes in < 5 s                                          |
| ☐   | Progress bar monotonic                                                             |
| ☐   | Memory released after export (DevTools profile)                                    |
