---
title: enumLabels — proto 枚举显示名注册表
description: Apollo proto 枚举值（CITY_DRIVING/MIX_3_VERTICAL）→ 人类可读标签 的统一字典；i18n 抓手。
---

# `enumLabels` — proto 枚举显示名注册表

> 源码：`src/lib/enumLabels.ts` · 184 行 · 13 个枚举类别 · 无副作用纯查表

## 用途

Apollo proto 的枚举值（`CITY_DRIVING`、`MIX_3_VERTICAL`、`DOTTED_YELLOW`...）是 wire / zod schema 的真值，但 UI 需要人类可读的标签（"City Driving"、"3-Light Vertical"、"Dotted Yellow"）。

`enumLabels` 是这个映射的唯一字典。组件调用 `getEnumLabel(category, value)` 拿标签；将来切换到 i18next 时只需要把 `REGISTRY` 替换为 i18n 键，调用点不动。

类别（`EnumCategory`）按 **proto 消息归属** 而非表单字段名命名 —— 同一个 `BoundaryLineType` 被 `Lane.left` 和 `Lane.right` 共享，注册一次即可。

## 公共 API

| 符号           | 类型  | 签名                                                               | 摘要                   |
| -------------- | ----- | ------------------------------------------------------------------ | ---------------------- |
| `EnumCategory` | union | 13 个字符串                                                        | 类别枚举               |
| `getEnumLabel` | fn    | `(category, value) => string`                                      | 查标签；缺失回退到原值 |
| `withLabels`   | fn    | `<T>(category, options) => readonly { value: T, label: string }[]` | 给 `<Select>` 用的便捷 |

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

## 详细类别一览

下表汇总每个类别下的枚举值与显示名（按源码顺序）。

### `laneType` — 来自 `LaneType`

| 枚举值         | 标签         |
| -------------- | ------------ |
| `NONE`         | None         |
| `CITY_DRIVING` | City Driving |
| `BIKING`       | Biking       |
| `SIDEWALK`     | Sidewalk     |
| `PARKING`      | Parking      |
| `SHOULDER`     | Shoulder     |
| `SHARED`       | Shared       |

### `laneTurn` — `LaneTurn`

| 值           | 标签       |
| ------------ | ---------- |
| `NO_TURN`    | No Turn    |
| `LEFT_TURN`  | Left Turn  |
| `RIGHT_TURN` | Right Turn |
| `U_TURN`     | U-Turn     |

### `laneDirection` — `LaneDirection`

| 值            | 标签          |
| ------------- | ------------- |
| `FORWARD`     | Forward       |
| `BACKWARD`    | Backward      |
| `BIDIRECTION` | Bidirectional |

### `boundaryType` — `BoundaryLineType`

| 值              | 标签          |
| --------------- | ------------- |
| `UNKNOWN`       | Unknown       |
| `DOTTED_YELLOW` | Dotted Yellow |
| `DOTTED_WHITE`  | Dotted White  |
| `SOLID_YELLOW`  | Solid Yellow  |
| `SOLID_WHITE`   | Solid White   |
| `DOUBLE_YELLOW` | Double Yellow |
| `CURB`          | Curb          |

### `junctionType` — `JunctionType`

| 值           | 标签        |
| ------------ | ----------- |
| `UNKNOWN`    | Unknown     |
| `IN_ROAD`    | In-Road     |
| `CROSS_ROAD` | Crossroad   |
| `FORK_ROAD`  | Fork        |
| `MAIN_SIDE`  | Main / Side |
| `DEAD_END`   | Dead End    |

### `signalType` — `SignalType`

| 值                 | 标签               |
| ------------------ | ------------------ |
| `UNKNOWN_SIGNAL`   | Unknown            |
| `MIX_2_HORIZONTAL` | 2-Light Horizontal |
| `MIX_2_VERTICAL`   | 2-Light Vertical   |
| `MIX_3_HORIZONTAL` | 3-Light Horizontal |
| `MIX_3_VERTICAL`   | 3-Light Vertical   |
| `SINGLE`           | Single             |

### `signInfoType` — `SignInfoType`

| 值                     | 标签                 |
| ---------------------- | -------------------- |
| `NO_RIGHT_TURN_ON_RED` | No Right Turn on Red |
| `None`                 | None                 |

### `subsignalType` — `SubsignalType`

| 值                        | 标签                |
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

| 值                  | 标签      |
| ------------------- | --------- |
| `UNKNOWN_STOP_SIGN` | Unknown   |
| `ONE_WAY`           | One-Way   |
| `TWO_WAY`           | Two-Way   |
| `THREE_WAY`         | Three-Way |
| `FOUR_WAY`          | Four-Way  |
| `ALL_WAY`           | All-Way   |

### `roadType` — `RoadType`

| 值             | 标签      |
| -------------- | --------- |
| `UNKNOWN_ROAD` | Unknown   |
| `HIGHWAY`      | Highway   |
| `CITY_ROAD`    | City Road |
| `PARK`         | Park      |

### `passageType` — `PassageType`

| 值                | 标签     |
| ----------------- | -------- |
| `UNKNOWN_PASSAGE` | Unknown  |
| `ENTRANCE`        | Entrance |
| `EXIT`            | Exit     |

### `areaType` — `AreaType`

| 值            | 标签        |
| ------------- | ----------- |
| `Driveable`   | Driveable   |
| `UnDriveable` | Undriveable |
| `Custom1`     | Custom 1    |
| `Custom2`     | Custom 2    |
| `Custom3`     | Custom 3    |

### `barrierGateType` — `BarrierGateType`

| 值            | 标签        |
| ------------- | ----------- |
| `ROD`         | Rod         |
| `FENCE`       | Fence       |
| `ADVERTISING` | Advertising |
| `TELESCOPIC`  | Telescopic  |
| `OTHER`       | Other       |

## 函数详解

### `getEnumLabel(category, value): string`

```ts
export function getEnumLabel(category: EnumCategory, value: string): string {
  return REGISTRY[category][value] ?? value;
}
```

行为：

- 命中 → 返回标签
- 未命中 → 返回原 value（保险，UI 不会变成空白）

签名故意接 `string` 而非 `T extends string`——给容忍未知值（升级 proto 时新增的枚举值在 i18n 跟上之前能"原样显示"）。

### `withLabels(category, options)`

```ts
export function withLabels<T extends string>(
  category: EnumCategory,
  options: readonly T[],
): ReadonlyArray<{ value: T; label: string }>;
```

把一组 enum option 投影到 `<Select>` 友好的形态：

```ts
const opts = withLabels('boundaryType', boundaryTypeOptions);
// → [{ value: 'DOTTED_YELLOW', label: 'Dotted Yellow' }, ...]
```

`options` 通常来自 `src/lib/schemas.ts`（zod literal union）——保持 schema、register、UI 三处同步。

## 内部实现

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

13 个 `Dict<V extends string>` 子表，每个子表是 `Readonly<Record<V, string>>`——TS 编译期保证每个枚举值都有标签。

## 副作用

- 无 IPC、无 LS、无定时器
- 纯查表

## 测试覆盖

`src/lib/__tests__/enumLabels.test.ts`：

- 每个 category 下随机抽样验证标签
- 未知值回退到原值
- `withLabels` 返回正确形态

## 调用方

- `src/components/layout/panels/SchemaForm.tsx` — 通过 `inspectorSchema.enumCategory` 间接调用
- `src/types/inspectorSchema.ts` — `LaneInspectorSchema` 中 `enumCategory` 字段
- 各 Inspector form（LaneForm/JunctionForm/...）

## 升级路径（i18n）

```ts
// 现在
const laneType: Dict<LaneType> = {
  NONE: 'None',
  CITY_DRIVING: 'City Driving',
  ...
};

// 未来
const laneType: Dict<LaneType> = {
  NONE: t('enum.laneType.NONE'),
  CITY_DRIVING: t('enum.laneType.CITY_DRIVING'),
  ...
};
```

调用站点（`getEnumLabel('laneType', value)`）不动。

## 源码索引

| 行      | 内容              |
| ------- | ----------------- |
| 14–28   | proto 类型 import |
| 30–43   | `EnumCategory`    |
| 47–55   | `laneType` 字典   |
| 57–62   | `laneTurn`        |
| 64–68   | `laneDirection`   |
| 70–78   | `boundaryType`    |
| 80–87   | `junctionType`    |
| 89–96   | `signalType`      |
| 98–101  | `signInfoType`    |
| 103–112 | `subsignalType`   |
| 114–121 | `stopSignType`    |
| 123–128 | `roadType`        |
| 130–134 | `passageType`     |
| 136–142 | `areaType`        |
| 144–150 | `barrierGateType` |
| 152–166 | `REGISTRY`        |
| 173–175 | `getEnumLabel`    |
| 178–183 | `withLabels`      |

## 参见

- [`apollo` 类型](../types/apollo.md) —— 枚举源类型
- [`inspectorSchema`](../types/inspector-schema.md) —— 通过 `enumCategory` 自动渲染 `<Select>`
- `src/lib/schemas.ts` —— 各枚举的 `XXXOptions` 数组（zod literal union）
