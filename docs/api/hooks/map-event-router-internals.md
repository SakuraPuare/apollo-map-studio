# Map Event Router & MapLibre Init Internals

> Source: `src/hooks/mapEventRouter/{connectMode,cursorScheduler,hitTest,inputDedup,keyboard,selectionDrag,snap}.ts` and `src/hooks/mapLibreInit/{assets,layers}.ts`

## Overview

Splitting [`useMapEventRouter`](./use-map-event-router.md) and
[`useMapLibreInit`](./use-map-libre-init.md) into a folder of focused
helpers keeps each function under the ESLint complexity threshold and
makes them independently unit-testable. This page documents each
submodule.

## mapEventRouter/connectMode.ts

Connect-lanes is a non-FSM modal: the user clicks a lane to record it
as the source, clicks another to commit a join. ESC cancels.

```ts
export function handleConnectModeClick(
  actorRef: ActorRefFrom<typeof editorMachine>,
  hitTest: HitTest,
  e: maplibregl.MapMouseEvent,
): boolean;
```

Returns `true` if connect-mode handled the click, signalling
`useMapEventRouter.onClick` to bail. Behavior:

1. If `uiStore.connectMode.active` is false, returns `false`
   immediately.
2. Runs `hitTest(e, t => t === 'lane')` to filter for lane entities.
3. If no lane is hit, no-op.
4. First click: stores the lane id via `setConnectFirstLane`, fires
   `SELECT_ENTITY` for visual feedback.
5. Second click on a different lane: calls
   `planConnection(source, target)` from `core/geometry/connectLanes`,
   then `applyLaneConnection(source, plan)` and writes the result via
   `updateEntity`. On success, exits connect-mode and selects the
   source lane.

Errors during the geometry plan are caught and logged; connect-mode
exits unconditionally on the second click.

## mapEventRouter/cursorScheduler.ts

RAF-coalesced writer for `uiStore.cursorLngLat` so the StatusBar
updates at most 60 fps even if the canvas fires `mousemove` more often.

```ts
export function createCursorScheduler(): {
  schedule(point: LngLat): void;
  dispose(): void;
};
```

`schedule(point)` stashes the latest point; the next animation frame
flushes it via `setCursorLngLat`. `dispose()` cancels the pending RAF
on unmount.

## mapEventRouter/hitTest.ts

Pixel → lng/lat helpers and the worker-backed hit-test wrapper.

```ts
export type HitFilter = (entityType: string) => boolean;

export function toLngLat(e: maplibregl.MapMouseEvent): LngLat;
export function hitBbox(point: maplibregl.PointLike): [maplibregl.PointLike, maplibregl.PointLike];
export function pixelToRadius(map: maplibregl.Map, px: number): number;
export function workerHitTest(
  map: maplibregl.Map,
  bridge: SpatialWorkerBridge | null,
  e: maplibregl.MapMouseEvent,
  filter?: HitFilter,
): Promise<string | null>;
```

`pixelToRadius` converts a pixel hit radius into the worker's geo
units (degrees) via `(px * 360) / (512 * 2^zoom)`. The worker's RBush
tree expects geo coordinates, so we cannot send pixel radii directly.

`workerHitTest` posts `{ type: 'HIT_TEST', point, radius }`, takes the
first hit by default or the first `filter`-matching hit, and returns
its entity id (or `null`).

`hitBbox(point)` returns a 8×8px bbox tuple suitable for
`map.queryRenderedFeatures` — used to pick `hot-points` / `hot-fill`
under the cursor for selection drag.

## mapEventRouter/inputDedup.ts

Deduplication of native dblclick double-fires.

```ts
export type InputSample = { x: number; y: number; ts: number };

export function sampleInput(e: maplibregl.MapMouseEvent): InputSample;
export function isDuplicateInput(prev: InputSample | null, next: InputSample): boolean;
```

```ts
const DBLCLICK_PX_TOLERANCE = 4;
const DBLCLICK_MS_WINDOW = 350;
```

Two samples are duplicates if they're within 4 pixels and 350 ms.
That window matches the OS-level double-click threshold while staying
short enough to not absorb legitimate fast-clicking.

## mapEventRouter/keyboard.ts

```ts
export function handleMapKeyDown(
  actorRef: ActorRefFrom<typeof editorMachine>,
  e: KeyboardEvent,
  clearCenterGrabOffset: () => void,
): void;
```

Map-scoped keyboard handling, separate from the global
`useActionDispatcher` shortcut binder:

| Key                                    | Action                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Escape`                               | Clear `centerGrabOffset`; exit connect-mode if active; FSM `CANCEL`                                                                    |
| `Enter`                                | FSM `CONFIRM`                                                                                                                          |
| `Delete` / `Backspace` (on `selected`) | If `dragPointType === 'vertex'` and idx ≥ 0, delete that vertex via `entityMutations.deleteVertex`. Otherwise delete the whole entity. |

The vertex delete path returns `null` from `deleteVertex` when the
remaining vertex count would drop below the geometry minimum
(polyline < 2, polygon < 3, etc.); in that case it falls through and
deletes the entire entity.

## mapEventRouter/selectionDrag.ts

Ownership of the `mousedown` decision tree while in `selected` state.

```ts
export interface SelectedMouseDownResult {
  handled: boolean;
  centerGrabOffset?: [number, number] | null;
}

export function handleSelectedMouseDown(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  e: maplibregl.MapMouseEvent,
): SelectedMouseDownResult;
```

Decision tree:

1. Not in `selected` state, or connect-mode active → not handled.
2. Mouse over a `hot-points` feature:
   - Alt+click on a `vertex` → `toggleEntitySmooth` + FSM
     `TOGGLE_SMOOTH`. Handled, no drag.
   - Otherwise disable dragPan, fire `START_DRAG` with the vertex /
     handle index. Handled.
3. Mouse over `hot-fill`:
   - Compute `centerGrabOffset = cursor - entity.center`.
   - Disable dragPan, fire `START_DRAG { index: -2, pointType: 'center' }`.
   - Return the offset so the router can apply it to subsequent
     mousemove points.
4. Otherwise → not handled (router falls through to plain click-to-deselect).

`toggleEntitySmooth` dispatches to the appropriate
`entityMutations.toggleSmooth*` for drawing-primitive vs. Apollo
bezier source entities.

## mapEventRouter/snap.ts

```ts
export function applySnap(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  lngLat: LngLat,
  excludeId?: string | null,
): LngLat;
```

Decision flow:

1. If `uiStore.snapEnabled` is false, or FSM state isn't a draw or
   `editingPoint` state, clear any active snap target and return the
   raw `lngLat`.
2. Compute `radiusM = pixelsToMeters(SNAP_RADIUS_PX, lat, zoom)` —
   converts pixel radius into geographic meters at the cursor's
   latitude.
3. Run `findSnapTarget({ x, y }, entities.values(), radiusM, excludeId)`
   from `core/geometry/snap`.
4. Update `uiStore.currentSnapTarget` (the indicator layer reacts).
5. Return the snapped point if found, raw point otherwise.

`excludeId` keeps a vertex from snapping back onto its own entity
during drag.

## mapLibreInit/assets.ts

```ts
export const EMPTY_FC: GeoJSON.FeatureCollection;
export const DARK_STYLE: maplibregl.StyleSpecification;
export function registerRuntimeImages(map: maplibregl.Map): void;
```

`DARK_STYLE` is the inline base style — single `#1a1a2e` background,
no tiles. `glyphs` points at MapLibre's demo glyph server for symbol
labels.

`registerRuntimeImages` paints a few small images directly into the
map's image atlas:

- `zebra-stripe` — 16×16 procedural horizontal stripes, used for
  crosswalk fills.
- `red-hatch` — 12×12 procedural diagonal stripes, used for clear-area
  fills.
- `lane-arrow` — 20×20 SDF arrow drawn on a `<canvas>`. Registered with
  `{ sdf: true }` so the symbol layer can re-color it.
- `registerMapIcons(map)` — async install of all action / element
  icons from `@/lib/mapIcons` (Apollo entity glyphs).

## mapLibreInit/layers.ts

```ts
export function addEditorLayers(map: maplibregl.Map): void;
```

The dispatcher: calls the private `addGridLayer`, `addColdLayers`,
`addHotLayers`, `addOverlayLayers`, `addSnapLayers` in fixed order.
Each helper adds one source plus a small set of layers consuming that
source. Filters come from `coldLayerConfig.COLD_LAYER_FILTERS` for the
cold layers; hot/overlay/snap inline their filters.

Notable layer paint expressions:

- **`cold-fill-crosswalk`**: `'fill-pattern': 'zebra-stripe'`,
  `'fill-opacity': 0.8`.
- **`cold-fill-cleararea`**: `'fill-pattern': 'red-hatch'`,
  `'fill-opacity': 0.7`.
- **`cold-line-dotted`**: `'line-dasharray': [0.01, 2.2]`, `line-cap:
round` — hairline dotted style for lane center virtual segments.
- **`cold-line-dashed`**: `'line-dasharray': [3, 3]`.
- **`cold-labels`**: symbol layer driven by `properties.icon`,
  `properties.iconRotate` (signal labels rotate to face oncoming
  traffic — Dreamview parity).
- **`cold-lane-arrows`**: `symbol-placement: line`, spacing tied to
  `settingsStore.laneArrowSpacing`.
- **`hot-line`**: case-driven `line-dasharray`/`line-color` based on
  `properties.role` to distinguish handle lines from main geometry.
- **`snap-ring` / `snap-dot`**: color-coded by `properties.kind`
  (`vertex` cyan, `edge` darker cyan).

## Examples

### Loading layers from a non-init code path

```ts
import { addEditorLayers } from '@/hooks/mapLibreInit/layers';
addEditorLayers(map); // safe to call multiple times — each helper checks for existing source/layer
```

In practice no other code path needs this — `useMapLibreInit` is the
single caller.

### Manually testing snap

```ts
import { applySnap } from '@/hooks/mapEventRouter/snap';

const snapped = applySnap(map, actorRef, [lng, lat], excludeId);
```

Only meaningful while the FSM is in a draw or `editingPoint` state —
otherwise it returns `lngLat` unchanged.

## Related

- [useMapEventRouter](/api/hooks/use-map-event-router)
- [useMapLibreInit](/api/hooks/use-map-libre-init)
- [Geometry: snap](/api/core/geometry-snap)
- [coldLayerConfig](/api/components/map-canvas)
- [Spatial worker bridge](/api/core/spatial-bridge)
