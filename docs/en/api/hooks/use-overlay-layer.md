---
title: useOverlayLayer
description: Projects the drawing FSM state (drawPolyline / drawCatmullRom / drawBezier / drawArc / drawRotatedRect / drawPolygon) onto the yellow-dashed overlay source, with a sibling snap-indicator subscription.
---

# useOverlayLayer

> Source: `src/hooks/useOverlayLayer.ts`

`useOverlayLayer` is the drawing-state visualization layer. It reads the
FSM's current state value (`drawPolyline` / `drawCatmullRom` /
`drawBezier` / `drawArc` / `drawRotatedRect` / `drawPolygon`) plus
context (`drawPoints` / `previewPoint` / `bezierAnchors`) and renders
the per-state preview geometry into the `overlay` GeoJSON source
(yellow dashed lines + vertices + control handles).

The same file also exports `useSnapIndicatorLayer` (private). It
subscribes to `useUIStore.currentSnapTarget` and paints the snap ring
into the `snap` source. Together they cover every "floating UI" element
during drawing.

## Source boundaries

| Source    | Contents                                                 | Writer                                  |
| --------- | -------------------------------------------------------- | --------------------------------------- |
| `cold`    | All committed entities                                   | `useColdLayer` (worker)                 |
| `hot`     | Currently selected entity + drag preview                 | `useHotLayer`                           |
| `overlay` | In-progress draft geometry (drawPoints / bezier anchors) | `useOverlayLayer`                       |
| `snap`    | Snap indicator                                           | `useOverlayLayer.useSnapIndicatorLayer` |
| `grid`    | Metric reference grid                                    | `useGridLayer`                          |

Colour codes: cold uses ams-\* primary; hot is blue; overlay is yellow
dashed; snap is cyan ring.

## Why split this way

- Drawing feedback is pure front-end with zero worker round-trip; each
  builder function is under 30 lines and covers one geometry shape.
- State switching → builder dispatch via `OVERLAY_BUILDERS`; adding a
  new geometry means registering one entry.
- The snap indicator is decoupled from drawing feedback: it must render
  during vertex drag too, so it owns its own source.

## Entering / exiting isDrawingState

The `isDrawingState` set (`editorMachine.ts`) covers: `drawPolyline` /
`drawCatmullRom` / `drawBezier` / `drawArc` / `drawRotatedRect` /
`drawPolygon`. FSM enters them via:

- `SELECT_TOOL` event carrying `tool: 'drawXxx'` — ToolStrip click
- `idle → drawXxx` only through `SELECT_TOOL`

Exit:

- `CONFIRM` / `DOUBLE_CLICK` → `idle`
- `CANCEL` → `idle` (resetDraw clears drawPoints)
- `SELECT_TOOL` to a sibling draw tool → directly into the target
  draw state

## Signature

```ts
function useOverlayLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
): void;
```

## Parameters

| Name           | Type                                 | Role                                           |
| -------------- | ------------------------------------ | ---------------------------------------------- |
| `mapRef`       | `RefObject<maplibregl.Map \| null>`  | MapLibre instance.                             |
| `mapLoadedRef` | `RefObject<boolean>`                 | Readiness flag.                                |
| `actorRef`     | `ActorRefFrom<typeof editorMachine>` | FSM actor; subscribed to drive the RAF render. |

## Returns

`void`. Effects target both `overlay` and `snap` sources.

## `OverlayRenderState`

```ts
export type OverlayRenderState = {
  currentState: string; // FSM value
  drawPoints: LngLat[]; // confirmed points
  previewPoint: LngLat | null; // cursor-following preview
  bezierAnchors: BezierAnchor[]; // drawBezier only
};
```

## Builder table

```ts
// useOverlayLayer.ts:157-164
const OVERLAY_BUILDERS: Record<string, OverlayBuilder> = {
  drawPolyline: buildPolylineFeatures,
  drawCatmullRom: buildCatmullRomFeatures,
  drawBezier: buildBezierFeatures,
  drawArc: buildArcFeatures,
  drawRotatedRect: buildRotatedRectFeatures,
  drawPolygon: buildPolygonFeatures,
};
```

| State             | Preview geometry                                     | Trigger                          |
| ----------------- | ---------------------------------------------------- | -------------------------------- |
| `drawPolyline`    | line chain + vertices                                | `allPts.length >= 2`             |
| `drawCatmullRom`  | Catmull-Rom curve + vertices                         | `allPts.length >= 2`             |
| `drawBezier`      | cubic bezier curve + handle dashes + control handles | `withPreviewAnchors.length >= 2` |
| `drawArc`         | 3-point arc (2 points draws straight line)           | `allPts.length === 3`            |
| `drawRotatedRect` | rotated rectangle + axis preview                     | `allPts.length === 3`            |
| `drawPolygon`     | closed polygon (< 3 pts shows line)                  | `allPts.length >= 3`             |

## Side effects

| Effect                                      | Trigger                                               | Cleanup                         |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| `actorRef.subscribe(scheduleRender)`        | Mount                                                 | `subscription.unsubscribe()`    |
| `requestAnimationFrame(renderOverlayLayer)` | Actor state change                                    | `cancelAnimationFrame(frameId)` |
| `src.setData(...)`                          | Render fires + `sameOverlayRenderState` returns false | —                               |
| `useUIStore.subscribe(currentSnapTarget)`   | `useSnapIndicatorLayer` mount                         | Returned unsub                  |
| `snap` source write                         | Snap target changes                                   | —                               |

## Lifecycle

```
mount (overlay)
  ├── subscribe(actorRef) → scheduleRender
  └── if mapLoaded: scheduleRender() else: map.once('load', scheduleRender)

renderOverlayLayer (RAF)
  ├── snapshot → OverlayRenderState
  ├── if sameOverlayRenderState(last, next): return
  ├── if !isDrawingState(currentState): setData(EMPTY_FC); return
  └── setData(buildOverlayFeatures(state))

mount (snap indicator)
  ├── apply current currentSnapTarget once
  └── subscribe(useUIStore) → apply only on currentSnapTarget change
```

## Invariants

### Only write overlay during drawing states

```ts
// useOverlayLayer.ts:249-252
if (!isDrawingState(nextState.currentState)) {
  src.setData(EMPTY_FC);
  return;
}
```

Switching back to `idle` / `selected` clears immediately, killing
preview leftovers from the previous draw.

### Bezier preview must clone anchors

```ts
// useOverlayLayer.ts:101
const runtimeAnchors: BezierAnchor[] = bezierAnchors.map((anchor) => ({ ...anchor }));
```

The transient preview anchor pushed during drawing must not mutate the
FSM context (XState 5 does not auto-freeze).

### Snap target dedup happens in the store

```ts
// useOverlayLayer.ts:208-212
const unsub = useUIStore.subscribe((s, prev) => {
  if (s.currentSnapTarget !== prev.currentSnapTarget) {
    apply(s.currentSnapTarget);
  }
});
```

`uiStore.setSnapTarget` already de-dups equivalent SnapTarget values
internally (see store docs); reference comparison here is sufficient.

## Call site

```tsx
// src/components/map/MapCanvas.tsx:37
useOverlayLayer(mapRef, mapLoadedRef, actorRef);
```

`MapCanvas` also writes `uiStore.currentSnapTarget` from
`useMapEventRouter` (`applySnap`), so overlay + snap indicator stay in
sync inside this single mount.

## Failure modes

| Symptom                                 | Root cause                                           | Fix                                                                          |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Preview doesn't refresh                 | `OVERLAY_BUILDERS` missing the state                 | Register the new state in `OVERLAY_BUILDERS`                                 |
| Bezier handles overlap                  | `bezierAnchorFeatures` skipped in/out distinction    | Lines 80-94 — confirm both `handleIn` and `handleOut` produce `pointFeature` |
| Old line lingers after switching tool   | `isDrawingState` doesn't include the new state       | Update the set in `editorMachine.ts`                                         |
| Snap ring stays after toggling snap off | `useMapEventRouter`'s store subscription didn't fire | See router lines 215-219 for the cleanup path                                |

## See also

- [Editor Machine drawing states](../core/editor-machine.md)
- [`useDrawCommit`](./use-draw-commit.md)
- [Geometry interpolate](../core/geometry-interpolate.md)
- [`uiStore.currentSnapTarget`](../store/store-ui.md)

## Frame budget

- All builders are O(n) where n is the current confirmed point count
  (typically < 20 mid-draw).
- `cubicBezier` and `catmullRom` use fixed sample counts (24/segment),
  independent of zoom level.
- The snap indicator is a single Point feature; setData cost is
  negligible.

## Snap indicator details

```ts
// useOverlayLayer.ts:171-186
function snapTargetFeatureCollection(target: SnapTarget): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: target.kind, entityId: target.entityId, entityType: target.entityType },
        geometry: { type: 'Point', coordinates: [target.point.x, target.point.y] },
      },
    ],
  };
}
```

- `kind: 'vertex' | 'edge'` — `mapLibreInit/layers.ts:248-256` uses a
  `match` expression to colour vertex vs edge differently.
- `entityType` is debug-only and doesn't affect style.

## Relationship with useDrawCommit

`useOverlayLayer` only reads FSM context for preview; persistence is
handled by [`useDrawCommit`](./use-draw-commit.md). They don't
interfere:

```
during draw: FSM + drawPoints → useOverlayLayer renders preview
↓ DOUBLE_CLICK / Enter
FSM transition → idle: useDrawCommit calls addEntity (POST snapshot)
↓
useOverlayLayer sees !isDrawingState → setData(EMPTY_FC) clears preview
useColdLayer sees entities change → writes to cold source
```

## Source map

| Concern                          | Lines                        |
| -------------------------------- | ---------------------------- |
| `OverlayRenderState` type        | `useOverlayLayer.ts:21-26`   |
| `sameOverlayRenderState`         | `useOverlayLayer.ts:34-42`   |
| `withPreview` / `vertexFeatures` | `useOverlayLayer.ts:50-56`   |
| `buildPolylineFeatures`          | `useOverlayLayer.ts:58-67`   |
| `buildCatmullRomFeatures`        | `useOverlayLayer.ts:69-78`   |
| `buildBezierFeatures`            | `useOverlayLayer.ts:96-115`  |
| `buildArcFeatures`               | `useOverlayLayer.ts:117-126` |
| `buildRotatedRectFeatures`       | `useOverlayLayer.ts:128-144` |
| `buildPolygonFeatures`           | `useOverlayLayer.ts:146-155` |
| `OVERLAY_BUILDERS` dispatch      | `useOverlayLayer.ts:157-164` |
| `useSnapIndicatorLayer`          | `useOverlayLayer.ts:188-217` |
| `useOverlayLayer` main           | `useOverlayLayer.ts:219-285` |
