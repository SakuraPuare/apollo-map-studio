# GeoJSON Helpers

> Source: `src/lib/geoJsonHelpers.ts`

## Overview

`geoJsonHelpers.ts` builds the **hot-layer** GeoJSON `Feature[]` for any
entity that can be drawn / edited live on the map. It is the renderer
that the FSM-driven hot layer uses while a draw or drag is in flight —
not the cold layer (which runs in the spatial worker and reads
`compileEntity` / `compileApolloFeatures`).

The module owns three concerns:

1. **Primitive constructors** for line / point / handle-line / polygon
   features with an optional `properties` payload. These are the
   atomic features the hot layer renders.
2. **`entityToHotFeatures(entity)`** — the polymorphic entry point that
   dispatches on `entityType` and returns a feature collection that
   includes the geometry plus all editable handles (vertex points,
   bezier control points, rectangle rotate handle, etc.).
3. **Apollo entity coverage** via the entity's recorded `source`
   metadata: a Lane drawn as a Bézier still surfaces its anchor
   handles for editing; a parking space drawn as a rotated rectangle
   still surfaces the rotation handle.

## Exports

| Symbol                | Signature                                 | Purpose                                     |
| --------------------- | ----------------------------------------- | ------------------------------------------- |
| `lineFeature`         | `(coords, props?) => Feature<LineString>` | Polyline.                                   |
| `pointFeature`        | `(coord, role, props?) => Feature<Point>` | Vertex / handle marker with role tag.       |
| `handleLineFeature`   | `(from, to) => Feature<LineString>`       | Dotted handle line for bezier or rotation.  |
| `polygonFeature`      | `(coords, props?) => Feature<Polygon>`    | Auto-closes the ring if not already closed. |
| `entityToHotFeatures` | `(entity: MapEntity) => Feature[]`        | Whole-entity hot-layer compile.             |

## Behavior

### Primitives

#### `lineFeature(coords, props?)`

```ts
return {
  type: 'Feature',
  properties: { ...props },
  geometry: { type: 'LineString', coordinates: coords },
};
```

The `properties` spread copies the caller's payload. Hot layer style
expressions read `properties.role` to decide between solid / dashed /
highlight strokes.

#### `pointFeature(coord, role, props?)`

```ts
return {
  type: 'Feature',
  properties: { role, ...props },
  geometry: { type: 'Point', coordinates: coord },
};
```

`role` is required because the hot layer always needs to distinguish
vertices from handles. `props` extends with `index`, `handleType`, etc.

#### `handleLineFeature(from, to)`

Pre-baked role: `'handleLine'`. Renders as a dotted line connecting an
anchor to its bezier control point or a rectangle to its rotate
handle.

#### `polygonFeature(coords, props?)`

```ts
const ring =
  first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...coords, first] : coords;
return {
  type: 'Feature',
  properties: { ...props },
  geometry: { type: 'Polygon', coordinates: [ring] },
};
```

The auto-close is critical: GeoJSON requires the first coordinate to
appear at the end of every ring. Inspector forms and drag handlers
build polygons from raw vertex arrays — without auto-close, MapLibre
silently rejects them.

### `entityToHotFeatures` dispatch

The function dispatches on `entity.entityType` and, for Apollo
entities, on the entity's `source.drawTool` recorded at creation. The
table below shows the dispatch tree:

| `entityType`                                          | Output features                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `polyline`                                            | line (raw points) + vertex points                                                                      |
| `catmullRom`                                          | line (`catmullRom(coords)`) + vertex points                                                            |
| `bezier`                                              | line (`cubicBezier(anchors)`) + vertex points + handleIn/handleOut points + handle lines               |
| `arc`                                                 | line (`threePointArc(start, mid, end)`) + 3 vertex points                                              |
| `rect`                                                | polygon (`rectCorners(p1, p2, rotation)`) + 4 corner points + rotate handle line + rotate handle point |
| `polygon`                                             | polygon (raw points) + vertex points                                                                   |
| **Apollo entity, `source.drawTool === 'drawBezier'`** | bezier features built from `source.anchors`                                                            |
| **Apollo entity, `source.drawTool === 'drawArc'`**    | arc features built from `source.arcPoints`                                                             |
| **Apollo entity with `sourceRect`**                   | rect features built from `sourceRect.{p1, p2, rotation}`                                               |
| **Apollo entity, generic**                            | polygon if `isPolygonEditEntity`, else line; vertex points always                                      |

#### Apollo entity edit-points routing

```ts
const editPoints = getEditPoints(apolloEntity);
const coords = editPoints.map((p) => [p.x, p.y]);
if (coords.length >= 2) {
  if (isPolygonEditEntity(apolloEntity)) features.push(polygonFeature(coords));
  else features.push(lineFeature(coords));
}
coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
```

Crucially, the dispatch uses **`isPolygonEditEntity`** (not
`isAreaEntity`). The two differ for lane and signal:

- `isAreaEntity(lane)` → `true` (lane has an area-like hit box for
  spatial indexing).
- `isPolygonEditEntity(lane)` → `false` (lane edit points are the
  central-curve polyline, an open shape).

Using `isAreaEntity` here would close the lane's edit polyline into a
spurious polygon ring, making the rubber-band drag look "first-and-last
joined". Same for signal stop lines.

### Source-metadata respect

When an Apollo entity records its draw history (via
`source.drawTool`), `entityToHotFeatures` re-renders its handles in the
original mode — even if the entity now exists as a compiled Apollo
proto. So a Lane originally drawn as a Bézier shows bezier handles on
selection, not just the polyline vertices.

The `source.drawTool` lookup happens via `getSource(apolloEntity)` from
`@/types/apollo`. The `sourceRect` lookup uses `getSourceRect` for
rectangle-derived entities (e.g. a parking space drawn as a rotated
rectangle).

### Pure function

The module is purely functional: every input is a `MapEntity`, every
output is a fresh `Feature[]` array. No store reads, no DOM, no
mutations. This makes it cheap to call on every animation frame while
the user drags a vertex.

## Examples

### Hot layer compile

```ts
import { entityToHotFeatures } from '@/lib/geoJsonHelpers';
import type maplibregl from 'maplibre-gl';

function updateHotLayer(map: maplibregl.Map, entity: MapEntity) {
  const features = entityToHotFeatures(entity);
  const source = map.getSource('hot') as maplibregl.GeoJSONSource;
  source.setData({ type: 'FeatureCollection', features });
}
```

### Custom feature for a snap indicator

```ts
import { pointFeature } from '@/lib/geoJsonHelpers';

const snapMarker = pointFeature([snap.x, snap.y], 'snap', { kind: snap.kind });
```

### Rectangle handles in isolation

```ts
import { polygonFeature, pointFeature, handleLineFeature } from '@/lib/geoJsonHelpers';
import { rectCorners, rectRotateHandle } from '@/core/geometry/interpolate';

const corners = rectCorners(p1, p2, rotation);
const center = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
const handle = rectRotateHandle(p1, p2, rotation);

const features = [
  polygonFeature(corners),
  ...corners.map((c, i) => pointFeature(c, 'vertex', { index: i })),
  handleLineFeature(center, handle),
  pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }),
];
```

## Related

- [Entity Ops](./entity-ops.md) — `getEditPoints` /
  `isPolygonEditEntity` consumed here.
- [/api/core/geometry/interpolate](/api/core/geometry/interpolate) —
  catmullRom / cubicBezier / threePointArc / rectCorners / rectRotateHandle.
- [/api/core/geometry/coords](/api/core/geometry/coords) — `pointsToCoords`
  / `toLngLat` used internally.
- [/api/hooks/use-hot-layer](/api/hooks/use-hot-layer) — the consumer
  hook.
- [/api/core/geometry/apollo-compile](/api/core/geometry/apollo-compile) —
  cold-layer counterpart.
