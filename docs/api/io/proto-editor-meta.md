# IO / proto editor meta

Source: `src/io/proto/editorMeta.ts`.

`editor_meta` is Apollo Map Studio's editor-only metadata field in
the Apollo `Map` proto, at proto field number 1000 (see
`src/proto/editor/editor_meta.proto`). It lets the editor preserve
information that Apollo runtime tools do not care about — without
needing a sidecar file.

::: tip Why it lives inside the proto
Apollo runtime tooling treats `editor_meta` as an unknown field and,
per proto2 default, preserves it on round-trip. So one `.bin` is
consumed by both the editor (which decodes the field) and production
Apollo (which preserves it untouched).
:::

## Exports

- `EditorMeta`, `EditorEntityMeta`, `EditorGeometryKind` — TypeScript
  types.
- `EDITOR_META_VERSION` — schema revision (currently `1`); bump on
  non-additive changes.
- `readEditorMeta(rawMap)` — decode wire data into typed metadata.
- `writeEditorMeta(rawMap, meta)` — embed typed metadata back into
  the rawMap.
- `entityKey(entityType, id)` — compose `${entityType}:${id}`.

## Shape

```ts
interface EditorMeta {
  version: number;
  entity: Record<string, EditorEntityMeta>;
}

interface EditorEntityMeta {
  geometryKind?: 'LINESTRING' | 'POLYGON';
}
```

Entity keys are built as:

```ts
entityKey(entityType, id); // `${entityType}:${id}`
```

The composite key avoids collisions across entity types that share an
id namespace (e.g. `lane_1` could exist alongside `J_1`).

## Wire Format

The wire format uses snake_case and numeric enum values to match
protobufjs with `keepCase: true`:

```ts
interface EditorMetaWire {
  version?: number;
  entity?: Record<string, { geometry_kind?: number }>; // 1=LINESTRING, 2=POLYGON
}
```

`readEditorMeta()` decodes raw wire data into typed metadata, and
`writeEditorMeta()` writes typed metadata back to `rawMap`.

## Forward / Backward Compatibility

- **Read**: unknown numeric values are silently dropped
  (`raw.geometry_kind in NUM_TO_KIND` check). A newer editor that
  adds a third geometry kind produces a `.bin` that loads cleanly
  in older editors.
- **Write**: only set fields are emitted. An entity with no
  `geometryKind` writes `{}`, not `{ geometry_kind: 0 }`.

## Round-trip Strategy

`entitiesToApolloMap(baseMap, entities)` spreads `baseMap` into the
output, so `editor_meta` is preserved on the export side by default.
`writeEditorMeta` is called explicitly before re-encode to capture
any new overrides set during the session.

## Examples

```ts
import {
  readEditorMeta,
  writeEditorMeta,
  entityKey,
  EDITOR_META_VERSION,
} from '@/io/proto/editorMeta';

// Read
const meta = readEditorMeta(rawMap);
const override = meta.entity[entityKey('lane', 'lane_1')];
if (override?.geometryKind === 'POLYGON') {
  /* render closed ring */
}

// Write
writeEditorMeta(rawMap, {
  version: EDITOR_META_VERSION,
  entity: {
    [entityKey('lane', 'lane_42')]: { geometryKind: 'POLYGON' },
  },
});
```

## Related

- [/api/io/proto-codec-bin](/api/io/proto-codec-bin) — preserves the
  field via `defaults: false`.
- [/api/io/proto-entity-bridge](/api/io/proto-entity-bridge) —
  preserves it via `entitiesToApolloMap`'s `baseMap` passthrough.
- [/api/io/map-io](/api/io/map-io) — orchestrates the import/export
  flow that reads and writes `editor_meta`.
