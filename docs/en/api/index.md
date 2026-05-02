---
title: API Reference
description: Module-level API index for Apollo Map Studio — store, io, proto, geo and hook surface
---

# API Reference

This section is the module-level API documentation for Apollo Map
Studio. Each page covers a single source file or sub-directory, listing
every exported symbol with its full TypeScript signature, parameter
table, typical usage and error modes.

> Read together with [Architecture](/en/architecture/): the architecture
> doc covers layering and data flow, this section documents per-module
> contracts.

## Module map

```
┌─────────────────────────────────────────────────────────────┐
│ components/   ← UI: layout, panels, map (React 19)          │
├─────────────────────────────────────────────────────────────┤
│ hooks/        ← FSM glue / event routing / layer scheduling │
├─────────────────────────────────────────────────────────────┤
│ store/        ← Zustand: mapStore + uiStore + zundo undo    │
├─────────────────────────────────────────────────────────────┤
│ lib/          ← entityOps adapter, geo helpers, schemas     │
├─────────────────────────────────────────────────────────────┤
│ core/         ← FSM, geometry, workers, action registry     │
└─────────────────────────────────────────────────────────────┘
                  │
                  ↓
            io/proto/  ← Apollo HD-map codec + ENU↔WGS84 projection
            io/        ← Apollo IO worker bridge + file pickers
            proto/     ← *.proto schema sources (Vite ?raw glob)
```

Imports flow downwards only: an upper layer may import from any lower
layer, never the reverse. `types/` and `config/` are pure type/constant
modules referenceable from anywhere.

## Top-level API (must read)

| Module                                                   | Source                                          | Summary                                 |
| -------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| [Store / Map](/en/api/store-map)                         | `src/store/mapStore.ts`                         | entities Map + zundo undo + cascade     |
| [Store / UI](/en/api/store-ui)                           | `src/store/uiStore.ts`                          | grid / snap / layer / connect mode      |
| [Geo / Projection](/en/api/geo-projection)               | `src/lib/geo.ts` + `src/io/proto/projection.ts` | haversine + proj4 ENU↔WGS84             |
| [Geo / Lane Geometry](/en/api/geo-lane-geometry)         | `src/core/geometry/*`                           | interpolate / topology / junctions      |
| [Geo / Overlap Calc](/en/api/geo-overlap-calc)           | `src/core/elements/overlap/*`                   | reconcile / R-tree / pairTable          |
| [Proto / Loader](/en/api/proto-loader)                   | `src/io/proto/loader.ts`                        | `protobufjs.Root` cache + glob ?raw     |
| [Proto / Codec](/en/api/proto-codec)                     | `binCodec.ts` + `textCodec.ts`                  | unified bin / txt entry                 |
| [Proto / Schema](/en/api/proto-schema)                   | `src/proto/**/*.proto`                          | Apollo HD-map proto2 schema index       |
| [Export / Base Map](/en/api/export-base-map)             | `src/io/mapIO.ts` + worker                      | `exportApolloBin/Text` → file download  |
| [Export / Sim Map](/en/api/export-sim-map)               | (planned — not implemented)                     | sim_map derivation pipeline placeholder |
| [Export / Routing Map](/en/api/export-routing-map)       | (planned — not implemented)                     | routing_map derivation placeholder      |
| [Import / Parse Base Map](/en/api/import-parse-base-map) | `src/io/mapIO.ts` + worker                      | `pickAndImportApollo` full flow         |
| [Hooks index](/en/api/hooks)                             | `src/hooks/*`                                   | event routing / layer scheduler list    |

## IO sub-tree

| Module                                                     | Source                          | One-liner                              |
| ---------------------------------------------------------- | ------------------------------- | -------------------------------------- |
| [io/map-io](/en/api/io/map-io)                             | `src/io/mapIO.ts`               | Apollo file pipeline glue              |
| [io/apollo-io-bridge](/en/api/io/apollo-io-bridge)         | `src/io/apolloIOBridge.ts`      | main-thread → worker promise gateway   |
| [io/apollo-io-protocol](/en/api/io/apollo-io-protocol)     | `src/io/apolloIOProtocol.ts`    | worker IPC message contract            |
| [io/file-io](/en/api/io/file-io)                           | `src/io/fileIO.ts`              | `<input>` picker + Blob downloader     |
| [io/proto-loader](/en/api/io/proto-loader)                 | `src/io/proto/loader.ts`        | `protobufjs.Root` cache                |
| [io/proto-codec-bin](/en/api/io/proto-codec-bin)           | `src/io/proto/binCodec.ts`      | `decodeMapBin` / `encodeMapBin`        |
| [io/proto-codec-text](/en/api/io/proto-codec-text)         | `src/io/proto/textCodec*`       | hand-written protobuf text parser      |
| [io/proto-adapter](/en/api/io/proto-adapter)               | `src/io/proto/adapter.ts`       | ENU↔WGS84 + header / counts            |
| [io/proto-projection](/en/api/io/proto-projection)         | `src/io/proto/projection.ts`    | proj4 wrapper + UTM presets            |
| [io/proto-entity-bridge](/en/api/io/proto-entity-bridge)   | `src/io/proto/entityBridge*`    | proto ↔ MapEntity bidirectional bridge |
| [io/proto-apollo-geojson](/en/api/io/proto-apollo-geojson) | `src/io/proto/apolloGeoJson.ts` | bounds computation (import preview)    |
| [io/proto-editor-meta](/en/api/io/proto-editor-meta)       | `src/io/proto/editorMeta.ts`    | editor-only metadata pass-through      |

## Naming conventions

- Public symbols use camelCase functions / PascalCase types;
- Modules under `__tests__` or named `internal.ts` are not part of the
  API surface — patch versions may rearrange them;
- Symbols marked `@internal` are package-internal helpers, not stable
  API guarantees;
- Entity fields with a leading underscore (`_userOverrides`, `_source`)
  are "pin markers" inspected by the reconcile pipeline; UI mutation
  must respect their semantics.

## How to read

- Touching a store mutator → start with [store-map](/en/api/store-map)
  and [entityOps](/en/api/io/proto-entity-bridge);
- Adding an Apollo proto field → start with
  [proto-entity-bridge](/en/api/io/proto-entity-bridge) and
  [proto-schema](/en/api/proto-schema);
- Debugging an overlap miss → read [geo-overlap-calc](/en/api/geo-overlap-calc)
  and the `pairTable` rules;
- Adding a draw tool → read [hooks index](/en/api/hooks) and
  `core/fsm/editorMachine`.

## Symbols flagged "planned"

`export-sim-map` and `export-routing-map` describe pipelines that have
not yet been implemented in the codebase. The pages exist so the public
API surface can be ratified before sidebar shuffles. The actual export
helpers today only emit `base_map.bin` / `base_map.txt`; sim_map and
routing_map derivation runs upstream of Apollo Map Studio.

Read paired pages side-by-side; the zh and en versions describe the
same symbols at the same depth — only the register differs.

## Quick lookup table

| What you want to do                         | Start with                                                                                   | Key symbols                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Add a mutator                               | [store-map](/en/api/store-map)                                                               | `addEntity / updateEntity / removeEntity / batchImport`     |
| Add a UI preference toggle                  | [store-ui](/en/api/store-ui)                                                                 | `toggleGrid / setLayerVisible / setSnapTarget`              |
| Inspect the R-tree                          | [geo-overlap-calc](/en/api/geo-overlap-calc)                                                 | `SpatialIndex / bboxForEntity / getSharedSpatialIndex`      |
| Align two lane endpoints                    | [geo-lane-geometry](/en/api/geo-lane-geometry)                                               | `applyLaneJunctions / planConnection / applyLaneConnection` |
| Add / change an Apollo entity               | [proto-schema](/en/api/proto-schema) + [proto-entity-bridge](/en/api/io/proto-entity-bridge) | `BRIDGES / raw<Entity>ToEntity / entityToRaw<Entity>`       |
| Add a worker message                        | [io/apollo-io-protocol](/en/api/io/apollo-io-protocol)                                       | `ApolloIORequest / ApolloIOResponse`                        |
| Change the projection fallback              | [io/proto-projection](/en/api/io/proto-projection)                                           | `UTM_PRESETS / makeProjection`                              |
| Debug a wrong fitBounds                     | [io/proto-apollo-geojson](/en/api/io/proto-apollo-geojson)                                   | `computeApolloMapBounds`                                    |
| Track a phantom proto byte after round-trip | [io/proto-entity-bridge](/en/api/io/proto-entity-bridge)                                     | `enumFromProtoOptional / pointFromProto.z handling`         |
| Add editor-only metadata                    | [io/proto-editor-meta](/en/api/io/proto-editor-meta)                                         | `EditorMeta / readEditorMeta / writeEditorMeta`             |

## Versioning & stability

- The API is at v0.x; breaking changes are noted in
  [`CHANGELOG.md`](/en/changelog).
- Fields prefixed with `_` (`_userOverrides`, `_source`, …) are
  internal protocol; do not write them from UI code without the
  matching entityOps helper.
- Pages flagged "Planned" are placeholders, not commitments. Open an
  RFC issue before implementation.

## Test index

| Tests directory                        | Coverage                                      |
| -------------------------------------- | --------------------------------------------- |
| `src/store/__tests__/`                 | `mapStore` mutators + R1 undo-cancel          |
| `src/io/proto/__tests__/`              | bin/text codec round-trips + loader behaviour |
| `src/core/elements/overlap/__tests__/` | reconcile / pairTable / polyClip / regionId   |
| `src/core/geometry/__tests__/`         | interpolate / topology / hitTest / snap       |
| `src/lib/__tests__/`                   | entityOps / geo / schemas                     |
| `src/hooks/__tests__/`                 | undoCancel / drawCommit / dragPan             |

## Feedback

- Docs out of sync with code: open a PR under `docs/` with `git grep`
  evidence.
- Suspected implementation bug: run `pnpm test --reporter=verbose`
  first; if a unit test fails, attach it to the issue.
- Performance regressions: include the output of
  `pnpm bench --outputJson` in the PR description. CI gates this via
  `scripts/check-bench-budget.mjs`.
