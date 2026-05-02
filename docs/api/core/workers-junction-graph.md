# Workers / laneJunctionGraph

Source: `src/core/workers/laneJunctionGraph.ts`.

`LaneJunctionGraph` is the worker-side endpoint dependency index used by the
spatial worker to compute the affected lane set during incremental cold-layer
rebuilds.

## Why

`applyLaneJunctions` stitches every lane junction every time it runs and the
worker calls it on every entity edit. Boundary decoration costs ~3 ms per lane
on the average HD map, so a naive full pass dominates each frame. Caching
decoration per lane and only refreshing the lanes that share an endpoint with
the dirty lane requires fast lookup of "which lanes share an endpoint with
lane X". This graph answers that in O(K) where K is the junction fan-out
(typically 2–4).

## Endpoint Keys

```ts
type EndpointKey = string;

function endpointKeyOf(pt: GeoPoint): EndpointKey;
function laneEndpointKeys(lane: LaneEntity): [EndpointKey, EndpointKey] | null;
```

Endpoints are quantised to 1 cm precision via `toFixed(6)`, the same
quantisation used by `geometry/laneTopology.ts` and
`geometry/laneJunctions/internal.ts` so the three modules agree under
floating-point drift.

`laneEndpointKeys` returns `null` for lanes whose centerline has fewer than
two points.

## Class

```ts
class LaneJunctionGraph {
  clear(): void;
  addLane(id: string, keys: [EndpointKey, EndpointKey]): void;
  removeLane(id: string): void;
  getDependents(id: string): Set<string>;
  has(id: string): boolean;
  size(): number;
}
```

Two indexes stay in lockstep:

- `laneToKeys: Map<string, [EndpointKey, EndpointKey]>`
- `keyToLanes: Map<EndpointKey, Set<string>>`

`addLane` is idempotent — it removes any prior mapping for the same id before
re-inserting, so incremental edits that update a lane's endpoint do not leak
stale buckets.

`getDependents(id)` walks both endpoint keys, unions every other lane in those
buckets, and returns the set excluding `id` itself.

## Worker Integration

`spatialState.ts` owns the singleton graph and keeps it consistent with the
entity map:

- `insertEntity` — for lane entities, computes endpoint keys and calls
  `addLane`. Drops any cached decoration for the lane.
- `removeEntity` — for lane entities, calls `removeLane` and drops cached
  decoration.
- `syncEntities` — calls `clear` via `resetSpatialState`, then re-adds every
  lane during the bulk insert pass.

`spatialRequests.ts` queries the graph during incremental edits via
`addLaneDependents(state, id, affected)`:

- pre-mutation: for every removed/updated lane, add itself plus
  `getDependents(id)` to the affected set;
- post-mutation: same query against the updated graph state, so lanes that
  only became neighbours after the edit are decorated too.

The affected set is then passed as `decorateOnly` to
`buildFeatureCollection` so the worker only re-decorates those lanes.

## Tests

See `src/core/workers/__tests__/laneJunctionGraph.test.ts`.
