# Geometry / laneTopology

Source: `src/core/geometry/laneTopology.ts`.

Lane topology reconciliation derives lane relationship fields from geometry.
It is pure: given a `Map<string, MapEntity>`, it returns a diff of updated
`LaneEntity` records.

## Derived Fields

- `predecessorIds`
- `successorIds`
- `leftNeighborForwardIds`
- `rightNeighborForwardIds`
- `leftNeighborReverseIds`
- `rightNeighborReverseIds`
- `selfReverseLaneIds`
- `junctionId`

## Rules

| Field                 | Rule                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| predecessor/successor | endpoint equality at `toFixed(6)` precision                                                              |
| self reverse          | lane B start/end are lane A end/start                                                                    |
| junction id           | lane centerline intersects a junction polygon                                                            |
| neighbors             | lanes are parallel or anti-parallel, laterally separated by about lane width, and longitudinally overlap |

The implementation uses approximate local meter projection with
`METERS_PER_DEGREE` and `cos(latitude)` scaling.

## Full vs Incremental

`reconcileLaneTopology(entities)` recomputes all lanes.

`reconcileLaneTopologyIncremental(entities, { dirtyIds, previousEntities })`
limits work around changed lanes/junctions but still returns the same kind of
minimal diff.

`mapStore.addEntity`, `updateEntity`, `removeEntity` and `batchImport` apply
the returned changes inside the same zundo transaction as the user mutation.

## Tests

Relevant tests:

- `src/core/geometry/__tests__/laneTopology.test.ts`
- `src/core/geometry/__tests__/connectLanes.test.ts`
- `src/store/__tests__/mapStore.test.ts`
