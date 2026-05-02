# lib / entityOps

Sources:

- `src/lib/entityOps.ts` — barrel re-export.
- `src/lib/entityOps/edit.ts` — geometry mutation operations.
- `src/lib/entityOps/cascadeDeleteRefs.ts` — reference cleanup on
  delete.
- `src/lib/entityOps/reparent.ts` — parent-child rewiring.
- `src/lib/entityOps/typeGuards.ts` — `isApolloEntityType` /
  `isDrawingEntity` / `isAreaEntity` / `isPolygonEditEntity`.

`entityOps` is the anti-corruption facade between React/UI code and
Apollo entity internals.

## Why It Exists

UI code should not know how a lane stores `centralCurve`, how road
sections contain lane ids, or how Apollo proto optional fields are
preserved. That knowledge lives here and in core geometry modules.

Audit before each refactor — a non-empty result means a new leak:

```bash
git grep "from '@/core/geometry/apolloCompile'" -- 'src/components/**' 'src/hooks/**'
```

See [/architecture/anti-corruption-layer](/architecture/anti-corruption-layer).

## Exports

### Edit (`edit.ts`)

- `getEditPoints(entity)` — `GeoPoint[]` for the editable handles.
- `setEditPoint(entity, index, point)` — mutate one handle.
- `setAllEditPoints(entity, points)` — replace all handles in one call.
- `moveEntity(entity, dx, dy)` — translate.
- `deleteVertex(entity, index)` — drop one vertex; returns `null`
  when it would invalidate the entity (e.g. a 2-point polyline).
- `compileEntity(entity)` — produce cold-layer `GeoJSON.Feature[]`.
- `createEntity(elementType, drawTool, points, anchors, options?)` —
  build a fresh `ApolloEntity` from FSM commit data.
- `entityCoords(entity)` — flat `LngLat[]` for hit-testing.

Every Apollo-side operation flows through `core/geometry/apolloCompile`
and then `applyDerive` from `core/elements/derive` to recompute
derived state (lane.length, lane boundaries from central curve, etc.).

### Cascade delete (`cascadeDeleteRefs.ts`)

- `cascadeDeleteRefsFull(removed, all)` →
  `{ changes, cascadeRemoved }`.
- `cascadeDeleteRefs(removed, all)` →
  `Map<string, MapEntity>` (deprecated; returns only `changes`).

Strips removed ids from every `overlapIds`, `pred/succ/neighbour`
lane lists, `road.section.laneIds`, `lane.junctionId`,
`rsu.junctionId`, and PNCJunction passages. Overlaps that fall below
2 participants are added to `cascadeRemoved`.

### Reparent (`reparent.ts`)

- `reparent(child, target, all)` → `ReparentResult`.
- `canReparent(child, target, all)` → `boolean`.

Allowed transitions:

| Child  | → `junction` | → `road`                           | → `roadSection` | → `none` |
| ------ | ------------ | ---------------------------------- | --------------- | -------- |
| `lane` | yes          | yes (auto-routes to first section) | yes             | yes      |
| `road` | yes          | —                                  | —               | yes      |
| `rsu`  | yes          | —                                  | —               | yes      |

`stripLaneFromAllSections` keeps cross-road state consistent — a
lane moved into junction A or road-section B is also removed from
any other road section that previously held it.

### Type guards (`typeGuards.ts`)

```ts
isDrawingEntity(e); // 'polyline' | 'catmullRom' | 'bezier' | 'arc' | 'rect' | 'polygon'
isApolloEntityType(e); // !isDrawingEntity
isAreaEntity(e); // apollo area || rect/polygon
isPolygonEditEntity(e); // rect/polygon || apollo polygon-edit (NOT lane/signal)
```

`isPolygonEditEntity` is the hot-layer's polygon-vs-polyline gate.
Lane and signal pass `isAreaEntity` (area-like hit boxes) but **fail**
`isPolygonEditEntity` because their edit points are open polylines.

## Store Integration

`mapStore.removeEntity()` uses cascade helpers to remove dangling
references. `mapStore.reparentEntity()` delegates to `reparent()` and
applies returned changes in a single transaction.

## Examples

```ts
import {
  cascadeDeleteRefsFull,
  reparent,
  setEditPoint,
  isPolygonEditEntity,
} from '@/lib/entityOps';

// Delete with cascade
const { changes, cascadeRemoved } = cascadeDeleteRefsFull(new Set([id]), all);

// Reparent
const result = reparent(lane, { kind: 'junction', id: 'J_3' }, all);
if (result.rejected) toast.error(result.rejected);

// Edit
const next = setEditPoint(lane, vertexIndex, { x: lng, y: lat });

// Render gate
if (isPolygonEditEntity(entity)) renderPolygon(entity);
else renderPolyline(entity);
```

## Related

- [/architecture/anti-corruption-layer](/architecture/anti-corruption-layer)
- [/api/io/proto-entity-bridge](/api/io/proto-entity-bridge) — proto
  ↔ `MapEntity` bridge.
- [/api/store/map-store](/api/store/map-store) — primary consumer.
- [/api/lib/editable-guard](/api/lib/editable-guard) — read-only gate
  every store mutator runs.
- [/api/lib/schemas](/api/lib/schemas) — Zod schemas for inspector
  forms that drive `setEditPoint`-style flows.
