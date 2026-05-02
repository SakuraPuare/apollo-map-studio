# Rendering Pipeline

Apollo Map Studio renders through MapLibre GL, but the render path is not a
single React component that rebuilds all GeoJSON on every edit. The current
pipeline is split into three visual lanes:

1. **Cold layer**: committed entities in `mapStore.entities`.
2. **Hot layer**: the selected entity and in-flight drag preview.
3. **Overlay layer**: draft drawing, snap indicator, grid and helper geometry.

`src/components/map/MapCanvas.tsx` is the composition point. It creates the
`SpatialWorkerBridge`, initializes MapLibre, then mounts the hooks that own
each part of the pipeline:

```ts
useMapLibreInit(containerRef);
useDrawCommit(actorRef);
useMapEventRouter(mapRef, actorRef, bridgeRef);
useOverlayLayer(mapRef, mapLoadedRef, actorRef);
useColdLayer(mapRef, mapLoadedRef, actorRef, bridgeRef);
useHotLayer(mapRef, mapLoadedRef, actorRef);
useGridLayer(mapRef, mapLoadedRef);
useApolloLayer(mapRef, mapLoadedRef);
useCursorManager(mapRef, actorRef);
useDragPan(mapRef, actorRef);
```

## Map Initialization

`useMapLibreInit` creates a MapLibre map with a self-contained dark style:

```ts
const DARK_STYLE = {
  version: 8,
  name: 'dark-blank',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1a1a2e' } }],
};
```

The initial center and zoom come from `settingsStore` readers, not from React
state. On `load`, `addEditorLayers(map)` registers all runtime images, sources
and layers. `laneArrowSpacing` is the one layout property that updates from
settings after load.

## Runtime Images

`src/hooks/mapLibreInit/assets.ts` registers images at runtime:

| Image id       | Source                           | Used by                                              |
| -------------- | -------------------------------- | ---------------------------------------------------- |
| `zebra-stripe` | generated RGBA stripe pattern    | crosswalk fill                                       |
| `red-hatch`    | generated diagonal hatch pattern | clear area fill                                      |
| `lane-arrow`   | generated SDF triangle           | lane direction arrows                                |
| map icons      | `registerMapIcons(map)`          | signal, stop sign, parking, barrier and other labels |

No external sprite sheet is required. The only networked style asset is the
MapLibre glyph endpoint used for symbol text support.

## Sources And Layers

The current renderer uses a small number of shared sources:

| Source    | Owner hook        | Payload                                                 |
| --------- | ----------------- | ------------------------------------------------------- |
| `cold`    | `useColdLayer`    | committed entity features generated in `spatial.worker` |
| `hot`     | `useHotLayer`     | selected entity edit handles and drag preview           |
| `overlay` | `useOverlayLayer` | draft drawing and helper handles                        |
| `snap`    | `useOverlayLayer` | current snap target ring/dot                            |
| `grid`    | `useGridLayer`    | viewport grid line features                             |

The cold source fans out into fill, line, dotted line, dashed line, label and
lane-arrow layers. Layer filters are centralized in
`src/components/map/coldLayerConfig.ts`; selection filters are updated by
`useColdLayer` so the cold layer does not draw the selected entity under the
hot edit handles.

## Cold Layer

The cold path is optimized for large Apollo maps:

```text
mapStore.entities
  -> useColdLayer diffEntities()
  -> SpatialWorkerBridge SYNC / INCREMENTAL
  -> spatial.worker feature cache
  -> COLD_READY / COLD_DELTA
  -> GeoJSONSource.setData / updateData
```

Important details:

- Initial render sends a full `SYNC`.
- Full sync payloads larger than 2,000 entities are chunked as
  `SYNC_BEGIN` / `SYNC_CHUNK` / `SYNC_FINISH`.
- Incremental edits send only `added`, `updated` and `removed`.
- Worker responses use `EntityFeatureGroup[]`, keyed by entity id.
- The main thread keeps a per-entity feature cache and applies `updateData`
  diffs when possible.
- If more than 5,000 entities changed at once, `useColdLayer` falls back to a
  full worker sync.
- Cold source updates are chunked in 4,000-feature batches to keep MapLibre
  responsive.

`spatial.worker` also owns a lane endpoint graph and a boundary-decoration
cache. When a lane endpoint changes, only the lane and lanes sharing its
endpoint have junction boundary decoration refreshed.

## Hot Layer

The hot layer is the selected entity overlay. It renders from the FSM context,
not from a worker:

- `selectedEntityId`
- `dragPointIndex`
- `dragPointType`
- `dragCurrentPoint`
- `dragAltKey`

During a drag, `useHotLayer` applies `applyDrag()` to a display copy so the
user sees the final geometry before `mapStore.updateEntity()` commits on
mouse up. `sameHotRenderState()` skips redundant renders when neither the
selected entity reference nor the drag state changed.

## Overlay, Snap And Grid

The overlay source renders draft geometry from the editor FSM. It covers:

- polyline, Bezier, arc, rectangle and polygon drafts;
- Bezier handles and handle lines;
- selected snap indicator;
- drawing helper points before a real entity exists.

Snap state lives in `uiStore.currentSnapTarget`. `setSnapTarget()` deduplicates
equal targets because mousemove can run at pointer frequency. When snap is
toggled off, `useMapEventRouter` clears the target immediately so the ring does
not linger until the next mousemove.

The grid source is separate because it is view-derived, not entity-derived.
It reacts to `gridEnabled`, zoom and current viewport.

## Event Routing

`useMapEventRouter` is the bridge between MapLibre input and the XState editor
machine:

- mouse down starts Bezier drawing or selected-entity drag;
- click selects entities or adds draw points;
- double-click confirms drawing;
- mouse move updates cursor state, snap target and hot draft points;
- mouse up commits drag edits to `mapStore`;
- keydown routes Escape, Enter and Delete;
- connect mode intercepts lane clicks before normal selection.

Hit testing is worker-backed through `SpatialWorkerBridge` and uses an RBush
index. The worker sorts hits by pick tier so small symbols beat large polygons
under them.

## Performance Rules

- Keep committed feature generation inside `core/workers`.
- Keep in-flight edits in `hot` / `overlay`; do not wait for worker round-trips
  to preview a drag.
- Use entity identity changes as the diff signal. Mutating an entity object in
  place without changing the reference will bypass cold-layer updates.
- Prefer `GeoJSONSource.updateData` for deltas and reserve `setData` for empty
  resets or large full rebuilds.
- Keep render-specific constants out of domain modules unless they are pure
  constants; `coldLayerConfig.ts` is the current render filter authority.

## Tests

Relevant tests:

- `src/hooks/__tests__/useColdLayer.test.ts`
- `src/hooks/__tests__/useHotLayer.test.ts`
- `src/hooks/__tests__/useOverlayLayer.test.ts`
- `src/hooks/__tests__/useGridLayer.test.ts`
- `src/hooks/__tests__/useMapEventRouter.test.ts`
- `src/core/workers/__tests__/spatial.worker.test.ts`
- `src/core/workers/__tests__/laneJunctionGraph.test.ts`
