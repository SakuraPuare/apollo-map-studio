# Rendering Pipeline

The renderer uses MapLibre GL 5 for all map drawing. The editor wires four
named GeoJSON sources and a fixed stack of layers on top of them; React
hooks own the lifecycle of each source.

## Sources

| Source id | Updated by                     | What it carries                                             |
| --------- | ------------------------------ | ----------------------------------------------------------- |
| `cold`    | `useColdLayer` (worker output) | committed entity geometry — lanes, junctions, signals, etc. |
| `hot`     | `useHotLayer` (FSM context)    | live drag preview, selected entity edit handles             |
| `grid`    | `useGridLayer`                 | adaptive grid lines based on `currentZoom`                  |
| `overlay` | `useOverlayLayer`              | snap indicator, helper lines, transient guides              |

All four are populated with empty `FeatureCollection` data at map init and
filled by their hook on the next React effect cycle.

## Layer stack

Layers are added in this order (bottom to top, in
`src/hooks/mapLibreInit/layers.ts`):

1. `grid-line` — minor / major grid
2. `cold-fill` — junction polygons, area polygons, parking polygons
3. `cold-fill-crosswalk` — zebra-stripe pattern fill
4. `cold-fill-cleararea` — red-hatch pattern fill
5. `cold-line` — lane centerlines, road outlines, basic shapes
6. `cold-line-dotted` — boundary segments tagged DOTTED
7. `cold-line-dashed` — boundary segments tagged DASHED
8. `cold-symbol` — lane direction arrows
9. `cold-icon` — signals, stop signs, yield signs, RSUs, barrier gates
10. `overlay-line` — snap helper, connect-mode preview line
11. `hot-fill` — selected polygon highlight
12. `hot-line` — selected polyline highlight
13. `hot-edit-points` — drag handles
14. `hot-bezier-handles` — bezier tangent visualisation

Layer filters are declared once in
`src/components/map/coldLayerConfig.ts` and applied at layer-creation time.
The `useColdLayer` hook adjusts only the selection filter (`buildColdLayerFilter`)
to hide the selected entity from cold rendering when the hot layer takes over.

## MapLibre init

`src/hooks/mapLibreInit/` contains the boot sequence:

| File        | Owns                                                     |
| ----------- | -------------------------------------------------------- |
| `assets.ts` | image registry, sprite registration, `EMPTY_FC` constant |
| `layers.ts` | adds all sources + layers to a fresh map                 |

`useMapLibreInit` (top-level hook in `src/hooks/useMapLibreInit.ts`) is the
orchestrator:

1. Construct `maplibregl.Map` with the no-tiles default style.
2. Install icons via `registerRuntimeImages` (icons are SVGs encoded inline).
3. Add sources + layers via `addAllLayers`.
4. Mark `mapLoadedRef.current = true` once `'load'` fires.
5. Return `mapRef`, `mapLoadedRef` for downstream hooks to subscribe to.

## Hook responsibilities

| Hook               | Trigger                                    | What it writes to                                                     |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `useMapLibreInit`  | on mount                                   | constructs the map, populates `mapRef`                                |
| `useColdLayer`     | `mapStore.entities` change                 | `cold` source via worker                                              |
| `useHotLayer`      | FSM transitions                            | `hot` source synchronously                                            |
| `useGridLayer`     | `currentZoom` change, `gridEnabled` toggle | `grid` source                                                         |
| `useOverlayLayer`  | snap target / connect mode change          | `overlay` source                                                      |
| `useApolloLayer`   | (legacy)                                   | currently a no-op shell, retained for future Apollo-specific overlays |
| `useDragPan`       | map style ready                            | wires MapLibre's drag-pan handlers                                    |
| `useCursorManager` | FSM state                                  | sets the canvas cursor (`crosshair` for draw, `move` for drag, etc.)  |

Each hook reads `mapRef.current` and `mapLoadedRef.current` defensively —
the map is created in the same React tree as the hooks but layers can only
be added once `'load'` fires.

## Apollo layer styling

Apollo entities go through the cold path. The styling decisions live in two
places:

- `src/core/geometry/apolloCompile/features.ts` — emits per-entity GeoJSON
  feature lists with styling hints in `properties` (color, lineWidth,
  lineOpacity, fillOpacity, role).
- `src/hooks/mapLibreInit/layers.ts` — paint expressions read those
  properties (`['get', 'color']`, `['coalesce', ['get', 'lineWidth'], 2]`).

This lets the worker emit features without holding a MapLibre paint
expression — the styling is data-driven from per-feature properties.

::: tip Why properties-driven, not stylesheet-driven?
Properties-driven styling means a single layer can render lanes, roads, and
boundaries with different colors/widths from the same source. Without it,
each entity type would need its own MapLibre layer, multiplying layer count
into the dozens. With ~14 layers we cover every Apollo type.
:::

## Icon registry

`src/lib/mapIcons.ts` declares the icons surfaced as MapLibre symbols (signals
in their various 3-bulb / 2-bulb / mixed orientations, stop signs, yield
signs, RSUs, barrier gates).

Each icon is rendered server-style at boot: an SVG string is rasterized to an
HTMLImageElement and uploaded into MapLibre's image registry via
`map.addImage(name, imageEl)`. The registry is keyed by a string id; cold
features reference icons via `properties.iconId` and the layer expression
resolves it.

`MAP_ICON_PX` (referenced from `layers.ts`) is the rasterization target size
for crisp rendering at typical zoom levels.

## Hot layer selection rendering

When the FSM is in `selected` or `editingPoint`, `useHotLayer`:

1. Reads the selected entity from `mapStore.entities`.
2. Compiles its GeoJSON via `entityRenderCoords` + `entityCoords` (from the
   geometry engine).
3. Adds drag-handle features at each edit point from
   `entityOps.getEditPoints(entity)`.
4. For `editingPoint`, applies the live drag delta via
   `entityOps.setEditPoint(entity, idx, dragCurrentPoint)` and renders the
   _modified_ entity until DRAG_END.

Cold layer simultaneously suppresses the selected entity via filter so the
two don't double-render.

## Grid layer

`useGridLayer` recomputes grid lines whenever zoom changes. Major grid lines
fire every 10 minor lines; the spacing in degrees is `2^-(zoom + offset)`,
chosen so screen-pixel spacing stays approximately constant across zoom.

`uiStore.gridEnabled` toggles layer visibility via
`map.setLayoutProperty('grid-line', 'visibility', enabled ? 'visible' : 'none')`
without re-emitting features.

## Overlay layer

`useOverlayLayer` handles transient visual indicators:

- **Snap indicator**: a small ring at `currentSnapTarget.point` when `uiStore.snapEnabled`
  and the FSM is mid-draw.
- **Connect-mode preview**: a dashed line from the first picked lane's endpoint
  to the cursor, while `uiStore.connectMode.active` and one lane is picked.
- **Validation warning lines**: red strokes for self-intersecting polygons in
  `drawPolygon` state.

The overlay source is rebuilt from scratch on every relevant state change —
the data set is small (typically 1-3 features) and identity caching is not
worth the complexity.

## Map event router

`src/hooks/useMapEventRouter.ts` is the single attachment point for MapLibre
event handlers. It fans events into:

- The FSM (`MOUSE_DOWN`, `MOUSE_MOVE`, `DOUBLE_CLICK`, `MOUSE_UP`).
- The hit-test pipeline (`mapEventRouter/hitTest.ts`).
- The connect-mode handler (`mapEventRouter/connectMode.ts`).
- The selection-drag scheduler (`mapEventRouter/selectionDrag.ts`).
- Input dedup (`mapEventRouter/inputDedup.ts`) — the click-vs-dblclick
  guard that keeps `DOUBLE_CLICK` from eating points (see [FSM Design](./fsm-design.md)).

## Performance levers

| Pressure                     | Mitigation                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Many entities (cold)         | worker offload, decoration cache, COLD_DELTA                                          |
| Many features per entity     | `withPromotedFeatureId` so `updateData({add, remove})` can match by id                |
| Dense layer stack            | layer filters keep each layer stylistically homogeneous                               |
| Selected-entity render fight | cold filter + hot replacement, never double-rendered                                  |
| Symbol density               | `cold-icon` with `iconAllowOverlap`, `iconIgnorePlacement` for non-occluding overlays |

## Related Modules

- `src/components/map/MapCanvas.tsx` — the React component that owns the
  canvas DOM node.
- `src/components/map/coldLayerConfig.ts` — layer ids + filter expressions.
- `src/hooks/mapLibreInit/{assets,layers}.ts` — boot-time setup.
- `src/hooks/mapEventRouter/*.ts` — input event fan-out.

See [Cold / Hot Layers](./cold-hot-layers.md) for the data flow and
[Geometry Engine](./geometry-engine.md) for what the cold features actually
contain.
