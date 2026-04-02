# Viewport Culling Design

## Problem

With 50K+ lanes, sending all features to MapLibre GeoJSON sources is expensive. Even though MapLibre tiles internally, the `setData()`/`updateData()` cost scales with total feature count. We need application-level viewport culling: only features within the current viewport (+ padding) are present in MapLibre sources.

## Approach

RBush spatial index over all map elements. On viewport change or data mutation, query the index for visible elements, diff against the previous visible set, and use `updateData()` to incrementally add/remove features entering/leaving the viewport.

## Architecture

### New module: `src/map/viewportCuller.ts`

Single module that owns:

- A global RBush index of all element bboxes
- The current visible set (`Set<string>` of element IDs per source)
- The sole authority to write to MapLibre GeoJSON sources (replaces `updateBoundaryLayers`, `updateElementLayers`, and `sourceDiffEngine` as source update paths)

### Index entry

```typescript
interface SpatialEntry {
  minX: number
  minY: number
  maxX: number
  maxY: number
  id: string
  elementType:
    | 'lane'
    | 'junction'
    | 'crosswalk'
    | 'signal'
    | 'stop_sign'
    | 'clear_area'
    | 'speed_bump'
    | 'parking_space'
}
```

One entry per element. Lane bbox is derived from the cached boundary polygon. Other elements use their polygon/linestring coordinates (reuse `buildBBox` from `overlapCalc.ts`).

### Index lifecycle

| Event                           | Operation                                  |
| ------------------------------- | ------------------------------------------ |
| Import complete                 | `rbush.load(allEntries)` — bulk build      |
| Add element                     | `rbush.insert(entry)`                      |
| Edit element (geometry changed) | `rbush.remove(old)` + `rbush.insert(new)`  |
| Delete element                  | `rbush.remove(entry)`                      |
| Clear / re-import               | `rbush.clear()` + `rbush.load(newEntries)` |

The index is maintained incrementally by listening to store changes and diffing per-element references (same Immer identity pattern used elsewhere).

### Viewport query

```typescript
function syncViewport(map: MapLibreMap): void
```

Called on:

1. `moveend` — user panned/zoomed
2. After any store data mutation (via the existing `renderData` subscription)

Steps:

1. `map.getBounds()` → expand by 50% of viewport width/height on each side (query area = 2x viewport in each dimension)
2. `rbush.search(paddedBounds)` → list of `SpatialEntry` in viewport
3. Diff against `_visibleIds` (per-source `Set<string>` from last sync):
   - **Entering** (in query result but not in `_visibleIds`): build GeoJSON features, `updateData({ add })`
   - **Leaving** (in `_visibleIds` but not in query result): `updateData({ remove })`
   - **Unchanged**: skip
4. Update `_visibleIds`
5. `reapplySelectionState()` for sources that changed

### Feature building

`syncViewport` needs to convert elements to GeoJSON features for MapLibre. For lanes, each lane produces features in 5 sources (fills, centers, boundaries, arrows, connections). The existing `buildLaneFeaturesInto()` helper is reused.

For other elements, the `toFeature` lambdas from the current `updateElementLayers` are reused.

### Connections

Lane connections (successor links) span two lanes. A connection is visible if either the source or target lane is visible. When building visible connections, iterate visible lanes' `successorIds` and also check if any visible lane is a target of an off-screen lane. For simplicity, connections are rebuilt fully for all visible lanes on each sync (they are lightweight — just 2-coordinate linestrings).

### Selected elements

Elements that are currently selected (via `useUIStore.selectedIds`) are always included in the visible set, even if outside the viewport. This preserves their `feature-state` for selection highlighting. When selection changes, the newly selected element is added to sources if not already visible.

### Progressive initial load

On first import (50K+ elements):

1. Build RBush index from all elements (async chunked, ~50ms)
2. Query initial viewport
3. Only load visible features into sources (few hundred to few thousand)
4. Map is interactive almost immediately — remaining elements are never loaded until the user pans to them

This replaces the current `updateBoundaryLayersProgressive` which loads ALL features progressively. With viewport culling, we only ever load what's visible.

## Data flow

```
Store mutation
  ├─→ Update RBush index (insert/remove changed entries)
  └─→ syncViewport()
        ├─→ query RBush with padded viewport bounds
        ├─→ diff vs _visibleIds
        ├─→ build features for entering elements
        ├─→ updateData({ add: entering, remove: leaving })
        └─→ reapplySelectionState()

moveend event
  └─→ syncViewport() (same flow)
```

## Integration with existing code

### Replaced

- `updateBoundaryLayers()` / `updateBoundaryLayersIncremental()` / `updateBoundaryLayersProgressive()` — replaced by `syncViewport()` for lane sources
- `updateElementLayers()` — replaced by `syncViewport()` for element sources
- `sourceDiffEngine.ts` `diffAndApply()` — no longer needed, `viewportCuller` manages all source writes

### Kept

- `buildLaneFeaturesInto()` — reused for feature building
- `boundaryCache.ts` — reused for lane geometry
- `selectionStateManager.ts` — reused for feature-state
- `buildBBox()` from `overlapCalc.ts` — extracted/shared for bbox computation
- `updateData()` API — the delivery mechanism for incremental source updates

### Modified

- `MapEditor.tsx` render subscription: calls `syncViewport()` instead of `updateBoundaryLayers` + `updateElementLayers`
- `MapEditor.tsx` moveend handler: calls `syncViewport()` in addition to `updateGridFromViewport()`
- `overlapCalc.ts`: extract `buildBBox()` to a shared utility (`src/geo/bbox.ts`) so both modules can use it

## Performance characteristics

| Operation                  | Complexity            | Est. time (50K lanes) |
| -------------------------- | --------------------- | --------------------- |
| Build index (`rbush.load`) | O(n)                  | ~50ms                 |
| Viewport query             | O(log n + k)          | ~1-5ms                |
| Visible set diff           | O(k)                  | ~1ms                  |
| Feature build for entering | O(entering)           | ~1-5ms                |
| `updateData` add/remove    | O(entering + leaving) | ~5-10ms               |
| Single element edit        | O(log n)              | <1ms                  |
| Pan/zoom total             | —                     | ~10-20ms              |

k = number of visible elements (typically hundreds to low thousands in a viewport).

## Edge cases

- **Zoom out to see all**: if `rbush.search()` returns > 10K entries, switch to "uncullled mode" — call `setData()` with all features and stop tracking `_visibleIds`. When the user zooms back in and the query count drops below 8K (hysteresis to avoid flapping), re-enable culling.
- **Element spans viewport boundary**: bbox padding (50%) ensures partially visible elements are included.
- **Undo/redo**: large state change detected → rebuild index + full `syncViewport()`.
- **fitBounds**: triggers `moveend` → `syncViewport()` handles naturally.
- **Layer visibility toggle**: `syncViewport()` checks `layerVisibility` from UIStore. Hidden element types are skipped entirely (no features built or added to sources). When a type is toggled visible, its visible features are built and added in the next sync.

## Verification

1. Import a 50K+ lane map — only viewport-visible features should appear in MapLibre sources (check via devtools: source feature count << total)
2. Pan around — new features appear smoothly at edges, no pop-in within the padded region
3. Click to select — selection works for visible elements; selected element stays highlighted when panned partially off-screen
4. Edit a lane — change is reflected immediately, index updated
5. Undo/redo — map updates correctly
6. Zoom out fully — fallback to full load kicks in, all features visible
7. Performance: pan/zoom should feel smooth (< 20ms per syncViewport call)
