# Junction Stitching

Junction stitching decorates lane boundaries at shared endpoints so the cold
layer renders cleaner lane junctions.

Key modules:

- `src/core/geometry/laneJunctions.ts`
- `src/core/workers/laneJunctionGraph.ts`
- `src/core/workers/spatialFeatures.ts`

The spatial worker caches decoration per lane and invalidates lanes that share
endpoint keys with an edited lane. See [Junction Graph](/architecture/junction-graph)
and [Rendering Pipeline](/architecture/rendering).
