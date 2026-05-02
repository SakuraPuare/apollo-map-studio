# ID Generator

> Source: `src/lib/idGenerator.ts`

## Overview

`idGenerator.ts` produces deterministic, Apollo-compatible string ids
for newly-created entities. The naming scheme is **modelled directly
on Apollo's reference fixture maps** (`borregas_ave/base_map.bin`,
`sunnyvale_loop/sim_map.txt`):

```
lane_42        road_3        signal_7        stopsign_2
J_5            CW_11         RSU_1           PNCJ_4
parkingspace_8 speedbump_3   yieldsign_2     cleararea_5
```

The module enforces two invariants:

1. **Per-type counters** are derived from the existing entity Map, not
   from a global incrementing counter. This means an id never collides
   with an imported Apollo entity that already used the same number.
2. **Derived entities (Overlap, RegionOverlap) are forbidden** from this
   path. Their ids are computed from participants in
   `core/elements/overlap/{overlapId,regionId}` and any attempt to
   mint one through `nextEntityId` throws — so the manual creation
   path can't pollute the derived-id namespace.

The "nanoid" mention in the task is a misnomer for this codebase — the
implementation is a hand-rolled prefix + max-counter scheme, no nanoid
dependency. The semantics are deliberately deterministic, not random,
because Apollo proto ids are user-facing strings (not opaque tokens).

## Exports

| Symbol           | Signature                            | Purpose                                                               |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `entityIdPrefix` | `(entityType: string) => string`     | Map entity type to its Apollo-style prefix. Throws for derived types. |
| `nextEntityId`   | `(entityType, entities?) => string`  | Compose `${prefix}_${maxN+1}` against the live entity map.            |
| `nextSubId`      | `(prefix, existingIds) => string`    | Same scheme for sub-entity ids (sections, passages, passage groups).  |
| `SUB_PREFIX`     | `{ section, passage, passageGroup }` | Pre-baked sub-prefixes.                                               |

## Behavior

### Prefix table

```ts
const ENTITY_PREFIX: Record<string, string> = {
  lane: 'lane',
  junction: 'J',
  pncJunction: 'PNCJ',
  parkingSpace: 'parkingspace',
  crosswalk: 'CW',
  signal: 'signal',
  stopSign: 'stopsign',
  speedBump: 'speedbump',
  yieldSign: 'yieldsign',
  clearArea: 'cleararea',
  barrierGate: 'barriergate',
  area: 'area',
  road: 'road',
  rsu: 'RSU',

  // Editor-only drawing primitives
  polyline: 'polyline',
  catmullRom: 'catmullrom',
  bezier: 'bezier',
  arc: 'arc',
  rect: 'rect',
  polygon: 'polygon',
};
```

The drawing primitive prefixes (`polyline`, `bezier`, …) live in the
same table for uniformity but never participate in Apollo round-trip —
the entity bridge does not emit them.

### Derived-type guard

```ts
const DERIVED_ENTITY_TYPES = new Set(['overlap', 'region']);

export function entityIdPrefix(entityType: string): string {
  if (DERIVED_ENTITY_TYPES.has(entityType)) {
    throw new Error(
      `[idGenerator] '${entityType}' is a derived entity type — id must come from ` +
        `core/elements/overlap/{overlapId,regionId}, not nextEntityId/entityIdPrefix.`,
    );
  }
  return ENTITY_PREFIX[entityType] ?? entityType.charAt(0).toUpperCase() + entityType.slice(1);
}
```

Without this guard, calling `nextEntityId('overlap', entities)` would
mint `overlap_42`, which `isDerivedOverlapId` would later flag as
synthetic and remove during reconcile — a subtle "your manually-created
overlap disappeared on next save" bug. Throwing at the source prevents
the foot-gun.

For unknown types, the fallback is `Capitalize(type)` (e.g.
`adRoute` → `AdRoute`). Callers should not rely on this — the table is
the source of truth.

### `maxNumberWithPrefix`

```ts
function maxNumberWithPrefix(prefix: string, ids: Iterable<string>): number {
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}
```

Scans every id matching `${prefix}_<digits>` and returns the highest
number. Imported Apollo ids that don't match (e.g. legacy
`lane_xyz` strings) are simply ignored. The next id is `max + 1`.

### `nextEntityId`

```ts
export function nextEntityId(
  entityType: string,
  entities?: ReadonlyMap<string, MapEntity>,
): string {
  const prefix = entityIdPrefix(entityType);
  if (entities) {
    const ids: string[] = [];
    for (const e of entities.values()) {
      if (e.entityType === entityType) ids.push(e.id);
    }
    return `${prefix}_${maxNumberWithPrefix(prefix, ids) + 1}`;
  }
  fallbackCounter[prefix] = (fallbackCounter[prefix] ?? 0) + 1;
  return `${prefix}_${fallbackCounter[prefix]}`;
}
```

Two modes:

- **With `entities`** (production path): scan entities of the same type,
  compute `max + 1`. Deterministic and collision-free against imports.
- **Without `entities`** (test path): use a module-scoped counter per
  prefix. Resets only on module reload — fine for unit tests, never
  for production.

`useDrawCommit` and the action registry's `createEntity` consumer
always pass the live `mapStore.entities` map.

### `nextSubId`

Used for ids inside an entity (e.g. road sections, PNC passages) where
the namespace is **scoped to one parent entity**, not the global map:

```ts
export function nextSubId(prefix: string, existingIds: Iterable<string>): string {
  return `${prefix}_${maxNumberWithPrefix(prefix, existingIds) + 1}`;
}
```

Pass the parent entity's existing sub-ids (e.g.
`road.sections.map(s => s.id)`).

### `SUB_PREFIX`

```ts
export const SUB_PREFIX = {
  section: 'section',
  passage: 'passage',
  passageGroup: 'passagegroup',
} as const;
```

Pre-baked prefixes for common sub-entities; keep call sites consistent.

## Examples

### Mint an entity id during a draw commit

```ts
import { nextEntityId } from '@/lib/idGenerator';

const id = nextEntityId('lane', useMapStore.getState().entities);
const entity = createEntity('lane', 'drawCatmullRom', points, [], { laneHalfWidth: 1.75 });
useMapStore.getState().addEntity({ ...entity, id });
```

### Add a road section

```ts
import { nextSubId, SUB_PREFIX } from '@/lib/idGenerator';

const sectionId = nextSubId(
  SUB_PREFIX.section,
  road.sections.map((s) => s.id),
);
const next = { ...road, sections: [...road.sections, { id: sectionId, laneIds: [] }] };
```

### Test fallback (no entities map)

```ts
import { nextEntityId } from '@/lib/idGenerator';

const a = nextEntityId('lane'); // → 'lane_1' (first call this test)
const b = nextEntityId('lane'); // → 'lane_2'
```

### Catching the derived-type misuse

```ts
import { nextEntityId } from '@/lib/idGenerator';

expect(() => nextEntityId('overlap', entities)).toThrow(/derived entity type/);
```

## Related

- [/api/core/elements/overlap](/api/core/elements/overlap) — derived-id
  generators (`overlapId`, `regionId`) for overlap entities.
- [Entity Ops — Edit](./entity-ops.md#edit-edit-ts) — `createEntity`
  consumer.
- [/api/hooks/use-draw-commit](/api/hooks/use-draw-commit) — primary
  caller of `nextEntityId`.
- [/api/core/elements](/api/core/elements) — element registry that
  declares per-entity-type construction.
