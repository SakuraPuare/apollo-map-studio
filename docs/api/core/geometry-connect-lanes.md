# Geometry / connectLanes

Source: `src/core/geometry/connectLanes.ts`.

`connectLanes` implements the two-click lane connection feature used by the
ToolStrip `Connect Lanes` action.

## `planConnection(a, b)`

`planConnection` compares four endpoint pairs:

- `A.end -> B.start`
- `A.start -> B.end`
- `A.start -> B.start`
- `A.end -> B.end`

It returns the closest pair as a `ConnectionPlan`:

```ts
interface ConnectionPlan {
  mode: 'AendToBstart' | 'AstartToBend' | 'AstartToBstart' | 'AendToBend';
  distanceMeters: number;
  isContinuous: boolean;
  indexToMove: number;
  target: GeoPoint;
}
```

Only the first two modes are continuous predecessor/successor connections.
Fork/merge-style endpoint equality is still possible, but topology reconcile
will not turn it into pred/succ.

## `applyLaneConnection(lane, plan)`

This moves the selected endpoint of lane A to `plan.target`, preserving curve
source metadata:

- Bezier lanes shift the first/last anchor and associated handles, then
  resample with `cubicBezier`.
- Arc lanes replace the first/last arc point and resample with
  `threePointArc`.
- Polyline or unknown-source lanes overwrite the centerline endpoint.

The result is passed through `applyDerive(..., { cause: 'editGeometry' })` so
length, samples, boundary geometry and inferred turn can refresh before
`mapStore.updateEntity()` runs topology/overlap reconciliation.

## UI Flow

`src/hooks/mapEventRouter/connectMode.ts` handles clicks while
`uiStore.connectMode.active` is true:

1. First lane click stores `firstLaneId`.
2. Second lane click plans and applies a connection.
3. The updated lane is committed through `mapStore.updateEntity()`.
4. Connect mode exits.

## Tests

See `src/core/geometry/__tests__/connectLanes.test.ts` and
`src/core/geometry/__tests__/laneTopology.test.ts`.
