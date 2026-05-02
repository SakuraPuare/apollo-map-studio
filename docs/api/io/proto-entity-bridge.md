# IO / proto entity bridge

Sources:

- `src/io/proto/entityBridge.ts` — barrel re-export.
- `src/io/proto/entityBridge/map.ts` — bridge registry +
  `apolloMapToEntities` / `entitiesToApolloMap`.
- `src/io/proto/entityBridge/laneRoad.ts` — `LaneEntity`,
  `RoadEntity`.
- `src/io/proto/entityBridge/overlap.ts` — `OverlapEntity` (oneof
  object_overlap_info).
- `src/io/proto/entityBridge/simpleEntities.ts` — barrel for the
  basic / misc / pncJunction / signal sub-files.
- `src/io/proto/entityBridge/simpleEntities/{basic,misc,pncJunction,signal}.ts`
- `src/io/proto/entityBridge/common.ts` — RawId / RawPolygon / RawCurve
  helpers, point conversion.
- `src/io/proto/entityBridge/enums.ts` — bidirectional enum lookup
  tables and helpers.

The entity bridge converts between decoded Apollo map objects and
editor `MapEntity` records.

## Top-Level Rules

`BRIDGES` in `map.ts` is the authoritative routing table. It maps
Apollo fields to editor entity discriminators and back:

```
crosswalk → junction → lane → stop_sign → signal → yield → overlap →
clear_area → speed_bump → road → parking_space → pnc_junction → rsu →
ad_area → barrier_gate
```

Order matters: it determines the emit order in `apolloMapToEntities`,
which downstream consumers (snapshots, tests) rely on.

`apolloMapToEntities(map)` walks the table in stable order and pushes
every supported decoded object into a flat entity array.

`entitiesToApolloMap(baseMap, entities)` clones the imported base map
and replaces supported top-level arrays with serialized entities.

## Fidelity Rules

::: warning Proto2 fidelity invariant
The entire bridge is governed by one rule: **never synthesise a default
value for an optional proto2 field on either side**. Test fixtures
under `src/io/__tests__` enforce byte-equal round-trip on real Apollo
maps (sunnyvale, borregas_ave).
:::

- Optional proto fields are not synthesized when absent.
- Id wrappers are converted through `wrapId` / `unwrapId`.
- Enum integers are converted through explicit enum maps.
- Curves and polygons are converted through common helpers.
- Unsupported top-level fields remain in `baseMap` for round trip.

## Common Helpers (`common.ts`)

- `unwrapId` / `wrapId` — `Id { string id = 1 }` envelope.
- `unwrapIdArray` / `wrapIdArray` — defensive against malformed entries.
- `pointFromProto` / `pointToProto` — `PointENU { x, y, z? }` with
  `x/y` defaulting to `0` and `z` preserving absence.
- `convertPolygonFromProto` / `convertPolygonToProto`.
- `curveFromProto` / `curveToProto` — preserves `s`, `start_position`,
  `heading`, `length` only when set.
- `curveArrayFromProto` / `curveArrayToProto`.

## Enum Helpers (`enums.ts`)

Each enum has two lookup tables (`X_TYPE` and `X_TYPE_INV`) and three
helpers:

- `enumFromProto(table, v, fallback)` — for fields the entity always
  has (e.g. `lane.type`, `lane.turn`).
- `enumFromProtoOptional(table, v)` — for proto2-optional fields
  frequently unset (e.g. `road.type`, `junction.type`,
  `stop_sign.type`). Returns `undefined` when the source omitted the
  field, so the export path can preserve absence.
- `enumToProto(invertedTable, v)` — entity → wire integer.

Tables registered: `LANE_BOUNDARY_LINE_TYPE`, `LANE_TYPE`,
`LANE_TURN`, `LANE_DIRECTION`, `JUNCTION_TYPE`, `ROAD_TYPE`,
`BOUNDARY_EDGE_TYPE`, `STOP_SIGN_TYPE`, `SIGNAL_TYPE`,
`SUBSIGNAL_TYPE`, `SIGN_INFO_TYPE`, `PASSAGE_TYPE`,
`BARRIER_GATE_TYPE`, `AREA_TYPE`.

## Per-Entity Field Mapping

Each entity-type sub-file exports a `RawXxx` interface and the pair
`rawXxxToEntity` / `entityToRawXxx`:

| Entity               | Source file                     | Notable optional fields                                       |
| -------------------- | ------------------------------- | ------------------------------------------------------------- |
| `LaneEntity`         | `laneRoad.ts`                   | `length`, `speedLimit`, `boundary.length`, `boundary.virtual` |
| `RoadEntity`         | `laneRoad.ts`                   | `type` (optional via `enumFromProtoOptional`), `junctionId`   |
| `OverlapEntity`      | `overlap.ts`                    | `lane_overlap_info.{startS, endS, isMerge, regionOverlapId}`  |
| `CrosswalkEntity`    | `simpleEntities/basic.ts`       | none                                                          |
| `JunctionEntity`     | `simpleEntities/basic.ts`       | `type` (optional)                                             |
| `ClearAreaEntity`    | `simpleEntities/basic.ts`       | none                                                          |
| `ParkingSpaceEntity` | `simpleEntities/basic.ts`       | `heading` defaults to `0`                                     |
| `StopSignEntity`     | `simpleEntities/basic.ts`       | `type` (optional)                                             |
| `YieldSignEntity`    | `simpleEntities/basic.ts`       | none                                                          |
| `SpeedBumpEntity`    | `simpleEntities/basic.ts`       | none                                                          |
| `SignalEntity`       | `simpleEntities/signal.ts`      | `subsignal.location` (preserves absence)                      |
| `PNCJunctionEntity`  | `simpleEntities/pncJunction.ts` | `passage.type`                                                |
| `BarrierGateEntity`  | `simpleEntities/misc.ts`        | `type` fb 'OTHER'                                             |
| `RSUEntity`          | `simpleEntities/misc.ts`        | `junctionId` (string \| null)                                 |
| `AreaEntity`         | `simpleEntities/misc.ts`        | `type` fb 'Driveable', `name` optional                        |

::: warning Subsignal location absence
`Subsignal.location` is `optional PointENU`. Apollo's own comment
says "now no data support" and real maps almost never write it.
Defaulting to `{x:0, y:0}` would corrupt every imported subsignal on
re-export (spurious zero-points). The bridge preserves absence
end-to-end.
:::

## Overlap Object Type

Apollo's overlap message has a `oneof object_overlap_info`. The bridge
flattens to `objectType`:

| `objectType`                                                                                                                         | Wire info subfield                            | Carries                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------ |
| `lane`                                                                                                                               | `lane_overlap_info`                           | `{ startS?, endS?, isMerge?, regionOverlapId? }` |
| `crosswalk`                                                                                                                          | `crosswalk_overlap_info`                      | `{ regionOverlapId? }`                           |
| `signal`, `stopSign`, `junction`, `yieldSign`, `clearArea`, `speedBump`, `parkingSpace`, `pncJunction`, `rsu`, `area`, `barrierGate` | corresponding `*_overlap_info` (may be empty) | id only                                          |
| `unknown`                                                                                                                            | none of the above                             | id only — pass-through bucket                    |

`'unknown'` is critical: Apollo's reference sunnyvale_loop sim_map
emits some entries with `object { id }` only, no `*_overlap_info` set.
Returning `null` would silently drop them on round-trip.

## Examples

```ts
import { apolloMapToEntities, entitiesToApolloMap } from '@/io/proto/entityBridge';

const entities = apolloMapToEntities(decodedMap);
const mutated = mutate(entities);
const reEncoded = entitiesToApolloMap(decodedMap, mutated);
// reEncoded.header / .editor_meta passed through from decodedMap;
// reEncoded.lane / .junction etc. rewritten from mutated.
```

## Related

- [/api/io/proto-adapter](/api/io/proto-adapter) — projection step
  before this bridge.
- [/api/io/proto-codec-bin](/api/io/proto-codec-bin) /
  [/api/io/proto-codec-text](/api/io/proto-codec-text) — bytes ↔
  plain object.
- [/api/io/proto-editor-meta](/api/io/proto-editor-meta) — sub-tree
  this bridge does not touch but `entitiesToApolloMap` preserves.
- [/api/lib/entity-ops](/api/lib/entity-ops) — anti-corruption layer
  consumers use to mutate `MapEntity`.
- [/api/store/map-store](/api/store/map-store) — destination of the
  bridge's results.
- [/architecture/anti-corruption-layer](/architecture/anti-corruption-layer)
