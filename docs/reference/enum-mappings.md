---
title: 枚举映射表
description: src/lib/enumLabels.ts 中所有 proto 枚举值的数值 / 字符串 / 人类可读 label 三向映射。
---

# 枚举映射表

本页是 `src/lib/enumLabels.ts` 中所有 Apollo 枚举的「数值 ↔ 字符串字面量 ↔
人类可读 label」三向对照表。任何 inspector 表单、命令面板项、状态栏展示文本
都通过 `getEnumLabel(category, value)` 查询，本页就是那张查表的可视化版本。

::: tip 三个 ID 系统

1. **Proto 数值**：wire 上的 varint 编码值，来源于 `src/proto/map_msgs/*.proto`。
2. **TS 字符串字面量**：`src/types/apollo.ts` 中的 string union，例如 `'CITY_DRIVING'`。
3. **人类可读 label**：UI 展示文本，来源于 `src/lib/enumLabels.ts:47-150`。

三者一一对应，不允许偏差；如需新增枚举值，三处都要同步修改。
:::

## 注册中心

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

::: warning 默认回退
当某个 value 在 dictionary 中找不到时，`getEnumLabel` 返回原始 value，**不**
返回空串。这避免了 UI 突然变空，但也意味着新增枚举不更新本表会出现「英文短码
泄漏」。务必同步本页与 `enumLabels.ts`。
:::

## Lane.LaneType

来源：`src/proto/map_msgs/map_lane.proto:70-78`，`src/types/apollo.ts:105-112`，`src/lib/enumLabels.ts:47-55`。

| Proto # | TS 字面量      | UI Label     |
| ------- | -------------- | ------------ |
| 1       | `NONE`         | None         |
| 2       | `CITY_DRIVING` | City Driving |
| 3       | `BIKING`       | Biking       |
| 4       | `SIDEWALK`     | Sidewalk     |
| 5       | `PARKING`      | Parking      |
| 6       | `SHOULDER`     | Shoulder     |
| 7       | `SHARED`       | Shared       |

## Lane.LaneTurn

来源：`src/proto/map_msgs/map_lane.proto:81-86`，`src/lib/enumLabels.ts:57-62`。

| Proto # | TS 字面量    | UI Label   |
| ------- | ------------ | ---------- |
| 1       | `NO_TURN`    | No Turn    |
| 2       | `LEFT_TURN`  | Left Turn  |
| 3       | `RIGHT_TURN` | Right Turn |
| 4       | `U_TURN`     | U-Turn     |

## Lane.LaneDirection

来源：`src/proto/map_msgs/map_lane.proto:98-102`，`src/lib/enumLabels.ts:64-68`。

| Proto # | TS 字面量     | UI Label      |
| ------- | ------------- | ------------- |
| 1       | `FORWARD`     | Forward       |
| 2       | `BACKWARD`    | Backward      |
| 3       | `BIDIRECTION` | Bidirectional |

## LaneBoundaryType.Type

来源：`src/proto/map_msgs/map_lane.proto:8-22`，`src/lib/enumLabels.ts:70-78`。

| Proto # | TS 字面量       | UI Label      |
| ------- | --------------- | ------------- |
| 0       | `UNKNOWN`       | Unknown       |
| 1       | `DOTTED_YELLOW` | Dotted Yellow |
| 2       | `DOTTED_WHITE`  | Dotted White  |
| 3       | `SOLID_YELLOW`  | Solid Yellow  |
| 4       | `SOLID_WHITE`   | Solid White   |
| 5       | `DOUBLE_YELLOW` | Double Yellow |
| 6       | `CURB`          | Curb          |

## Junction.Type

来源：`src/proto/map_msgs/map_junction.proto:15-22`，`src/lib/enumLabels.ts:80-87`。

| Proto # | TS 字面量    | UI Label    |
| ------- | ------------ | ----------- |
| 0       | `UNKNOWN`    | Unknown     |
| 1       | `IN_ROAD`    | In-Road     |
| 2       | `CROSS_ROAD` | Crossroad   |
| 3       | `FORK_ROAD`  | Fork        |
| 4       | `MAIN_SIDE`  | Main / Side |
| 5       | `DEAD_END`   | Dead End    |

## Signal.Type

来源：`src/proto/map_msgs/map_signal.proto:38-45`，`src/lib/enumLabels.ts:89-96`。

| Proto # | TS 字面量          | UI Label           |
| ------- | ------------------ | ------------------ |
| 1       | `UNKNOWN_SIGNAL`   | Unknown            |
| 2       | `MIX_2_HORIZONTAL` | 2-Light Horizontal |
| 3       | `MIX_2_VERTICAL`   | 2-Light Vertical   |
| 4       | `MIX_3_HORIZONTAL` | 3-Light Horizontal |
| 5       | `MIX_3_VERTICAL`   | 3-Light Vertical   |
| 6       | `SINGLE`           | Single             |

## SignInfo.Type

来源：`src/proto/map_msgs/map_signal.proto:28-35`，`src/lib/enumLabels.ts:98-101`。

| Proto # | TS 字面量              | UI Label             |
| ------- | ---------------------- | -------------------- |
| 0       | `None`                 | None                 |
| 1       | `NO_RIGHT_TURN_ON_RED` | No Right Turn on Red |

## Subsignal.Type

来源：`src/proto/map_msgs/map_signal.proto:10-19`，`src/lib/enumLabels.ts:103-112`。

| Proto # | TS 字面量                 | UI Label            |
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

来源：`src/proto/map_msgs/map_stop_sign.proto:17-25`，`src/lib/enumLabels.ts:114-121`。

| Proto # | TS 字面量           | UI Label  |
| ------- | ------------------- | --------- |
| 0       | `UNKNOWN_STOP_SIGN` | Unknown   |
| 1       | `ONE_WAY`           | One-Way   |
| 2       | `TWO_WAY`           | Two-Way   |
| 3       | `THREE_WAY`         | Three-Way |
| 4       | `FOUR_WAY`          | Four-Way  |
| 5       | `ALL_WAY`           | All-Way   |

## Road.Type

来源：`src/proto/map_msgs/map_road.proto:57-63`，`src/lib/enumLabels.ts:123-128`。

| Proto # | TS 字面量      | UI Label  |
| ------- | -------------- | --------- |
| 0       | `UNKNOWN_ROAD` | Unknown   |
| 1       | `HIGHWAY`      | Highway   |
| 2       | `CITY_ROAD`    | City Road |
| 3       | `PARK`         | Park      |

## Passage.Type

来源：`src/proto/map_msgs/map_pnc_junction.proto:16-21`，`src/lib/enumLabels.ts:130-134`。

| Proto # | TS 字面量         | UI Label |
| ------- | ----------------- | -------- |
| 0       | `UNKNOWN_PASSAGE` | Unknown  |
| 1       | `ENTRANCE`        | Entrance |
| 2       | `EXIT`            | Exit     |

## Area.Type

来源：`src/proto/map_msgs/map_area.proto:9-15`，`src/lib/enumLabels.ts:136-142`。

| Proto # | TS 字面量     | UI Label    |
| ------- | ------------- | ----------- |
| 1       | `Driveable`   | Driveable   |
| 2       | `UnDriveable` | Undriveable |
| 3       | `Custom1`     | Custom 1    |
| 4       | `Custom2`     | Custom 2    |
| 5       | `Custom3`     | Custom 3    |

## BarrierGate.BarrierGateType

来源：`src/proto/map_msgs/map_barrier_gate.proto:9-15`，`src/lib/enumLabels.ts:144-150`。

| Proto # | TS 字面量     | UI Label    |
| ------- | ------------- | ----------- |
| 1       | `ROD`         | Rod         |
| 2       | `FENCE`       | Fence       |
| 3       | `ADVERTISING` | Advertising |
| 4       | `TELESCOPIC`  | Telescopic  |
| 5       | `OTHER`       | Other       |

## BoundaryEdge.Type

来源：`src/proto/map_msgs/map_road.proto:10-16`。

::: tip 该枚举不在 `enumLabels.ts` 中
当前 BoundaryEdge.Type 只在 round-trip 中流转，UI 不展示。如需展示，请按本表
新增 dictionary 条目。
:::

| Proto # | TS 字面量        |
| ------- | ---------------- |
| 0       | `UNKNOWN`        |
| 1       | `NORMAL`         |
| 2       | `LEFT_BOUNDARY`  |
| 3       | `RIGHT_BOUNDARY` |

## EntityMeta.GeometryKind（编辑器扩展）

来源：`src/proto/editor/editor_meta.proto:33-37`。仅供编辑器消费。

| Proto # | TS 字面量                   |
| ------- | --------------------------- |
| 0       | `GEOMETRY_KIND_UNSPECIFIED` |
| 1       | `LINESTRING`                |
| 2       | `POLYGON`                   |

## 用法示例

```ts
import { getEnumLabel, withLabels } from '@/lib/enumLabels';

// 取人类可读 label
getEnumLabel('laneType', 'CITY_DRIVING');
// → 'City Driving'

// 构造下拉框选项
const options = withLabels('laneTurn', ['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN']);
// → [
//     { value: 'NO_TURN',     label: 'No Turn' },
//     { value: 'LEFT_TURN',   label: 'Left Turn' },
//     { value: 'RIGHT_TURN',  label: 'Right Turn' },
//     { value: 'U_TURN',      label: 'U-Turn' },
//   ]
```

## 枚举值个数小结

| Category          | 数量 | 备注         |
| ----------------- | ---- | ------------ |
| `laneType`        | 7    | proto 数 1–7 |
| `laneTurn`        | 4    | proto 数 1–4 |
| `laneDirection`   | 3    | proto 数 1–3 |
| `boundaryType`    | 7    | proto 数 0–6 |
| `junctionType`    | 6    | proto 数 0–5 |
| `signalType`      | 6    | proto 数 1–6 |
| `signInfoType`    | 2    | proto 数 0–1 |
| `subsignalType`   | 8    | proto 数 1–8 |
| `stopSignType`    | 6    | proto 数 0–5 |
| `roadType`        | 4    | proto 数 0–3 |
| `passageType`     | 3    | proto 数 0–2 |
| `areaType`        | 5    | proto 数 1–5 |
| `barrierGateType` | 5    | proto 数 1–5 |

## 维护守则

1. **三方同步**：新增 / 改名 / 删除任何枚举值时，必须改 `.proto`、`apollo.ts`、`enumLabels.ts` 三处。
2. **保留旧值**：禁止重排 proto 字段编号；删除字段必须使用 `reserved`。
3. **本表必须更新**：本页是 PR review 的 checklist；reviewer 看不到对应行就 reject。
4. **fallback 风险**：`getEnumLabel` 在缺失时回退 raw value，UI 不会崩溃但会泄漏短码——不要依赖这个行为，而要补全 dictionary。

## 相关文档

- [Proto Schema](/reference/proto-schema)
- [Apollo Types](/reference/apollo-types)
- [Inspector 系统](/architecture/inspector-system)
- [Derive Engine](/architecture/derive-engine)
- [架构总览](/architecture/overview)
