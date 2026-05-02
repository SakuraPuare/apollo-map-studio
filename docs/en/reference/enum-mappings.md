---
title: Enum Mappings
description: Three-way mapping table (proto numeric / TS string literal / human label) for every enum in src/lib/enumLabels.ts.
---

# Enum Mappings

This page is the visual cross-reference for `src/lib/enumLabels.ts`. Every
inspector dropdown, command palette entry, and status-bar string ultimately
flows through `getEnumLabel(category, value)`. The tables below are the
authoritative ground truth.

::: tip Three identifier systems

1. **Proto numeric**: the varint on the wire, sourced from
   `src/proto/map_msgs/*.proto`.
2. **TS string literal**: the union literal in `src/types/apollo.ts`,
   for example `'CITY_DRIVING'`.
3. **Human label**: the UI string from `src/lib/enumLabels.ts:47-150`.

All three must agree. Any change to one requires synchronised edits to
the other two.
:::

## Registry

```ts
// src/lib/enumLabels.ts:30-43
export type EnumCategory =
  | 'laneType'
  | 'laneTurn'
  | 'laneDirection'
  | 'boundaryType'
  | 'junctionType'
  | 'signalType'
  | 'signInfoType'
  | 'subsignalType'
  | 'stopSignType'
  | 'roadType'
  | 'passageType'
  | 'areaType'
  | 'barrierGateType';
```

```ts
// src/lib/enumLabels.ts:173-175
export function getEnumLabel(category: EnumCategory, value: string): string {
  return REGISTRY[category][value] ?? value;
}
```

::: warning Default fallback
When a value is absent from the dictionary, `getEnumLabel` returns the raw
value (not an empty string). This avoids blank UI but means missing
entries leak the short code. Keep this page and `enumLabels.ts` in sync.
:::

## Lane.LaneType

Source: `src/proto/map_msgs/map_lane.proto:70-78`,
`src/types/apollo.ts:105-112`, `src/lib/enumLabels.ts:47-55`.

| Proto # | TS literal     | UI label     |
| ------- | -------------- | ------------ |
| 1       | `NONE`         | None         |
| 2       | `CITY_DRIVING` | City Driving |
| 3       | `BIKING`       | Biking       |
| 4       | `SIDEWALK`     | Sidewalk     |
| 5       | `PARKING`      | Parking      |
| 6       | `SHOULDER`     | Shoulder     |
| 7       | `SHARED`       | Shared       |

## Lane.LaneTurn

Source: `src/proto/map_msgs/map_lane.proto:81-86`,
`src/lib/enumLabels.ts:57-62`.

| Proto # | TS literal   | UI label   |
| ------- | ------------ | ---------- |
| 1       | `NO_TURN`    | No Turn    |
| 2       | `LEFT_TURN`  | Left Turn  |
| 3       | `RIGHT_TURN` | Right Turn |
| 4       | `U_TURN`     | U-Turn     |

## Lane.LaneDirection

Source: `src/proto/map_msgs/map_lane.proto:98-102`,
`src/lib/enumLabels.ts:64-68`.

| Proto # | TS literal    | UI label      |
| ------- | ------------- | ------------- |
| 1       | `FORWARD`     | Forward       |
| 2       | `BACKWARD`    | Backward      |
| 3       | `BIDIRECTION` | Bidirectional |

## LaneBoundaryType.Type

Source: `src/proto/map_msgs/map_lane.proto:8-22`,
`src/lib/enumLabels.ts:70-78`.

| Proto # | TS literal      | UI label      |
| ------- | --------------- | ------------- |
| 0       | `UNKNOWN`       | Unknown       |
| 1       | `DOTTED_YELLOW` | Dotted Yellow |
| 2       | `DOTTED_WHITE`  | Dotted White  |
| 3       | `SOLID_YELLOW`  | Solid Yellow  |
| 4       | `SOLID_WHITE`   | Solid White   |
| 5       | `DOUBLE_YELLOW` | Double Yellow |
| 6       | `CURB`          | Curb          |

## Junction.Type

Source: `src/proto/map_msgs/map_junction.proto:15-22`,
`src/lib/enumLabels.ts:80-87`.

| Proto # | TS literal   | UI label    |
| ------- | ------------ | ----------- |
| 0       | `UNKNOWN`    | Unknown     |
| 1       | `IN_ROAD`    | In-Road     |
| 2       | `CROSS_ROAD` | Crossroad   |
| 3       | `FORK_ROAD`  | Fork        |
| 4       | `MAIN_SIDE`  | Main / Side |
| 5       | `DEAD_END`   | Dead End    |

## Signal.Type

Source: `src/proto/map_msgs/map_signal.proto:38-45`,
`src/lib/enumLabels.ts:89-96`.

| Proto # | TS literal         | UI label           |
| ------- | ------------------ | ------------------ |
| 1       | `UNKNOWN_SIGNAL`   | Unknown            |
| 2       | `MIX_2_HORIZONTAL` | 2-Light Horizontal |
| 3       | `MIX_2_VERTICAL`   | 2-Light Vertical   |
| 4       | `MIX_3_HORIZONTAL` | 3-Light Horizontal |
| 5       | `MIX_3_VERTICAL`   | 3-Light Vertical   |
| 6       | `SINGLE`           | Single             |

## SignInfo.Type

Source: `src/proto/map_msgs/map_signal.proto:28-35`,
`src/lib/enumLabels.ts:98-101`.

| Proto # | TS literal             | UI label             |
| ------- | ---------------------- | -------------------- |
| 0       | `None`                 | None                 |
| 1       | `NO_RIGHT_TURN_ON_RED` | No Right Turn on Red |

## Subsignal.Type

Source: `src/proto/map_msgs/map_signal.proto:10-19`,
`src/lib/enumLabels.ts:103-112`.

| Proto # | TS literal                | UI label            |
| ------- | ------------------------- | ------------------- |
| 1       | `UNKNOWN_SUBSIGNAL`       | Unknown             |
| 2       | `CIRCLE`                  | Circle              |
| 3       | `ARROW_LEFT`              | Arrow Left          |
| 4       | `ARROW_FORWARD`           | Arrow Forward       |
| 5       | `ARROW_RIGHT`             | Arrow Right         |
| 6       | `ARROW_LEFT_AND_FORWARD`  | Arrow Left+Forward  |
| 7       | `ARROW_RIGHT_AND_FORWARD` | Arrow Right+Forward |
| 8       | `ARROW_U_TURN`            | Arrow U-Turn        |

## StopSign.StopType

Source: `src/proto/map_msgs/map_stop_sign.proto:17-25`,
`src/lib/enumLabels.ts:114-121`.

| Proto # | TS literal          | UI label  |
| ------- | ------------------- | --------- |
| 0       | `UNKNOWN_STOP_SIGN` | Unknown   |
| 1       | `ONE_WAY`           | One-Way   |
| 2       | `TWO_WAY`           | Two-Way   |
| 3       | `THREE_WAY`         | Three-Way |
| 4       | `FOUR_WAY`          | Four-Way  |
| 5       | `ALL_WAY`           | All-Way   |

## Road.Type

Source: `src/proto/map_msgs/map_road.proto:57-63`,
`src/lib/enumLabels.ts:123-128`.

| Proto # | TS literal     | UI label  |
| ------- | -------------- | --------- |
| 0       | `UNKNOWN_ROAD` | Unknown   |
| 1       | `HIGHWAY`      | Highway   |
| 2       | `CITY_ROAD`    | City Road |
| 3       | `PARK`         | Park      |

## Passage.Type

Source: `src/proto/map_msgs/map_pnc_junction.proto:16-21`,
`src/lib/enumLabels.ts:130-134`.

| Proto # | TS literal        | UI label |
| ------- | ----------------- | -------- |
| 0       | `UNKNOWN_PASSAGE` | Unknown  |
| 1       | `ENTRANCE`        | Entrance |
| 2       | `EXIT`            | Exit     |

## Area.Type

Source: `src/proto/map_msgs/map_area.proto:9-15`,
`src/lib/enumLabels.ts:136-142`.

| Proto # | TS literal    | UI label    |
| ------- | ------------- | ----------- |
| 1       | `Driveable`   | Driveable   |
| 2       | `UnDriveable` | Undriveable |
| 3       | `Custom1`     | Custom 1    |
| 4       | `Custom2`     | Custom 2    |
| 5       | `Custom3`     | Custom 3    |

## BarrierGate.BarrierGateType

Source: `src/proto/map_msgs/map_barrier_gate.proto:9-15`,
`src/lib/enumLabels.ts:144-150`.

| Proto # | TS literal    | UI label    |
| ------- | ------------- | ----------- |
| 1       | `ROD`         | Rod         |
| 2       | `FENCE`       | Fence       |
| 3       | `ADVERTISING` | Advertising |
| 4       | `TELESCOPIC`  | Telescopic  |
| 5       | `OTHER`       | Other       |

## BoundaryEdge.Type

Source: `src/proto/map_msgs/map_road.proto:10-16`.

::: tip Not in `enumLabels.ts`
`BoundaryEdge.Type` flows only through round-trip; the UI does not currently
display it. Add a dictionary entry the first time it is shown.
:::

| Proto # | TS literal       |
| ------- | ---------------- |
| 0       | `UNKNOWN`        |
| 1       | `NORMAL`         |
| 2       | `LEFT_BOUNDARY`  |
| 3       | `RIGHT_BOUNDARY` |

## EntityMeta.GeometryKind (editor extension)

Source: `src/proto/editor/editor_meta.proto:33-37`. Editor-only.

| Proto # | TS literal                  |
| ------- | --------------------------- |
| 0       | `GEOMETRY_KIND_UNSPECIFIED` |
| 1       | `LINESTRING`                |
| 2       | `POLYGON`                   |

## Usage examples

```ts
import { getEnumLabel, withLabels } from '@/lib/enumLabels';

// Resolve a human-readable label
getEnumLabel('laneType', 'CITY_DRIVING');
// → 'City Driving'

// Build dropdown options
const options = withLabels('laneTurn', ['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN']);
// → [
//     { value: 'NO_TURN',     label: 'No Turn' },
//     { value: 'LEFT_TURN',   label: 'Left Turn' },
//     { value: 'RIGHT_TURN',  label: 'Right Turn' },
//     { value: 'U_TURN',      label: 'U-Turn' },
//   ]
```

## Per-category counts

| Category          | Count | Notes     |
| ----------------- | ----- | --------- |
| `laneType`        | 7     | proto 1–7 |
| `laneTurn`        | 4     | proto 1–4 |
| `laneDirection`   | 3     | proto 1–3 |
| `boundaryType`    | 7     | proto 0–6 |
| `junctionType`    | 6     | proto 0–5 |
| `signalType`      | 6     | proto 1–6 |
| `signInfoType`    | 2     | proto 0–1 |
| `subsignalType`   | 8     | proto 1–8 |
| `stopSignType`    | 6     | proto 0–5 |
| `roadType`        | 4     | proto 0–3 |
| `passageType`     | 3     | proto 0–2 |
| `areaType`        | 5     | proto 1–5 |
| `barrierGateType` | 5     | proto 1–5 |

## Maintenance rules

1. **Triple sync**: any new / renamed / removed enum value must update
   `.proto`, `apollo.ts`, and `enumLabels.ts` together.
2. **Preserve old values**: never reorder proto field numbers; deletions must
   use `reserved`.
3. **Update this page**: the table is the PR review checklist; reviewers
   reject when a row is missing.
4. **Fallback risk**: `getEnumLabel` falls back to the raw value, so the UI
   never crashes but it leaks short codes. Do not rely on the fallback —
   always extend the dictionary.

## Related pages

- [Proto Schema](/en/reference/proto-schema)
- [Apollo Types](/en/reference/apollo-types)
- [Inspector system](/en/architecture/inspector-system)
- [Derive engine](/en/architecture/derive-engine)
- [Architecture overview](/en/architecture/overview)
