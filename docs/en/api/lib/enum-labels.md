---
title: enumLabels — proto enum display-label registry
description: Apollo proto enum value (CITY_DRIVING/MIX_3_VERTICAL) → human-readable label dictionary; the i18n hook.
---

# `enumLabels` — proto enum display-label registry

> Source: `src/lib/enumLabels.ts` · 184 lines · 13 enum categories · pure lookup, no side effects

## Purpose

Apollo proto enum values (`CITY_DRIVING`, `MIX_3_VERTICAL`, `DOTTED_YELLOW`, …) are the source of truth on the wire and in zod schemas. The UI needs a human-readable label per language. `enumLabels` is the single funnel: components call `getEnumLabel(category, value)` and a future i18n layer only swaps the dictionary.

Categories (`EnumCategory`) match the **proto message** that owns the enum, not the form-field name, so the same boundary type used by `Lane.left` and `Lane.right` shares one entry.

## Public API

| Symbol         | Kind  | Signature                                                          | Summary                    |
| -------------- | ----- | ------------------------------------------------------------------ | -------------------------- |
| `EnumCategory` | union | 13 strings                                                         | Category enum              |
| `getEnumLabel` | fn    | `(category, value) => string`                                      | Lookup with fallback       |
| `withLabels`   | fn    | `<T>(category, options) => readonly { value: T, label: string }[]` | Convenience for `<Select>` |

### `EnumCategory`

```ts
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

## Categories

### `laneType` — from `LaneType`

| Value          | Label        |
| -------------- | ------------ |
| `NONE`         | None         |
| `CITY_DRIVING` | City Driving |
| `BIKING`       | Biking       |
| `SIDEWALK`     | Sidewalk     |
| `PARKING`      | Parking      |
| `SHOULDER`     | Shoulder     |
| `SHARED`       | Shared       |

### `laneTurn` — `LaneTurn`

| Value        | Label      |
| ------------ | ---------- |
| `NO_TURN`    | No Turn    |
| `LEFT_TURN`  | Left Turn  |
| `RIGHT_TURN` | Right Turn |
| `U_TURN`     | U-Turn     |

### `laneDirection` — `LaneDirection`

| Value         | Label         |
| ------------- | ------------- |
| `FORWARD`     | Forward       |
| `BACKWARD`    | Backward      |
| `BIDIRECTION` | Bidirectional |

### `boundaryType` — `BoundaryLineType`

| Value           | Label         |
| --------------- | ------------- |
| `UNKNOWN`       | Unknown       |
| `DOTTED_YELLOW` | Dotted Yellow |
| `DOTTED_WHITE`  | Dotted White  |
| `SOLID_YELLOW`  | Solid Yellow  |
| `SOLID_WHITE`   | Solid White   |
| `DOUBLE_YELLOW` | Double Yellow |
| `CURB`          | Curb          |

### `junctionType` — `JunctionType`

| Value        | Label       |
| ------------ | ----------- |
| `UNKNOWN`    | Unknown     |
| `IN_ROAD`    | In-Road     |
| `CROSS_ROAD` | Crossroad   |
| `FORK_ROAD`  | Fork        |
| `MAIN_SIDE`  | Main / Side |
| `DEAD_END`   | Dead End    |

### `signalType` — `SignalType`

| Value              | Label              |
| ------------------ | ------------------ |
| `UNKNOWN_SIGNAL`   | Unknown            |
| `MIX_2_HORIZONTAL` | 2-Light Horizontal |
| `MIX_2_VERTICAL`   | 2-Light Vertical   |
| `MIX_3_HORIZONTAL` | 3-Light Horizontal |
| `MIX_3_VERTICAL`   | 3-Light Vertical   |
| `SINGLE`           | Single             |

### `signInfoType` — `SignInfoType`

| Value                  | Label                |
| ---------------------- | -------------------- |
| `NO_RIGHT_TURN_ON_RED` | No Right Turn on Red |
| `None`                 | None                 |

### `subsignalType` — `SubsignalType`

| Value                     | Label               |
| ------------------------- | ------------------- |
| `UNKNOWN_SUBSIGNAL`       | Unknown             |
| `CIRCLE`                  | Circle              |
| `ARROW_LEFT`              | Arrow Left          |
| `ARROW_FORWARD`           | Arrow Forward       |
| `ARROW_RIGHT`             | Arrow Right         |
| `ARROW_LEFT_AND_FORWARD`  | Arrow Left+Forward  |
| `ARROW_RIGHT_AND_FORWARD` | Arrow Right+Forward |
| `ARROW_U_TURN`            | Arrow U-Turn        |

### `stopSignType` — `StopSignType`

| Value               | Label     |
| ------------------- | --------- |
| `UNKNOWN_STOP_SIGN` | Unknown   |
| `ONE_WAY`           | One-Way   |
| `TWO_WAY`           | Two-Way   |
| `THREE_WAY`         | Three-Way |
| `FOUR_WAY`          | Four-Way  |
| `ALL_WAY`           | All-Way   |

### `roadType` — `RoadType`

| Value          | Label     |
| -------------- | --------- |
| `UNKNOWN_ROAD` | Unknown   |
| `HIGHWAY`      | Highway   |
| `CITY_ROAD`    | City Road |
| `PARK`         | Park      |

### `passageType` — `PassageType`

| Value             | Label    |
| ----------------- | -------- |
| `UNKNOWN_PASSAGE` | Unknown  |
| `ENTRANCE`        | Entrance |
| `EXIT`            | Exit     |

### `areaType` — `AreaType`

| Value         | Label       |
| ------------- | ----------- |
| `Driveable`   | Driveable   |
| `UnDriveable` | Undriveable |
| `Custom1`     | Custom 1    |
| `Custom2`     | Custom 2    |
| `Custom3`     | Custom 3    |

### `barrierGateType` — `BarrierGateType`

| Value         | Label       |
| ------------- | ----------- |
| `ROD`         | Rod         |
| `FENCE`       | Fence       |
| `ADVERTISING` | Advertising |
| `TELESCOPIC`  | Telescopic  |
| `OTHER`       | Other       |

## Functions

### `getEnumLabel(category, value): string`

```ts
export function getEnumLabel(category: EnumCategory, value: string): string {
  return REGISTRY[category][value] ?? value;
}
```

Behaviour:

- Hit → returns the label.
- Miss → returns the raw value (so a missing entry never blanks out the UI).

The signature accepts `string` (not `T extends string`) so newly-introduced proto enum values can pass through unmapped until i18n catches up.

### `withLabels(category, options)`

```ts
export function withLabels<T extends string>(
  category: EnumCategory,
  options: readonly T[],
): ReadonlyArray<{ value: T; label: string }>;
```

Projects an option list into Select-friendly `{ value, label }`:

```ts
const opts = withLabels('boundaryType', boundaryTypeOptions);
// → [{ value: 'DOTTED_YELLOW', label: 'Dotted Yellow' }, ...]
```

`options` typically comes from `src/lib/schemas.ts` (zod literal union), keeping schema, registry, and UI in lock-step.

## Internals

```ts
const REGISTRY: Record<EnumCategory, Readonly<Record<string, string>>> = {
  laneType,
  laneTurn,
  laneDirection,
  boundaryType,
  junctionType,
  signalType,
  signInfoType,
  subsignalType,
  stopSignType,
  roadType,
  passageType,
  areaType,
  barrierGateType,
};
```

Each sub-table is typed `Readonly<Record<V, string>>` — the compiler rejects a missing label.

## Side effects

- No IPC, no localStorage, no timers.
- Pure lookup.

## Test coverage

`src/lib/__tests__/enumLabels.test.ts`:

- Sample lookups in every category.
- Unknown value falls back to raw.
- `withLabels` shape check.

## Consumers

- `src/components/layout/panels/SchemaForm.tsx` — via `inspectorSchema.enumCategory`
- `src/types/inspectorSchema.ts` — `LaneInspectorSchema` declares `enumCategory`
- All Inspector forms (LaneForm / JunctionForm / …)

## Migration to i18n

```ts
// Today
const laneType: Dict<LaneType> = {
  NONE: 'None',
  CITY_DRIVING: 'City Driving',
  ...
};

// Future
const laneType: Dict<LaneType> = {
  NONE: t('enum.laneType.NONE'),
  CITY_DRIVING: t('enum.laneType.CITY_DRIVING'),
  ...
};
```

Call sites (`getEnumLabel('laneType', value)`) do not change.

## Source map

| Lines   | Content            |
| ------- | ------------------ |
| 14–28   | proto type imports |
| 30–43   | `EnumCategory`     |
| 47–55   | `laneType` dict    |
| 57–62   | `laneTurn`         |
| 64–68   | `laneDirection`    |
| 70–78   | `boundaryType`     |
| 80–87   | `junctionType`     |
| 89–96   | `signalType`       |
| 98–101  | `signInfoType`     |
| 103–112 | `subsignalType`    |
| 114–121 | `stopSignType`     |
| 123–128 | `roadType`         |
| 130–134 | `passageType`      |
| 136–142 | `areaType`         |
| 144–150 | `barrierGateType`  |
| 152–166 | `REGISTRY`         |
| 173–175 | `getEnumLabel`     |
| 178–183 | `withLabels`       |

## See also

- [`apollo` types](../types/apollo.md) — enum source types
- [`inspectorSchema`](../types/inspector-schema.md) — auto-renders `<Select>` via `enumCategory`
- `src/lib/schemas.ts` — `XXXOptions` arrays (zod literal unions)
