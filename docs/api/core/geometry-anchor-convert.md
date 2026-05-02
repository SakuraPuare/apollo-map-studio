# Geometry: anchorConvert

> Source: `src/core/geometry/anchorConvert.ts`

## Overview

Two-way converter between the runtime and store representations of a
bezier anchor:

- **Runtime form** — `BezierAnchor` from `interpolate.ts`. Uses
  `LngLat = [number, number]` tuples. Consumed by `cubicBezier`,
  produced by FSM events, used by MapLibre.
- **Store form** — `BezierAnchorData` from `types/entities.ts`. Uses
  `GeoPoint = { x, y, z? }`. Lives inside `_source.anchors[]` on lane
  entities, round-trips through Apollo proto.

The split mirrors the same `LngLat ↔ GeoPoint` boundary handled by
`coords.ts` — handles can be `null` to express "this anchor has no
in/out tangent", which means corners survive the round trip without
being silently smoothed.

## Exports

### Functions

#### `anchorToRuntime(a: BezierAnchorData): BezierAnchor`

```ts
function anchorToRuntime(a: BezierAnchorData): BezierAnchor {
  return {
    point: toLngLat(a.point),
    handleIn: a.handleIn ? toLngLat(a.handleIn) : null,
    handleOut: a.handleOut ? toLngLat(a.handleOut) : null,
  };
}
```

Maps each `GeoPoint` to `LngLat` via `coords.toLngLat`. Null handles
stay null.

#### `anchorToData(a: BezierAnchor): BezierAnchorData`

The reverse direction — used when the FSM commits a freshly-drawn
bezier into a `LaneEntity` source.

## Behavior

- Pure, synchronous, branch-free apart from the null check.
- `z` is dropped on the runtime side and not synthesised on the way
  back (matches `coords.toGeoPoint` semantics).
- Both functions allocate fresh objects — callers can mutate the
  result without affecting the source.

## Examples

Used in the lane factory to convert FSM-produced anchors into the
storage form (`apolloCompile/factory.ts`):

```ts
import { anchorToData } from '@/core/geometry/anchorConvert';

function buildSourceInfo(d: DrawResult): SourceDrawInfo | undefined {
  if (d.drawTool === 'drawBezier' && d.anchors.length >= 2) {
    return { drawTool: d.drawTool, anchors: d.anchors.map(anchorToData) };
  }
  // ...
}
```

Used by `connectLanes.applyLaneConnection` to translate stored anchors,
then re-sample:

```ts
import { anchorToRuntime } from '@/core/geometry/anchorConvert';

if (source?.drawTool === 'drawBezier' && source.anchors) {
  const anchors = source.anchors.map((a) => ({ ...a }));
  anchors[idx] = shiftAnchor(anchors[idx]!, plan.target);
  const runtime = anchors.map(anchorToRuntime);
  const newPoints = coordsToPoints(cubicBezier(runtime));
  // ...
}
```

## Related

- [Geometry: coords](/api/core/geometry-coords) — `toLngLat` / `toGeoPoint` underneath
- [Geometry: interpolate](/api/core/geometry-interpolate) — `BezierAnchor` and `cubicBezier`
- [Geometry: connectLanes](/api/core/geometry-connect-lanes) — primary consumer of `anchorToRuntime`
- [Apollo compile: factory](/api/core/geometry-apollo-compile) — primary consumer of `anchorToData`
