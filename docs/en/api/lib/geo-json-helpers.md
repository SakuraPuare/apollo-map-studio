---
title: geoJsonHelpers — hot-layer GeoJSON compiler
description: Converts a MapEntity (with edit handles / control points) to GeoJSON features for the hot layer; ships small line/point/polygon factories.
---

# `geoJsonHelpers` — hot-layer GeoJSON compiler

> Source: `src/lib/geoJsonHelpers.ts` · 186 lines · pure functions

## Purpose

The map stack has two layers:

- **Cold** — committed entities, compiled in the spatial worker (`src/core/workers/spatial.worker.ts`) and cached.
- **Hot** — the live overlay for entities being drawn / dragged / selected (rubber bands, edit handles, bezier control arms).

`geoJsonHelpers` compiles the hot layer. Given a `MapEntity` (in-flight draw, or a committed entity that the user has selected), it returns a list of GeoJSON Features that maplibre can `setData` directly. There is no caching — every animation frame recomputes from scratch, because the entity is changing every frame anyway.

It handles two kinds of input:

1. **Drawing primitives** (polyline / catmullRom / bezier / arc / rect / polygon) — corresponds to the FSM's in-flight draw.
2. **Apollo entities in edit mode** — recovers the original draw tool from `_source` / `_sourceRect` and edits with the same handles used during creation.

## Public API

| Symbol                | Kind | Signature                                  | Summary                                |
| --------------------- | ---- | ------------------------------------------ | -------------------------------------- |
| `lineFeature`         | fn   | `(coords, props?) => GeoJSON.Feature`      | LineString factory                     |
| `pointFeature`        | fn   | `(coord, role, props?) => GeoJSON.Feature` | Point factory; `role` drives style     |
| `handleLineFeature`   | fn   | `(from, to) => GeoJSON.Feature`            | Dashed handle line (anchor → handle)   |
| `polygonFeature`      | fn   | `(coords, props?) => GeoJSON.Feature`      | Polygon factory; auto-closes ring      |
| `entityToHotFeatures` | fn   | `(entity: MapEntity) => GeoJSON.Feature[]` | **Core** — entity → hot-layer features |

## Detailed entries

### `lineFeature(coords, props?)`

```ts
export function lineFeature(coords: LngLat[], props = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'LineString', coordinates: coords },
  };
}
```

Minimal skeleton. `props` is shallow-cloned so the caller cannot mutate it later.

### `pointFeature(coord, role, props?)`

```ts
export function pointFeature(coord: LngLat, role: string, props = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role, ...props },
    geometry: { type: 'Point', coordinates: coord },
  };
}
```

`role` drives a maplibre layer filter:

| `role`   | Renders as                      |
| -------- | ------------------------------- |
| `vertex` | Filled circle, draggable        |
| `handle` | Hollow circle (bezier / rotate) |

`props` typically carries `index` and `handleType` (`'handleIn'` / `'handleOut'` / `'rotate'`).

### `handleLineFeature(from, to)`

```ts
{
  type: 'Feature',
  properties: { role: 'handleLine' },
  geometry: { type: 'LineString', coordinates: [from, to] },
}
```

The dashed line that connects a bezier anchor to one of its handles. The maplibre layer renders `role: 'handleLine'` with `dasharray`.

### `polygonFeature(coords, props?)`

```ts
const ring =
  first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...coords, first] : coords;
return {
  type: 'Feature',
  properties: { ...props },
  geometry: { type: 'Polygon', coordinates: [ring] },
};
```

**Auto-closes** — if the first and last coords differ, the first is appended to satisfy GeoJSON's closed-LinearRing requirement. Saves callers from repeating the closure logic.

### `entityToHotFeatures(entity)` — main function

Branches on `entityType`:

#### Polyline / catmullRom

```ts
features.push(lineFeature(coords)); // main line
coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
```

`catmullRom` runs `catmullRom(coords)` to produce a smooth curve while keeping the discrete control points as vertices.

#### Bezier

```ts
features.push(lineFeature(cubicBezier(anchors)));
anchors.forEach((a, i) => {
  features.push(pointFeature(a.point, 'vertex', { index: i }));
  if (a.handleIn) {
    features.push(handleLineFeature(a.point, a.handleIn));
    features.push(pointFeature(a.handleIn, 'handle', { index: i, handleType: 'handleIn' }));
  }
  if (a.handleOut) {
    features.push(handleLineFeature(a.point, a.handleOut));
    features.push(pointFeature(a.handleOut, 'handle', { index: i, handleType: 'handleOut' }));
  }
});
```

Per anchor: 1 vertex + 0/1 handleIn (point + line) + 0/1 handleOut (point + line).

#### Arc (three points)

```ts
features.push(lineFeature(threePointArc(p1, p2, p3)));
features.push(pointFeature(p1, 'vertex', { index: 0 }));
features.push(pointFeature(p2, 'vertex', { index: 1 }));
features.push(pointFeature(p3, 'vertex', { index: 2 }));
```

Three points uniquely define a circle arc; `threePointArc` lives in `core/geometry/interpolate`.

#### Rect (with rotation)

```ts
const corners = rectCorners(p1, p2, entity.rotation);
features.push(polygonFeature(corners));
for (let i = 0; i < 4; i++) {
  features.push(pointFeature(corners[i], 'vertex', { index: i }));
}
const center = [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2];
const handle = rectRotateHandle(p1, p2, entity.rotation);
features.push(handleLineFeature(center, handle));
features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
```

Renders the 4 corners + a rotation handle (centre → handle dashed line + handle dot).

#### Polygon

Same shape as polyline but builds a Polygon and auto-closes.

#### Apollo entities (fallback)

Discovers the original draw tool from `_source` / `_sourceRect`:

1. **`source.drawTool === 'drawBezier'`** → bezier branch using `source.anchors`.
2. **`source.drawTool === 'drawArc'`** → arc branch using `source.arcPoints`.
3. **`sourceRect`** → rect branch.
4. **Generic fallback** via `getEditPoints(apolloEntity)`:
   - `isPolygonEditEntity(e)` → `polygonFeature` (rect / polygon / junction / area / …)
   - else → `lineFeature` (lane centerline, signal stopLine, …)
   - Each editPoint also gets a vertex feature.

Generic fallback code:

```ts
const editPoints = getEditPoints(apolloEntity);
const coords = editPoints.map((p) => [p.x, p.y] as LngLat);

if (coords.length >= 2) {
  if (isPolygonEditEntity(apolloEntity)) {
    features.push(polygonFeature(coords));
  } else {
    features.push(lineFeature(coords));
  }
}
coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
```

Why `isPolygonEditEntity` rather than `isAreaEntity`? A `lane` _is_ an area for hitTest purposes, but its editPoints are a centre line (open polyline), not a closed boundary. Using `polygonFeature` would close the rubber band into an unwanted polygon. `isPolygonEditEntity` separates "geometry shape closed vs open" from "is a region in the spatial sense".

Source: `geoJsonHelpers.ts:166-179`.

## Performance notes

- No caching — recomputed every animation frame.
- One call typically yields 5–30 features (linear in vertex count).
- The dominant cost is bezier / arc interpolation (~0.1 ms / frame).
- Callers must invoke this only on _changing_ entities — committed entities go through the cold layer / worker path.

## Side effects

- **None.** Pure functions.
- No store reads, no console writes.

## Test coverage

`src/lib/__tests__/geoJsonHelpers.test.ts`:

- Per-entity-type feature counts / roles / indices
- `polygonFeature` auto-closure
- Apollo lane fallback uses `lineFeature` (not `polygonFeature`)
- Bezier handleIn/handleOut absence cases

## Consumers

- `src/hooks/useHotLayer.ts` — calls `entityToHotFeatures(currentEntity)` per RAF, `setData`s the result
- Only direct consumer; the small factories (`lineFeature` etc.) are internal helpers

## Source map

| Lines   | Content                     |
| ------- | --------------------------- |
| 1–14    | imports                     |
| 16–25   | `lineFeature`               |
| 27–37   | `pointFeature`              |
| 39–45   | `handleLineFeature`         |
| 47–60   | `polygonFeature`            |
| 62      | `entityToHotFeatures` jsdoc |
| 65–70   | polyline / catmullRom       |
| 71–87   | bezier                      |
| 87–95   | arc                         |
| 95–106  | rect                        |
| 107–110 | polygon                     |
| 111–183 | Apollo entity fallback      |

## See also

- `core/geometry/interpolate` — `catmullRom` / `cubicBezier` / `threePointArc` / `rectCorners`
- `core/geometry/coords` — `pointsToCoords` / `toLngLat`
- `core/geometry/anchorConvert` — `anchorToRuntime` (persisted → runtime `BezierAnchor`)
- [`entityOps`](./entity-ops.md) — `getEditPoints` / `isPolygonEditEntity`
- `src/hooks/useHotLayer` — sole real consumer
