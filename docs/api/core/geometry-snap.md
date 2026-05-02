# Geometry: snap

> Source: `src/core/geometry/snap.ts`

## Overview

Pure-geometry snap module: given the cursor position and the current
entity collection, find the best snap target (vertex or edge segment)
within a metre radius. Used by the drawing tools' "magnet" preview, by
endpoint snapping during lane connection, and by the inspector's
"connect to nearest endpoint" affordance.

Three contracts the module deliberately enforces:

- **No store coupling.** Caller passes in `entities`, `excludeId`,
  `radiusMeters`. The module does not import zustand, MapLibre, or any
  worker. Tests run with plain `Map` instances.
- **No spatial index.** Each call scans every candidate. Map sizes in
  the editor stay under ~10⁴ entities and mousemove runs at 60 fps with
  sub-millisecond budget; an RBush is overhead.
- **Lane endpoints only.** Lanes have direction. Topology
  (predecessor / successor) is only meaningful at the centerline
  endpoints — interior vertex snaps would produce coincident geometry
  without a topological link, leaving the user with what looks like a
  connection but acts like a stray point.

::: info Latitude-aware projection
Distance comparison and edge projection happen in a local ENU plane:
each candidate is multiplied by `(cosLat × DEG_TO_M, DEG_TO_M)` on the
fly. cosLat is taken from the cursor's latitude — a single rad·degree
correction that keeps the metric "1 m" stable regardless of viewport.
:::

## Exports

### Types

#### `SnapKind`

```ts
type SnapKind = 'vertex' | 'edge';
```

#### `LaneEndpointRole`

```ts
type LaneEndpointRole = 'start' | 'end';
```

Drives the pred/succ decision in `reconcileLaneTopology`. Snapping a
new lane's start to an existing lane's end means
"existing → new" (existing.successor += new); snapping to an existing
lane's start means "fork" (no pred/succ). Only `start` / `end` snaps
establish topology.

#### `SnapTarget`

```ts
interface SnapTarget {
  kind: SnapKind;
  point: GeoPoint; // the snapped lng/lat
  entityId: string;
  entityType: string;
  vertexIndex?: number; // for kind === 'vertex'
  endpointRole?: LaneEndpointRole; // only on lane vertex hits
}
```

### Functions

#### `pixelsToMeters(pixels, lat, zoom): number`

Web-Mercator pixel-to-metre at a given latitude / zoom (MapLibre's
512-px tile sizing). Used by callers to derive the metre-space
`radiusMeters` from a pixel threshold (typical: 12 px tolerance).

```ts
const EARTH_CIRC = 40_075_016.686; // metres
const metersPerPixel = (cos(lat) * EARTH_CIRC) / (512 * 2 ** zoom);
```

#### `collectCandidates(entities, excludeId)`

```ts
{ vertices: VertexCandidate[]; edges: EdgeCandidate[] }
```

Sweeps over all entities and produces two flat lists of candidates.
Switch on `entityType`:

- **`lane`** — endpoint vertices only (start + end with `endpointRole`),
  but **all** segments as edge candidates so mid-lane proximity can
  produce an `edge` snap (without claiming a topological connection).
- **`junction` / `pncJunction` / `parkingSpace` / `crosswalk` /
  `signal`** — every polygon vertex, every polygon edge.
- **`road`** — skipped (its geometry comes from its lanes already
  harvested).
- **default** — generic geometry entities (polyline / bezier / polygon /
  rect / arc): expose `points: GeoPoint[]` if present, else
  `anchors[].point`.

The function is exported for tests; production code calls
`findSnapTarget` instead.

#### `findSnapTarget(point, entities, radiusMeters, excludeId = null): SnapTarget | null`

Main entry. Two-pass search:

1. **Vertices** — pick the vertex with the smallest squared distance
   inside `radiusMeters`. If any vertex is within range, return it.
2. **Edges** — only run if no vertex hit. Project the cursor onto each
   edge segment (`closestOnSegment`), pick the smallest distance.

Vertex-first is intentional: a vertex within range wins over a closer
edge. This matches user intent ("connect to that endpoint" beats "snap
to the line near it").

## Behavior

- The exclude id is the actively-edited entity — pass `null` when
  drawing a fresh entity.
- `radiusMeters <= 0` returns `null` (snap disabled).
- All distance comparisons use squared distance until the winner is
  picked — no `sqrt` in the inner loop.
- Vertices and edges are picked from the **same** projection (cosLat
  taken from the cursor latitude, not per-candidate). Errors at the
  scale of a viewport are negligible.
- Polygon entities expose every vertex (interior insertion is useful
  for rough-trace alignment workflows).

::: warning Lane interior snap
A new lane drawn whose endpoint cursor lands on an existing lane's
_interior_ will produce an `edge` snap (rendering coincidence) but not
a vertex snap. There is no topological link. The drawing tool may
still elect to insert a midpoint into the existing lane via a different
flow, but that is the caller's responsibility.
:::

## Examples

Mouse-move handler in `useMapEventRouter`:

```ts
import { findSnapTarget, pixelsToMeters } from '@/core/geometry/snap';

function onMouseMove(e: MapMouseEvent) {
  const cursor: GeoPoint = { x: e.lngLat.lng, y: e.lngLat.lat };
  const radiusMeters = pixelsToMeters(12, cursor.y, map.getZoom());
  const target = findSnapTarget(
    cursor,
    mapStore.getState().entities.values(),
    radiusMeters,
    fsm.context.selectedEntityId,
  );
  if (target) {
    snapPreview.show(target.point, target.kind);
  }
}
```

Endpoint snap during draw, deciding whether to commit a topology link
later:

```ts
const target = findSnapTarget(cursor, entities, radius, null);
if (target?.endpointRole === 'end') {
  // Snapping new lane start to an existing lane's end →
  // reconcileLaneTopology will write succ on the existing side.
  newLanePoints[0] = target.point;
}
```

## Related

- [Geometry: connectLanes](/api/core/geometry-connect-lanes) — uses similar endpoint-pair logic for the explicit "Connect" command
- [Geometry: laneTopology](/api/core/geometry-lane-topology) — consumes the start/end snap convention to derive `predecessorIds` / `successorIds`
- [Apollo compile: laneBoundaryGeometry](/api/core/geometry-apollo-compile) — `curvePoints` powers the lane endpoint extraction
