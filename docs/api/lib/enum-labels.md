# Enum Labels

> Source: `src/lib/enumLabels.ts`

## Overview

`enumLabels.ts` is the i18n hook-point for every Apollo proto-derived
enum that surfaces in the UI. The proto values (e.g. `'CITY_DRIVING'`,
`'MIX_3_VERTICAL'`) are the source of truth on the wire and inside Zod
schemas — but they are not what humans want to read. This module is
the single funnel that maps wire enum values to display strings:

```text
proto wire     →  schema (string union)  →  enumLabels.getEnumLabel  →  inspector dropdown
'CITY_DRIVING' →  'CITY_DRIVING'         →  'City Driving'           →  <SelectOption>
```

The categories match the **proto message** that owns the enum, not the
form-field name. The boundary type used by `Lane.left_boundary` and
`Lane.right_boundary` shares one entry (`boundaryType`) because both
sides reference `BoundaryLineType`.

::: tip i18n strategy
The current dictionary is hard-coded English. A future i18n layer
swaps the dictionary at runtime — call sites do not change.
`getEnumLabel` is the only function components use. See [/architecture
/state-management](/architecture/state-management) for status of the
i18n migration.
:::

## Exports

| Symbol         | Signature                                        | Purpose                                                  |
| -------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `EnumCategory` | union of 13 strings                              | Discriminator for the enum dictionary.                   |
| `getEnumLabel` | `(category, value) => string`                    | Resolve a display label, with fallback to the raw value. |
| `withLabels`   | `(category, options) => Array<{ value, label }>` | Build a Select-friendly options list.                    |

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

## Behavior

### Dictionary structure

Each category has a `Dict<V extends string>` map keyed by the wire
enum value. The dictionaries are private; `getEnumLabel(category, v)`
is the only access point. A central `REGISTRY` indexes by category:

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

### Fallback to raw value

```ts
export function getEnumLabel(category, value): string {
  return REGISTRY[category][value] ?? value;
}
```

A missing entry never blanks out the UI — the raw enum value renders.
This is intentional: a new proto value introduced upstream (and fed
through schemas) shows up in the UI as its raw token until a translator
adds an entry. Better than a silent empty `<option>`.

### `withLabels`

```ts
export function withLabels<T extends string>(category, options) {
  return options.map((value) => ({ value, label: getEnumLabel(category, value) }));
}
```

Inspector forms accept `{ value, label }[]` for `<Select>` /
`<RadioGroup>` widgets. `withLabels` is the bridge between a Zod
`z.enum([...])` option array (which is plain `string[]`) and the
labelled list.

## Dictionary contents

The complete per-category mapping (English):

### `laneType` (← `LaneType`)

| Value          | Label        |
| -------------- | ------------ |
| `NONE`         | None         |
| `CITY_DRIVING` | City Driving |
| `BIKING`       | Biking       |
| `SIDEWALK`     | Sidewalk     |
| `PARKING`      | Parking      |
| `SHOULDER`     | Shoulder     |
| `SHARED`       | Shared       |

### `laneTurn` (← `LaneTurn`)

| Value        | Label      |
| ------------ | ---------- |
| `NO_TURN`    | No Turn    |
| `LEFT_TURN`  | Left Turn  |
| `RIGHT_TURN` | Right Turn |
| `U_TURN`     | U-Turn     |

### `laneDirection` (← `LaneDirection`)

| Value         | Label         |
| ------------- | ------------- |
| `FORWARD`     | Forward       |
| `BACKWARD`    | Backward      |
| `BIDIRECTION` | Bidirectional |

### `boundaryType` (← `BoundaryLineType`)

| Value           | Label         |
| --------------- | ------------- |
| `UNKNOWN`       | Unknown       |
| `DOTTED_YELLOW` | Dotted Yellow |
| `DOTTED_WHITE`  | Dotted White  |
| `SOLID_YELLOW`  | Solid Yellow  |
| `SOLID_WHITE`   | Solid White   |
| `DOUBLE_YELLOW` | Double Yellow |
| `CURB`          | Curb          |

### `junctionType` (← `JunctionType`)

| Value        | Label       |
| ------------ | ----------- |
| `UNKNOWN`    | Unknown     |
| `IN_ROAD`    | In-Road     |
| `CROSS_ROAD` | Crossroad   |
| `FORK_ROAD`  | Fork        |
| `MAIN_SIDE`  | Main / Side |
| `DEAD_END`   | Dead End    |

### `signalType` (← `SignalType`)

| Value              | Label              |
| ------------------ | ------------------ |
| `UNKNOWN_SIGNAL`   | Unknown            |
| `MIX_2_HORIZONTAL` | 2-Light Horizontal |
| `MIX_2_VERTICAL`   | 2-Light Vertical   |
| `MIX_3_HORIZONTAL` | 3-Light Horizontal |
| `MIX_3_VERTICAL`   | 3-Light Vertical   |
| `SINGLE`           | Single             |

### `signInfoType` (← `SignInfoType`)

| Value                  | Label                |
| ---------------------- | -------------------- |
| `NO_RIGHT_TURN_ON_RED` | No Right Turn on Red |
| `None`                 | None                 |

### `subsignalType` (← `SubsignalType`)

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

### `stopSignType` (← `StopSignType`)

| Value               | Label     |
| ------------------- | --------- |
| `UNKNOWN_STOP_SIGN` | Unknown   |
| `ONE_WAY`           | One-Way   |
| `TWO_WAY`           | Two-Way   |
| `THREE_WAY`         | Three-Way |
| `FOUR_WAY`          | Four-Way  |
| `ALL_WAY`           | All-Way   |

### `roadType` (← `RoadType`)

| Value          | Label     |
| -------------- | --------- |
| `UNKNOWN_ROAD` | Unknown   |
| `HIGHWAY`      | Highway   |
| `CITY_ROAD`    | City Road |
| `PARK`         | Park      |

### `passageType` (← `PassageType`)

| Value             | Label    |
| ----------------- | -------- |
| `UNKNOWN_PASSAGE` | Unknown  |
| `ENTRANCE`        | Entrance |
| `EXIT`            | Exit     |

### `areaType` (← `AreaType`)

| Value         | Label       |
| ------------- | ----------- |
| `Driveable`   | Driveable   |
| `UnDriveable` | Undriveable |
| `Custom1`     | Custom 1    |
| `Custom2`     | Custom 2    |
| `Custom3`     | Custom 3    |

### `barrierGateType` (← `BarrierGateType`)

| Value         | Label       |
| ------------- | ----------- |
| `ROD`         | Rod         |
| `FENCE`       | Fence       |
| `ADVERTISING` | Advertising |
| `TELESCOPIC`  | Telescopic  |
| `OTHER`       | Other       |

## Examples

### Inspector form

```tsx
import { withLabels } from '@/lib/enumLabels';
import { laneTypeOptions } from '@/lib/schemas';

function LaneTypeSelect({ value, onChange }) {
  const options = withLabels('laneType', laneTypeOptions);
  return (
    <Select value={value} onValueChange={onChange}>
      {options.map(({ value, label }) => (
        <SelectItem key={value} value={value}>
          {label}
        </SelectItem>
      ))}
    </Select>
  );
}
```

### One-shot lookup

```ts
import { getEnumLabel } from '@/lib/enumLabels';

const tooltip = `Type: ${getEnumLabel('laneType', lane.type)}`;
```

### Future i18n swap (sketch)

```ts
// hypothetical i18n layer
import { useLocale } from '@/lib/i18n';

export function getEnumLabel(category, value) {
  const dict = useLocale().enums[category];
  return dict[value] ?? value;
}
```

The call site stays identical; only the dictionary lookup changes.

## Related

- [Schemas](./schemas.md) — Zod option arrays paired with these labels.
- [Entity Bridge — Enums](../io/proto-entity-bridge.md#enum-tables-enums-ts) —
  the wire-side numeric ↔ string mapping.
- [/api/core/elements](/api/core/elements) — element registry that
  declares which enums are inspectable per entity type.
