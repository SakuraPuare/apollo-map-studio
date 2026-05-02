---
title: types/editor — drag-handle metadata types
description: Five-variant union (vertex / handleIn / handleOut / rotate / center) describing the type of a draggable point in the hot layer.
---

# `types/editor` — drag-handle metadata types

> Source: `src/types/editor.ts` · 3 lines

## Purpose

`types/editor` exports one type — `DragPointType` — describing the kind of a draggable point in the hot layer. Both drawing primitives and selected Apollo entities render these points; the FSM `EDIT_POINT` event carries the value down to `entityOps.setEditPoint` (and equivalents).

## Public API

| Symbol          | Kind  | Summary                |
| --------------- | ----- | ---------------------- |
| `DragPointType` | union | Five drag-handle kinds |

## Detailed entries

### `type DragPointType`

```ts
export type DragPointType = 'vertex' | 'handleIn' | 'handleOut' | 'rotate' | 'center';
```

| Value       | Meaning                                                                                         | Where it appears                            |
| ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `vertex`    | Standard vertex (lane / polyline / polygon / arc-3-points / rect-4-corners / Apollo editPoints) | Almost everywhere                           |
| `handleIn`  | Incoming bezier handle                                                                          | bezier primitives, curved lane edit         |
| `handleOut` | Outgoing bezier handle                                                                          | bezier primitives, curved lane edit         |
| `rotate`    | Rectangle rotation handle                                                                       | rect / parkingSpace / crosswalk / clearArea |
| `center`    | Whole-entity translate handle                                                                   | Reserved (not active in main flow yet)      |

## Relationship with rendering

`geoJsonHelpers.ts` writes a `role` property on each point Feature:

| GeoJSON `role`                                       | DragPointType mapping |
| ---------------------------------------------------- | --------------------- |
| `'vertex'`                                           | `vertex`              |
| `'handle'` + `properties.handleType === 'handleIn'`  | `handleIn`            |
| `'handle'` + `properties.handleType === 'handleOut'` | `handleOut`           |
| `'handle'` + `properties.handleType === 'rotate'`    | `rotate`              |

`useMapEventRouter` and its `mapEventRouter/*` helpers query the rendered feature on mousedown, read `role` / `handleType`, and dispatch the corresponding `DragPointType` to the FSM.

## Side effects

None — pure type.

## Test coverage

No standalone tests.

## Consumers

- `src/hooks/useMapEventRouter.ts` — binds maplibre events and delegates to router helpers
- `src/hooks/mapEventRouter/selectionDrag.ts` — uses this enum for selection drag target routing
- `src/components/map/entityMutations.ts` / `src/components/map/entityMutations/*` — routes to point, Bezier handle, rect-rotation, and other entity mutations
- `src/hooks/useHotLayer.ts` — drives interactive hot-layer features

## Why a separate file

Originally lived alongside "entity shape" types in `entities.ts`. Splitting:

1. Keeps `entities.ts` focused on the _shape_ of an entity.
2. Keeps `editor.ts` focused on _runtime edit metadata_.
3. Adding `'midpoint'` (insert a vertex at line midpoint) later means touching one file.

Tiny but well-scoped — part of the R7 type-boundary split.

## Source map

| Lines | Content         |
| ----- | --------------- |
| 2     | `DragPointType` |

## End-to-end example

### Hot-layer rendering with `role`

```ts
// geoJsonHelpers.ts
features.push(pointFeature(corners[i], 'vertex', { index: i }));
features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
features.push(pointFeature(a.handleIn, 'handle', { index, handleType: 'handleIn' }));
```

### Reconstructing `DragPointType` from a maplibre query

```ts
// mapEventRouter/selectionDrag.ts (sketch)
function getDragPointType(features: maplibregl.MapGeoJSONFeature[]): DragPointType | null {
  const f = features[0];
  if (!f) return null;
  const role = f.properties?.role;
  if (role === 'vertex') return 'vertex';
  if (role === 'handle') {
    const t = f.properties?.handleType;
    if (t === 'handleIn') return 'handleIn';
    if (t === 'handleOut') return 'handleOut';
    if (t === 'rotate') return 'rotate';
  }
  return null;
}
```

### Cursor routing

```ts
const CURSOR: Record<DragPointType, string> = {
  vertex: 'grab',
  handleIn: 'crosshair',
  handleOut: 'crosshair',
  rotate: 'alias',
  center: 'move',
};

function setCursor(type: DragPointType | null) {
  map.getCanvas().style.cursor = type ? CURSOR[type] : '';
}
```

### Dispatch routing

```ts
// entityMutations.ts
function dispatch(type: DragPointType, index: number, point: GeoPoint) {
  switch (type) {
    case 'vertex':
      mapStore.updateEntity(id, setEditPoint(entity, index, point));
      break;
    case 'handleIn':
    case 'handleOut':
      mapStore.updateEntity(id, setBezierHandle(entity, index, type, point));
      break;
    case 'rotate':
      mapStore.updateEntity(id, setRectRotation(entity, point));
      break;
    case 'center':
      mapStore.updateEntity(id, moveEntity(entity, dx, dy));
      break;
  }
}
```

Each variant lands in a different store path — five tags cover every "what does dragging this mean" semantic.

## Orthogonality with `entityType`

`DragPointType` is **orthogonal** to `entityType` — a `vertex` could belong to polyline / lane / signal alike; `rotate` only ever belongs to rect-shaped entities. The union still lets callers narrow as needed.

## Future variants

Reserved but not implemented:

- `'midpoint'` — click on a polyline midpoint to insert a vertex.
- `'start'` / `'end'` — distinguish the first and last polyline points for cursor styling.
- `'add'` — insert a new bezier anchor on a curve.

Adding any of these means editing this single file; the exhaustiveness check inside every consumer `switch` flushes out missing branches.

## See also

- [`entities`](./entities.md) — entity shape types
- [`geoJsonHelpers`](../lib/geo-json-helpers.md) — emits `role` properties
- `src/hooks/useMapEventRouter.ts` — map event entry point
- `src/hooks/mapEventRouter/selectionDrag.ts` — primary consumer
- `src/components/map/entityMutations.ts` — entity mutation entry point
- `src/hooks/useHotLayer.ts` — hot-layer rendering entry point
