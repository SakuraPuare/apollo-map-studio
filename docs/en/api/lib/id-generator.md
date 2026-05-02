---
title: idGenerator — entity ID auto-increment factory
description: Apollo-aligned entity-ID prefix registry plus per-type counter; explicitly rejects derived entity types.
---

# `idGenerator` — entity ID auto-increment factory

> Source: `src/lib/idGenerator.ts` · 95 lines

## Purpose

Every Apollo entity needs a stable string id. Apollo's own example data (`borregas_ave/base_map.bin`) follows these conventions:

```
lane_N        / road_N       / signal_N    / stopsign_N      (lowercase + underscore)
J_N           / CW_N         / RSU_N                         (abbreviations)
overlap_<participantA>_<participantB>                        (semantic id)
```

`idGenerator` wraps "look up prefix → find max existing suffix → increment" into two public functions (`nextEntityId` / `nextSubId`) and **explicitly rejects** the derived entity types (`overlap` / `region`) so they cannot be accidentally manufactured by the manual id path — derived ids must come from `core/elements/overlap/{overlapId,regionId}`.

## Prefix registry

| entityType     | Prefix         |
| -------------- | -------------- |
| `lane`         | `lane`         |
| `junction`     | `J`            |
| `pncJunction`  | `PNCJ`         |
| `parkingSpace` | `parkingspace` |
| `crosswalk`    | `CW`           |
| `signal`       | `signal`       |
| `stopSign`     | `stopsign`     |
| `speedBump`    | `speedbump`    |
| `yieldSign`    | `yieldsign`    |
| `clearArea`    | `cleararea`    |
| `barrierGate`  | `barriergate`  |
| `area`         | `area`         |
| `road`         | `road`         |
| `rsu`          | `RSU`          |
| `polyline`     | `polyline`     |
| `catmullRom`   | `catmullrom`   |
| `bezier`       | `bezier`       |
| `arc`          | `arc`          |
| `rect`         | `rect`         |
| `polygon`      | `polygon`      |

## Public API

| Symbol           | Kind  | Signature                            | Summary                                                                                       |
| ---------------- | ----- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `entityIdPrefix` | fn    | `(entityType: string) => string`     | Look up prefix; throws on derived types                                                       |
| `nextEntityId`   | fn    | `(entityType, entities?) => string`  | Auto-increment; with `entities` scans for max + 1, without falls back to a per-prefix counter |
| `nextSubId`      | fn    | `(prefix, existingIds) => string`    | For RoadSection / Passage / PassageGroup                                                      |
| `SUB_PREFIX`     | const | `{ section, passage, passageGroup }` | Sub-prefix constants                                                                          |

Derived-type set (excluded from the prefix table):

```ts
const DERIVED_ENTITY_TYPES = new Set(['overlap', 'region']);
```

## Detailed entries

### `entityIdPrefix(entityType): string`

```ts
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

- `overlap` / `region` → throws (the message points to the right factory).
- Hit in `ENTITY_PREFIX` → returns the canonical prefix.
- Miss → capitalises first letter (graceful for experimental new types).

### `nextEntityId(entityType, entities?): string`

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

Two paths:

1. **With `entities`** — scans the map for entities of the same type, parses their numeric suffixes, returns max + 1. This is the preferred store-write path — it guarantees no collision with imported ids.
2. **Without `entities`** — uses a module-level `fallbackCounter`. Tests / quick scratch only.

### `nextSubId(prefix, existingIds): string`

```ts
export function nextSubId(prefix: string, existingIds: Iterable<string>): string {
  return `${prefix}_${maxNumberWithPrefix(prefix, existingIds) + 1}`;
}
```

For sub-structures inside an entity — `RoadSection` (`section_3`), `Passage`, `PassageGroup`. `prefix` typically comes from `SUB_PREFIX`.

```ts
const sectionId = nextSubId(
  SUB_PREFIX.section,
  road.sections.map((s) => s.id),
);
```

### `maxNumberWithPrefix(prefix, ids)` — internal

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

Strict regex `^prefix_(\d+)$` — `lane_foo` / `lane_3a` are skipped. Empty match → 0, so the first id becomes `prefix_1`.

## Internal state

```ts
const fallbackCounter: Record<string, number> = {};
```

Module-level. **Not persisted** — restart resets to zero, but only the no-`entities` path uses it; production writes always pass the entity map, so id consistency is guaranteed by the store across restarts.

## Design notes

### Overlap / Region rejection

Overlap / Region carry semantic ids (`overlap_<A>_<B>`) derived from their participants. If `nextEntityId` were allowed to manufacture `overlap_42`, the reconcile pass would treat it as a stale auto-derived overlap and silently delete it. Explicit `throw` beats silent bug.

### Mixed casing

Some prefixes are lowercase (`lane`), others abbreviated upper-case (`J`, `CW`, `RSU`). This is the **observed Apollo convention** and we keep it as-is — Apollo tooling may depend on these prefixes during downstream processing.

## Side effects

- `fallbackCounter` is module-level state (implicit side effect).
- No store / IO / console.

## Test coverage

`src/lib/__tests__/idGenerator.test.ts` covers:

- Per-type prefix correctness
- `nextEntityId` returns `lane_6` when entities contain `lane_5` and `lane_3`
- Derived type throws
- `nextSubId` works on a road section list

## Consumers

- `src/store/mapStore.ts` — `addEntity` synthesises an id with `nextEntityId(entityType, currentMap)` when the entity arrives unkeyed
- `src/lib/entityOps/edit.ts` — inside `createEntity`
- `src/components/menu/EditMenu.tsx` — clipboard paste paths
- `src/io/mapIO.ts` — uses `entityIdPrefix` to validate exported ids

## Source map

| Lines | Content                |
| ----- | ---------------------- |
| 19–40 | `ENTITY_PREFIX`        |
| 42–43 | `DERIVED_ENTITY_TYPES` |
| 45–49 | `SUB_PREFIX`           |
| 51–59 | `entityIdPrefix`       |
| 61–72 | `maxNumberWithPrefix`  |
| 74    | `fallbackCounter`      |
| 76–90 | `nextEntityId`         |
| 92–94 | `nextSubId`            |

## Cooperation with the import path

Imported entities keep the ids from the proto file — **they do not** go through `nextEntityId`. So:

- Import `lane_5, lane_3, lane_8` → next `nextEntityId('lane', entities)` returns `lane_9`.
- Import `lane_foo` (non-matching pattern) → `maxNumberWithPrefix` skips it; the counter is unaffected.
- Import an empty map → `nextEntityId('lane', entities)` returns `lane_1`.

## Cooperation with cascadeDeleteRefs

Deleting an entity _releases_ its id — the next auto-increment may reuse it:

```ts
// Delete lane_3; remaining: lane_1, lane_2, lane_4.
// Next create: max=4 + 1 = lane_5 (will not reuse lane_3).
```

`maxNumberWithPrefix` always returns "current max + 1" so the new id never collides with a _currently present_ one. A previously-deleted id may be reused if it was the max before deletion.

## fallbackCounter pitfalls

```ts
nextEntityId('lane'); // no entities → fallbackCounter path
nextEntityId('lane', entities); // entities → scan path
```

Mixing both within the same process can produce duplicate ids:

- Step 1: `nextEntityId('lane', { lane_1 })` → `lane_2`, but fallbackCounter is never updated.
- Step 2: `nextEntityId('lane')` → `lane_1` (fallbackCounter starts at 0).

**Rule**: production code always passes `entities`; the bare form is reserved for tests or scratch.

## Entity types vs. Apollo entity types

The registry covers 21 entity types, but Apollo proto has 17 — the extra six are drawing primitives (polyline / catmullRom / bezier / arc / rect / polygon). They use `idGenerator` but never cross the Apollo wire boundary.

## Design trade-off: why not UUID

UUIDs collide-free but:

- Unreadable (`f47ac10b-58cc-…` vs `lane_3`).
- Break compatibility with Apollo's example data conventions (round-trip fidelity).
- Cannot encode semantic ids like `overlap_lane_3_signal_5`.

Cost: `fallbackCounter` is process-local (resets on restart); since production always passes `entities`, the scan-based path guarantees uniqueness.

## Edge case: very large numbers

`maxNumberWithPrefix` parses with `Number(m[1])` — JS numbers safely represent integers up to ~2^53 (quadrillions). Apollo HD-Map lane counts are < 100 k, so we are far from the limit.

## See also

- `core/elements/overlap/overlapId` — semantic-id derivation for overlaps
- [`entityOps`](./entity-ops.md) — `createEntity` consumer
- `src/types/apollo.ts` — entity type definitions
- `src/lib/__tests__/idGenerator.test.ts` — unit tests
