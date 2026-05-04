---
title: Benchmark Budgets
description: 'Per-bench reference for scripts/bench-budgets.json: names, p99 ceilings, source files, and guarded paths.'
---

# Benchmark Budgets

This page summarizes the 109 p99 performance budgets in `scripts/bench-budgets.json`. CI runs `scripts/check-bench-budget.mjs` after `pnpm bench`; any unregistered bench or over-budget bench fails the check.

## File Locations

| Path                             | Role                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| `scripts/bench-budgets.json`     | Budget table, the single CI data source                          |
| `scripts/check-bench-budget.mjs` | Fail-closed guard script                                         |
| `bench-results.json`             | Scratch output from `pnpm bench --outputJson bench-results.json` |

## Current Budgets

```json
{
  "10-point polyline, 3.5m offset": {
    "p99Ms": 1
  },
  "100-point polyline, 3.5m offset": {
    "p99Ms": 3
  },
  "1000-point polyline, 3.5m offset": {
    "p99Ms": 40
  },
  "full stitch — 10-lane linear chain": {
    "p99Ms": 3
  },
  "full stitch — 100-lane linear chain": {
    "p99Ms": 6
  },
  "full stitch — 100 lanes / 50 isolated junctions": {
    "p99Ms": 6
  },
  "incremental — 100-lane chain, 1 lane decorated": {
    "p99Ms": 5
  },
  "incremental — 100-lane chain, 3 lanes decorated": {
    "p99Ms": 5
  },
  "topology 100 lanes — full reconcile": {
    "p99Ms": 2
  },
  "topology 100 lanes — incremental (1 dirty lane)": {
    "p99Ms": 1
  },
  "topology 500 lanes — full reconcile": {
    "p99Ms": 5
  },
  "topology 500 lanes — incremental (1 dirty lane)": {
    "p99Ms": 2
  },
  "topology 1000 lanes — full reconcile": {
    "p99Ms": 10
  },
  "topology 1000 lanes — incremental (1 dirty lane)": {
    "p99Ms": 4
  },
  "overlap 5k — full mode (cold)": {
    "p99Ms": 25
  },
  "overlap 5k — incremental (1 dirty lane, warm index)": {
    "p99Ms": 0.5
  },
  "overlap 5k — incremental (1 dirty crosswalk, warm index)": {
    "p99Ms": 0.5
  },
  "overlap 5k — syncDirty (1 dirty)": {
    "p99Ms": 0.05
  },
  "overlap 10k — full mode (cold)": {
    "p99Ms": 50
  },
  "overlap 10k — incremental (1 dirty lane, warm index)": {
    "p99Ms": 0.5
  },
  "overlap 10k — incremental (1 dirty crosswalk, warm index)": {
    "p99Ms": 0.5
  },
  "overlap 10k — syncDirty (1 dirty)": {
    "p99Ms": 0.05
  },
  "overlap 25k — full mode (cold)": {
    "p99Ms": 150
  },
  "overlap 25k — incremental (1 dirty lane, warm index)": {
    "p99Ms": 0.5
  },
  "overlap 25k — incremental (1 dirty crosswalk, warm index)": {
    "p99Ms": 0.5
  },
  "overlap 25k — syncDirty (1 dirty)": {
    "p99Ms": 0.05
  },
  "snap 1k entities — find target": {
    "p99Ms": 0.8
  },
  "snap 5k entities — find target": {
    "p99Ms": 2.5
  },
  "snap 10k entities — find target": {
    "p99Ms": 6
  },
  "snap applySnap 1k entities — editingPoint": {
    "p99Ms": 0.8
  },
  "snap applySnap 5k entities — editingPoint": {
    "p99Ms": 4
  },
  "hitTest polyline 1000 segments — distance": {
    "p99Ms": 0.1
  },
  "hitTest polyline 5000 segments — distance": {
    "p99Ms": 0.25
  },
  "hitTest polygon 1000 vertices — distance": {
    "p99Ms": 0.1
  },
  "hitTest polygon 5000 vertices — distance": {
    "p99Ms": 0.4
  },
  "boundary brush 1k lanes — find paint hit": {
    "p99Ms": 4
  },
  "boundary brush 5k lanes — find paint hit": {
    "p99Ms": 16
  },
  "boundary brush 100 pts — paint lane type": {
    "p99Ms": 0.1
  },
  "boundary brush 1000 pts — paint lane type": {
    "p99Ms": 0.5
  },
  "validation 100 vertices — append edge": {
    "p99Ms": 0.01
  },
  "validation 100 vertices — full self-intersection": {
    "p99Ms": 0.1
  },
  "validation 500 vertices — append edge": {
    "p99Ms": 0.01
  },
  "validation 500 vertices — full self-intersection": {
    "p99Ms": 0.8
  },
  "validation 1000 vertices — append edge": {
    "p99Ms": 0.01
  },
  "validation 1000 vertices — full self-intersection": {
    "p99Ms": 3
  },
  "spatial 1k — syncEntities": {
    "p99Ms": 60
  },
  "spatial 1k — buildFeatureCollection full": {
    "p99Ms": 10
  },
  "spatial 1k — buildFeatureCollection incremental 1 lane": {
    "p99Ms": 6
  },
  "spatial 1k — featureGroupsForState": {
    "p99Ms": 1
  },
  "spatial 1k — HIT_TEST dense query": {
    "p99Ms": 1
  },
  "spatial 1k — INCREMENTAL request 1 dirty lane": {
    "p99Ms": 5
  },
  "spatial 5k — syncEntities": {
    "p99Ms": 80
  },
  "spatial 5k — buildFeatureCollection full": {
    "p99Ms": 50
  },
  "spatial 5k — buildFeatureCollection incremental 1 lane": {
    "p99Ms": 30
  },
  "spatial 5k — featureGroupsForState": {
    "p99Ms": 10
  },
  "spatial 5k — HIT_TEST dense query": {
    "p99Ms": 10
  },
  "spatial 5k — INCREMENTAL request 1 dirty lane": {
    "p99Ms": 60
  },
  "cold layer 5k — groupsToFeatureMap": {
    "p99Ms": 0.6
  },
  "cold layer 5k — flattenEntityFeatures": {
    "p99Ms": 1
  },
  "cold layer 5k — diffEntities one update one remove": {
    "p99Ms": 0.5
  },
  "cold source 5k — rebuild from cache": {
    "p99Ms": 1.2
  },
  "cold source 5k — apply delta 100 changed": {
    "p99Ms": 0.05
  },
  "cold layer 25k — groupsToFeatureMap": {
    "p99Ms": 6
  },
  "cold layer 25k — flattenEntityFeatures": {
    "p99Ms": 5
  },
  "cold layer 25k — diffEntities one update one remove": {
    "p99Ms": 3
  },
  "cold source 25k — rebuild from cache": {
    "p99Ms": 4
  },
  "cold source 25k — apply delta 100 changed": {
    "p99Ms": 0.05
  },
  "hot layer lane 100 pts — entityToHotFeatures": {
    "p99Ms": 0.05
  },
  "hot layer lane 100 pts — applyDrag and features": {
    "p99Ms": 0.1
  },
  "hot layer lane 1000 pts — entityToHotFeatures": {
    "p99Ms": 0.15
  },
  "hot layer lane 1000 pts — applyDrag and features": {
    "p99Ms": 1.5
  },
  "hot layer lane 5000 pts — entityToHotFeatures": {
    "p99Ms": 1.5
  },
  "hot layer lane 5000 pts — applyDrag and features": {
    "p99Ms": 2
  },
  "overlay polyline 100 pts — buildOverlayFeatures": {
    "p99Ms": 0.05
  },
  "overlay catmull 100 pts — buildOverlayFeatures": {
    "p99Ms": 0.8
  },
  "overlay bezier 100 anchors — buildOverlayFeatures": {
    "p99Ms": 0.3
  },
  "overlay polyline 1000 pts — buildOverlayFeatures": {
    "p99Ms": 0.5
  },
  "overlay catmull 1000 pts — buildOverlayFeatures": {
    "p99Ms": 4
  },
  "overlay bezier 1000 anchors — buildOverlayFeatures": {
    "p99Ms": 4
  },
  "grid max-density viewport — buildGrid": {
    "p99Ms": 0.05
  },
  "entityOps 10k — cascadeDeleteRefsFull one lane": {
    "p99Ms": 3
  },
  "entityOps 10k — cascadeDeleteRefsFull 100 lanes": {
    "p99Ms": 4
  },
  "entityOps 10k — reparent lane to road section": {
    "p99Ms": 0.5
  },
  "entityOps 50k — cascadeDeleteRefsFull one lane": {
    "p99Ms": 20
  },
  "entityOps 50k — cascadeDeleteRefsFull 100 lanes": {
    "p99Ms": 25
  },
  "entityOps 50k — reparent lane to road section": {
    "p99Ms": 2
  },
  "mapStore 10k — update lane transaction": {
    "p99Ms": 90
  },
  "mapStore 10k — remove lane transaction": {
    "p99Ms": 70
  },
  "mapStore 10k — batchImport transaction": {
    "p99Ms": 90
  },
  "mapStore 25k — update lane transaction": {
    "p99Ms": 130
  },
  "mapStore 25k — remove lane transaction": {
    "p99Ms": 120
  },
  "mapStore 25k — batchImport transaction": {
    "p99Ms": 240
  },
  "chunking 10k entities — slice 2k chunks": {
    "p99Ms": 0.05
  },
  "chunking 50k entities — slice 2k chunks": {
    "p99Ms": 0.1
  },
  "proto bridge 1k — apolloMapToEntities": {
    "p99Ms": 5
  },
  "proto bridge 1k — entitiesToApolloMap": {
    "p99Ms": 3
  },
  "proto bounds 1k — computeApolloMapBounds": {
    "p99Ms": 0.5
  },
  "proto projection 1k — to lonlat": {
    "p99Ms": 45
  },
  "proto projection 1k — from lonlat": {
    "p99Ms": 60
  },
  "proto bridge 5k — apolloMapToEntities": {
    "p99Ms": 12
  },
  "proto bridge 5k — entitiesToApolloMap": {
    "p99Ms": 16
  },
  "proto bounds 5k — computeApolloMapBounds": {
    "p99Ms": 2
  },
  "proto projection 5k — to lonlat": {
    "p99Ms": 150
  },
  "proto projection 5k — from lonlat": {
    "p99Ms": 150
  },
  "proto bin 1k lanes — encode": {
    "p99Ms": 30
  },
  "proto bin 1k lanes — decode": {
    "p99Ms": 16
  },
  "proto text 100 lanes — encode": {
    "p99Ms": 12
  },
  "proto text 100 lanes — decode": {
    "p99Ms": 8
  },
  "proto roundtrip 1k lanes — bridge project encode": {
    "p99Ms": 60
  }
}
```

## Bench Groups

### offset polyline geometry

| Bench                              | File                                                  | p99 ceiling | Guarded path                                                |
| ---------------------------------- | ----------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `10-point polyline, 3.5m offset`   | `src/core/geometry/__tests__/offsetPolyline.bench.ts` | **1 ms**    | polyline offset used by lane polygon and boundary rendering |
| `100-point polyline, 3.5m offset`  | `src/core/geometry/__tests__/offsetPolyline.bench.ts` | **3 ms**    | polyline offset used by lane polygon and boundary rendering |
| `1000-point polyline, 3.5m offset` | `src/core/geometry/__tests__/offsetPolyline.bench.ts` | **40 ms**   | polyline offset used by lane polygon and boundary rendering |

### lane junction derivation

| Bench                                             | File                                                 | p99 ceiling | Guarded path                                                |
| ------------------------------------------------- | ---------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `full stitch — 10-lane linear chain`              | `src/core/geometry/__tests__/laneJunctions.bench.ts` | **3 ms**    | lane junction stitching and incremental boundary decoration |
| `full stitch — 100-lane linear chain`             | `src/core/geometry/__tests__/laneJunctions.bench.ts` | **6 ms**    | lane junction stitching and incremental boundary decoration |
| `full stitch — 100 lanes / 50 isolated junctions` | `src/core/geometry/__tests__/laneJunctions.bench.ts` | **6 ms**    | lane junction stitching and incremental boundary decoration |
| `incremental — 100-lane chain, 1 lane decorated`  | `src/core/geometry/__tests__/laneJunctions.bench.ts` | **5 ms**    | lane junction stitching and incremental boundary decoration |
| `incremental — 100-lane chain, 3 lanes decorated` | `src/core/geometry/__tests__/laneJunctions.bench.ts` | **5 ms**    | lane junction stitching and incremental boundary decoration |

### lane topology reconcile

| Bench                                              | File                                                | p99 ceiling | Guarded path                                    |
| -------------------------------------------------- | --------------------------------------------------- | ----------- | ----------------------------------------------- |
| `topology 100 lanes — full reconcile`              | `src/core/geometry/__tests__/laneTopology.bench.ts` | **2 ms**    | pred/succ/neighbor/junction topology derivation |
| `topology 100 lanes — incremental (1 dirty lane)`  | `src/core/geometry/__tests__/laneTopology.bench.ts` | **1 ms**    | pred/succ/neighbor/junction topology derivation |
| `topology 500 lanes — full reconcile`              | `src/core/geometry/__tests__/laneTopology.bench.ts` | **5 ms**    | pred/succ/neighbor/junction topology derivation |
| `topology 500 lanes — incremental (1 dirty lane)`  | `src/core/geometry/__tests__/laneTopology.bench.ts` | **2 ms**    | pred/succ/neighbor/junction topology derivation |
| `topology 1000 lanes — full reconcile`             | `src/core/geometry/__tests__/laneTopology.bench.ts` | **10 ms**   | pred/succ/neighbor/junction topology derivation |
| `topology 1000 lanes — incremental (1 dirty lane)` | `src/core/geometry/__tests__/laneTopology.bench.ts` | **4 ms**    | pred/succ/neighbor/junction topology derivation |

### overlap reconcile and spatial index

| Bench                                                       | File                                                   | p99 ceiling | Guarded path                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------ | ----------- | ------------------------------------------------------------ |
| `overlap 5k — full mode (cold)`                             | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **25 ms**   | full and dirty overlap reconciliation plus index maintenance |
| `overlap 5k — incremental (1 dirty lane, warm index)`       | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.5 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 5k — incremental (1 dirty crosswalk, warm index)`  | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.5 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 5k — syncDirty (1 dirty)`                          | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.05 ms** | full and dirty overlap reconciliation plus index maintenance |
| `overlap 10k — full mode (cold)`                            | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **50 ms**   | full and dirty overlap reconciliation plus index maintenance |
| `overlap 10k — incremental (1 dirty lane, warm index)`      | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.5 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 10k — incremental (1 dirty crosswalk, warm index)` | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.5 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 10k — syncDirty (1 dirty)`                         | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.05 ms** | full and dirty overlap reconciliation plus index maintenance |
| `overlap 25k — full mode (cold)`                            | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **150 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 25k — incremental (1 dirty lane, warm index)`      | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.5 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 25k — incremental (1 dirty crosswalk, warm index)` | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.5 ms**  | full and dirty overlap reconciliation plus index maintenance |
| `overlap 25k — syncDirty (1 dirty)`                         | `src/core/elements/overlap/__tests__/overlap.bench.ts` | **0.05 ms** | full and dirty overlap reconciliation plus index maintenance |

### interaction geometry and snap integration

| Bench                                               | File                                                                                                      | p99 ceiling | Guarded path                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `snap 1k entities — find target`                    | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.8 ms**  | mousemove snap scan over visible entities                          |
| `snap 5k entities — find target`                    | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **2.5 ms**  | mousemove snap scan over visible entities                          |
| `snap 10k entities — find target`                   | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **6 ms**    | mousemove snap scan over visible entities                          |
| `snap applySnap 1k entities — editingPoint`         | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.8 ms**  | mousemove snap integration through map, UI store, and entity store |
| `snap applySnap 5k entities — editingPoint`         | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **4 ms**    | mousemove snap integration through map, UI store, and entity store |
| `hitTest polyline 1000 segments — distance`         | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.1 ms**  | worker hit-test distance primitives                                |
| `hitTest polyline 5000 segments — distance`         | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.25 ms** | worker hit-test distance primitives                                |
| `hitTest polygon 1000 vertices — distance`          | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.1 ms**  | worker hit-test distance primitives                                |
| `hitTest polygon 5000 vertices — distance`          | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.4 ms**  | worker hit-test distance primitives                                |
| `validation 100 vertices — append edge`             | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.01 ms** | polygon self-intersection checks in draw/edit flows                |
| `validation 100 vertices — full self-intersection`  | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.1 ms**  | polygon self-intersection checks in draw/edit flows                |
| `validation 500 vertices — append edge`             | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.01 ms** | polygon self-intersection checks in draw/edit flows                |
| `validation 500 vertices — full self-intersection`  | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.8 ms**  | polygon self-intersection checks in draw/edit flows                |
| `validation 1000 vertices — append edge`            | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **0.01 ms** | polygon self-intersection checks in draw/edit flows                |
| `validation 1000 vertices — full self-intersection` | `src/core/geometry/__tests__/interactionGeometry.bench.ts / src/hooks/__tests__/snapIntegration.bench.ts` | **3 ms**    | polygon self-intersection checks in draw/edit flows                |

### lane boundary brush

| Bench                                       | File                                                     | p99 ceiling | Guarded path                                            |
| ------------------------------------------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| `boundary brush 1k lanes — find paint hit`  | `src/core/geometry/__tests__/laneBoundaryPaint.bench.ts` | **4 ms**    | mousemove lane-boundary brush scan over lane boundaries |
| `boundary brush 5k lanes — find paint hit`  | `src/core/geometry/__tests__/laneBoundaryPaint.bench.ts` | **16 ms**   | mousemove lane-boundary brush scan over lane boundaries |
| `boundary brush 100 pts — paint lane type`  | `src/core/geometry/__tests__/laneBoundaryPaint.bench.ts` | **0.1 ms**  | lane boundary type insertion and normalization          |
| `boundary brush 1000 pts — paint lane type` | `src/core/geometry/__tests__/laneBoundaryPaint.bench.ts` | **0.5 ms**  | lane boundary type insertion and normalization          |

### spatial worker pipeline

| Bench                                                    | File                                                  | p99 ceiling | Guarded path                                                    |
| -------------------------------------------------------- | ----------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `spatial 1k — syncEntities`                              | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **60 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 1k — buildFeatureCollection full`               | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **10 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 1k — buildFeatureCollection incremental 1 lane` | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **6 ms**    | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 1k — featureGroupsForState`                     | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **1 ms**    | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 1k — HIT_TEST dense query`                      | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **1 ms**    | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 1k — INCREMENTAL request 1 dirty lane`          | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **5 ms**    | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 5k — syncEntities`                              | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **80 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 5k — buildFeatureCollection full`               | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **50 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 5k — buildFeatureCollection incremental 1 lane` | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **30 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 5k — featureGroupsForState`                     | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **10 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 5k — HIT_TEST dense query`                      | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **10 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |
| `spatial 5k — INCREMENTAL request 1 dirty lane`          | `src/core/workers/__tests__/spatialPipeline.bench.ts` | **60 ms**   | worker sync, cold feature rebuild, delta, and hit-test protocol |

### cold, hot, overlay, and grid layers

| Bench                                                 | File                                         | p99 ceiling | Guarded path                                                |
| ----------------------------------------------------- | -------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `cold layer 5k — groupsToFeatureMap`                  | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.6 ms**  | main-thread cold source cache, diff, and updateData helpers |
| `cold layer 5k — flattenEntityFeatures`               | `src/hooks/__tests__/layerBuilders.bench.ts` | **1 ms**    | main-thread cold source cache, diff, and updateData helpers |
| `cold layer 5k — diffEntities one update one remove`  | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.5 ms**  | main-thread cold source cache, diff, and updateData helpers |
| `cold source 5k — rebuild from cache`                 | `src/hooks/__tests__/layerBuilders.bench.ts` | **1.2 ms**  | main-thread cold source cache, diff, and updateData helpers |
| `cold source 5k — apply delta 100 changed`            | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.05 ms** | main-thread cold source cache, diff, and updateData helpers |
| `cold layer 25k — groupsToFeatureMap`                 | `src/hooks/__tests__/layerBuilders.bench.ts` | **6 ms**    | main-thread cold source cache, diff, and updateData helpers |
| `cold layer 25k — flattenEntityFeatures`              | `src/hooks/__tests__/layerBuilders.bench.ts` | **5 ms**    | main-thread cold source cache, diff, and updateData helpers |
| `cold layer 25k — diffEntities one update one remove` | `src/hooks/__tests__/layerBuilders.bench.ts` | **3 ms**    | main-thread cold source cache, diff, and updateData helpers |
| `cold source 25k — rebuild from cache`                | `src/hooks/__tests__/layerBuilders.bench.ts` | **4 ms**    | main-thread cold source cache, diff, and updateData helpers |
| `cold source 25k — apply delta 100 changed`           | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.05 ms** | main-thread cold source cache, diff, and updateData helpers |
| `hot layer lane 100 pts — entityToHotFeatures`        | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.05 ms** | selected entity drag display and hot feature generation     |
| `hot layer lane 100 pts — applyDrag and features`     | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.1 ms**  | selected entity drag display and hot feature generation     |
| `hot layer lane 1000 pts — entityToHotFeatures`       | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.15 ms** | selected entity drag display and hot feature generation     |
| `hot layer lane 1000 pts — applyDrag and features`    | `src/hooks/__tests__/layerBuilders.bench.ts` | **1.5 ms**  | selected entity drag display and hot feature generation     |
| `hot layer lane 5000 pts — entityToHotFeatures`       | `src/hooks/__tests__/layerBuilders.bench.ts` | **1.5 ms**  | selected entity drag display and hot feature generation     |
| `hot layer lane 5000 pts — applyDrag and features`    | `src/hooks/__tests__/layerBuilders.bench.ts` | **2 ms**    | selected entity drag display and hot feature generation     |
| `overlay polyline 100 pts — buildOverlayFeatures`     | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.05 ms** | draw preview feature generation                             |
| `overlay catmull 100 pts — buildOverlayFeatures`      | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.8 ms**  | draw preview feature generation                             |
| `overlay bezier 100 anchors — buildOverlayFeatures`   | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.3 ms**  | draw preview feature generation                             |
| `overlay polyline 1000 pts — buildOverlayFeatures`    | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.5 ms**  | draw preview feature generation                             |
| `overlay catmull 1000 pts — buildOverlayFeatures`     | `src/hooks/__tests__/layerBuilders.bench.ts` | **4 ms**    | draw preview feature generation                             |
| `overlay bezier 1000 anchors — buildOverlayFeatures`  | `src/hooks/__tests__/layerBuilders.bench.ts` | **4 ms**    | draw preview feature generation                             |
| `grid max-density viewport — buildGrid`               | `src/hooks/__tests__/layerBuilders.bench.ts` | **0.05 ms** | grid viewport feature generation                            |

### entity reference operations

| Bench                                             | File                                             | p99 ceiling | Guarded path                                   |
| ------------------------------------------------- | ------------------------------------------------ | ----------- | ---------------------------------------------- |
| `entityOps 10k — cascadeDeleteRefsFull one lane`  | `src/lib/entityOps/__tests__/entityOps.bench.ts` | **3 ms**    | whole-map reference cleanup and reparent scans |
| `entityOps 10k — cascadeDeleteRefsFull 100 lanes` | `src/lib/entityOps/__tests__/entityOps.bench.ts` | **4 ms**    | whole-map reference cleanup and reparent scans |
| `entityOps 10k — reparent lane to road section`   | `src/lib/entityOps/__tests__/entityOps.bench.ts` | **0.5 ms**  | whole-map reference cleanup and reparent scans |
| `entityOps 50k — cascadeDeleteRefsFull one lane`  | `src/lib/entityOps/__tests__/entityOps.bench.ts` | **20 ms**   | whole-map reference cleanup and reparent scans |
| `entityOps 50k — cascadeDeleteRefsFull 100 lanes` | `src/lib/entityOps/__tests__/entityOps.bench.ts` | **25 ms**   | whole-map reference cleanup and reparent scans |
| `entityOps 50k — reparent lane to road section`   | `src/lib/entityOps/__tests__/entityOps.bench.ts` | **2 ms**    | whole-map reference cleanup and reparent scans |

### map store write transactions

| Bench                                    | File                                    | p99 ceiling | Guarded path                                                                 |
| ---------------------------------------- | --------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `mapStore 10k — update lane transaction` | `src/store/__tests__/mapStore.bench.ts` | **90 ms**   | store add/update/remove/import transaction with topology and overlap patches |
| `mapStore 10k — remove lane transaction` | `src/store/__tests__/mapStore.bench.ts` | **70 ms**   | store add/update/remove/import transaction with topology and overlap patches |
| `mapStore 10k — batchImport transaction` | `src/store/__tests__/mapStore.bench.ts` | **90 ms**   | store add/update/remove/import transaction with topology and overlap patches |
| `mapStore 25k — update lane transaction` | `src/store/__tests__/mapStore.bench.ts` | **130 ms**  | store add/update/remove/import transaction with topology and overlap patches |
| `mapStore 25k — remove lane transaction` | `src/store/__tests__/mapStore.bench.ts` | **120 ms**  | store add/update/remove/import transaction with topology and overlap patches |
| `mapStore 25k — batchImport transaction` | `src/store/__tests__/mapStore.bench.ts` | **240 ms**  | store add/update/remove/import transaction with topology and overlap patches |

### main-thread chunking

| Bench                                     | File                                  | p99 ceiling | Guarded path                                              |
| ----------------------------------------- | ------------------------------------- | ----------- | --------------------------------------------------------- |
| `chunking 10k entities — slice 2k chunks` | `src/lib/__tests__/chunking.bench.ts` | **0.05 ms** | main-thread worker/IO chunk slice loop before postMessage |
| `chunking 50k entities — slice 2k chunks` | `src/lib/__tests__/chunking.bench.ts` | **0.1 ms**  | main-thread worker/IO chunk slice loop before postMessage |

### Apollo proto pipeline

| Bench                                              | File                                            | p99 ceiling | Guarded path                                                  |
| -------------------------------------------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `proto bridge 1k — apolloMapToEntities`            | `src/io/proto/__tests__/protoPipeline.bench.ts` | **5 ms**    | import/export bridge, projection, binary, and text codec work |
| `proto bridge 1k — entitiesToApolloMap`            | `src/io/proto/__tests__/protoPipeline.bench.ts` | **3 ms**    | import/export bridge, projection, binary, and text codec work |
| `proto bounds 1k — computeApolloMapBounds`         | `src/io/proto/__tests__/protoPipeline.bench.ts` | **0.5 ms**  | import auto-fit bounds traversal                              |
| `proto projection 1k — to lonlat`                  | `src/io/proto/__tests__/protoPipeline.bench.ts` | **45 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto projection 1k — from lonlat`                | `src/io/proto/__tests__/protoPipeline.bench.ts` | **60 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto bridge 5k — apolloMapToEntities`            | `src/io/proto/__tests__/protoPipeline.bench.ts` | **12 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto bridge 5k — entitiesToApolloMap`            | `src/io/proto/__tests__/protoPipeline.bench.ts` | **16 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto bounds 5k — computeApolloMapBounds`         | `src/io/proto/__tests__/protoPipeline.bench.ts` | **2 ms**    | import auto-fit bounds traversal                              |
| `proto projection 5k — to lonlat`                  | `src/io/proto/__tests__/protoPipeline.bench.ts` | **150 ms**  | import/export bridge, projection, binary, and text codec work |
| `proto projection 5k — from lonlat`                | `src/io/proto/__tests__/protoPipeline.bench.ts` | **150 ms**  | import/export bridge, projection, binary, and text codec work |
| `proto bin 1k lanes — encode`                      | `src/io/proto/__tests__/protoPipeline.bench.ts` | **30 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto bin 1k lanes — decode`                      | `src/io/proto/__tests__/protoPipeline.bench.ts` | **16 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto text 100 lanes — encode`                    | `src/io/proto/__tests__/protoPipeline.bench.ts` | **12 ms**   | import/export bridge, projection, binary, and text codec work |
| `proto text 100 lanes — decode`                    | `src/io/proto/__tests__/protoPipeline.bench.ts` | **8 ms**    | import/export bridge, projection, binary, and text codec work |
| `proto roundtrip 1k lanes — bridge project encode` | `src/io/proto/__tests__/protoPipeline.bench.ts` | **60 ms**   | export-style bridge, projection, and binary encode pipeline   |

## Bench Naming

::: tip Naming rules

- Start with the measured object: `<algorithm> — <input description>`.
- Put the scale in the name; avoid vague small/medium/large labels.
- The name must exactly match `scripts/bench-budgets.json`; the guard uses exact string matching.
  :::

## Cross-Platform Variance

CI runs on GitHub `ubuntu-latest`, where VM jitter is normal. Budgets should:

- Keep roughly 30% headroom; sub-1ms benches need larger relative headroom.
- Treat repeated failures as real regressions; rerun one-off outliers first.
- Update `scripts/bench-budgets.json` and this page whenever a bench is added.

## Coverage Scope

::: tip Why there are 109 benches now

The budget set covers code that can stall the main thread, pile work onto workers, or regress on large-map complexity:

- Geometry hot paths: offset, snap, hit-test, boundary brush, polygon validation.
- Map derivation: lane junctions, lane topology, overlap reconcile.
- Worker and layer paths: spatial worker cold pipeline, cold source diff/updateData helpers, hot/overlay/grid builders, main-thread chunk slicing.
- Store and entity operations: mapStore write transactions, batchImport, cascade delete, whole-map reparent scans.
- IO paths: Apollo proto bridge, bounds, projection, roundtrip, binary codec, and text codec.

MapLibre's internal `setData/updateData/queryRenderedFeatures` implementation is not executed in Node benches. These benches guard the app-side construction, diff, chunking, and protocol costs around those calls.
:::

## Why p99 Instead Of Mean

CI gates on p99 because tail latency, not average speed, governs perceived stutter. A path with a low mean but occasional multi-frame spikes is still visible during 60fps drag and click workflows.
