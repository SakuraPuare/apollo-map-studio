---
title: types/entities — MapEntity union 与绘图原语类型
description: GeoPoint / 6 种绘图原语 / Apollo 实体 re-export / MapEntity 主 union；编辑器内部唯一类型来源。
---

# `types/entities` — MapEntity union 与绘图原语类型

> 源码：`src/types/entities.ts` · 126 行

## 用途

`types/entities` 是编辑器内部 **唯一** 的实体类型出口。它做三件事：

1. 定义 6 种绘图原语（FSM 中正在画的临时形状）
2. Re-export 来自 `types/apollo.ts` 的 Apollo HD Map 类型
3. 联合两者得到主 union `MapEntity`

`MapEntity` 是 `mapStore.entities` 的元素类型，也是 `entityOps`、`geoJsonHelpers`、`useHotLayer` 等所有"操作实体"模块的输入类型。

## 公共 API

| 符号                                                                                                  | 类型                        | 摘要                                       |
| ----------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| `GeoPoint`                                                                                            | interface                   | `{ x: lng, y: lat, z? }`                   |
| `BezierAnchorData`                                                                                    | interface                   | 持久态贝塞尔锚点                           |
| `PolylineEntity` / `CatmullRomEntity` / `BezierEntity` / `ArcEntity` / `RectEntity` / `PolygonEntity` | interface                   | 6 种绘图原语                               |
| `DrawingEntity`                                                                                       | union                       | 6 种原语的 union                           |
| `MapEntity`                                                                                           | union                       | `DrawingEntity \| ApolloEntity`            |
| `PointENU`                                                                                            | type alias **(deprecated)** | `GeoPoint` 别名                            |
| Apollo 类型 re-export                                                                                 | type                        | 从 `./apollo` 拉的全部 Apollo 类型（见下） |

## 详细条目

### `interface GeoPoint`

```ts
export interface GeoPoint {
  x: number; // longitude
  y: number; // latitude
  z?: number;
}
```

**编辑器全程使用 WGS84 经纬度**——`x` 是经度（可为负，-180 ~ 180），`y` 是纬度（-90 ~ 90），`z` 仅在保留高程数据的场景使用，UI 一般忽略。

### `type PointENU` _(deprecated)_

```ts
/** @deprecated 使用 GeoPoint */
export type PointENU = GeoPoint;
```

历史命名兼容——Apollo proto 名字叫 ENU，但编辑器实际上是 lng/lat。新代码直接用 `GeoPoint`。

### `interface BezierAnchorData`

```ts
export interface BezierAnchorData {
  point: PointENU;
  handleIn: PointENU | null;
  handleOut: PointENU | null;
}
```

**持久态** 贝塞尔锚点——`null` 表示该侧无控制柄（端点 / 角点）。runtime 形态在 `core/geometry/interpolate` 的 `BezierAnchor`，转换函数在 `core/geometry/anchorConvert`。

### 6 种绘图原语

```ts
export interface PolylineEntity {
  id: string;
  entityType: 'polyline';
  points: PointENU[];
}

export interface CatmullRomEntity {
  id: string;
  entityType: 'catmullRom';
  points: PointENU[];
}

export interface BezierEntity {
  id: string;
  entityType: 'bezier';
  anchors: BezierAnchorData[];
}

export interface ArcEntity {
  id: string;
  entityType: 'arc';
  start: PointENU;
  mid: PointENU;
  end: PointENU;
}

export interface RectEntity {
  id: string;
  entityType: 'rect';
  p1: PointENU;
  p2: PointENU;
  rotation: number; // 绕中心，弧度
}

export interface PolygonEntity {
  id: string;
  entityType: 'polygon';
  points: PointENU[];
}
```

设计要点：

- 每个原语都有 `id` —— 进入 `mapStore.entities` 后用 id 寻址（即使是 mid-draw 临时实体）
- `entityType` 是字面量类型 —— TS 自动 narrow union
- 字段命名与 Apollo 实体故意 _不_ 冲突——`points` 用于 polyline / polygon / catmull-rom，但 `LaneEntity` 的几何字段叫 `centralCurve`、`leftBoundary` 等，绝无重叠

### `type DrawingEntity`

```ts
export type DrawingEntity =
  | PolylineEntity
  | CatmullRomEntity
  | BezierEntity
  | ArcEntity
  | RectEntity
  | PolygonEntity;
```

被 `entityOps/typeGuards.ts` 的 `isDrawingEntity` 守卫识别（基于 `DRAWING_TYPES` set）。

### Apollo re-export

```ts
export type {
  ApolloEntity,
  ApolloEntityType,
  ApolloMapProto,
  ApolloPolygon,
  AreaEntity,
  AreaType,
  BarrierGateEntity,
  BarrierGateType,
  BoundaryEdge,
  BoundaryPolygon,
  BoundaryLineType,
  ClearAreaEntity,
  CrosswalkEntity,
  Curve,
  CurveSegment,
  JunctionEntity,
  JunctionType,
  LaneBoundary,
  LaneBoundaryTypeEntry,
  LaneDirection,
  LaneEntity,
  LaneSampleAssociation,
  LaneTurn,
  LaneType,
  LineSegment,
  ObjectOverlapInfo,
  OverlapEntity,
  ParkingLotEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  RoadBoundary,
  RoadEntity,
  RoadSection,
  RoadType,
  RSUEntity,
  SignalEntity,
  SignalType,
  SpeedBumpEntity,
  SpeedControlEntity,
  StopSignEntity,
  StopSignType,
  Subsignal,
  SubsignalType,
  YieldSignEntity,
} from './apollo';
```

**单一入口** —— UI 应该从 `@/types/entities` import 所有类型（包括 Apollo 类型），而不是直接 `@/types/apollo`。这样未来如果重构 Apollo 类型的导出名 / 拆分文件，只需要修这一处。

### `type MapEntity` —— 主 union

```ts
import type { ApolloEntity } from './apollo';

export type MapEntity = DrawingEntity | ApolloEntity;
```

`mapStore.entities` 的 value 类型。

#### 在 narrow 中的使用

```ts
function describe(e: MapEntity) {
  switch (e.entityType) {
    case 'polyline':
      return `Polyline with ${e.points.length} points`;
    case 'lane':
      return `Lane ${e.id} length=${e.length ?? '?'}m`;
    case 'rect':
      return `Rect rotation=${e.rotation.toFixed(2)}rad`;
    // ... TS 强制穷举（exhaustiveness check）
  }
}
```

字面量 `entityType` 的判别 union 让 TS 在 switch 里自动 narrow 到具体子类型，访问 `e.points` / `e.length` / `e.rotation` 都不需要 cast。

### `entityType` 总枚举

绘图：`polyline | catmullRom | bezier | arc | rect | polygon`

Apollo：`lane | junction | parkingSpace | parkingLot | signal | crosswalk | stopSign | speedBump | yieldSign | clearArea | road | overlap | pncJunction | barrierGate | rsu | area | speedControl`

共 23 种。FSM `editorMachine.ts` 的 draw 状态、`idGenerator` 的 prefix 表都基于这一组字面量。

## 副作用

无 —— 纯类型文件。

## 测试覆盖

无独立测试；类型契约由 TypeScript 编译期保证。

## 调用方

几乎所有非 proto-direct 模块：

- `src/store/mapStore.ts` — entities Map 元素
- `src/lib/entityOps/*.ts` — 输入类型
- `src/lib/geoJsonHelpers.ts` — `entityToHotFeatures(entity: MapEntity)`
- `src/hooks/useDrawCommit.ts` — FSM CONFIRM 创建 entity
- 所有 Inspector form

## 源码索引

| 行      | 内容                    |
| ------- | ----------------------- |
| 1–6     | `GeoPoint` / `PointENU` |
| 11–16   | `BezierAnchorData`      |
| 18–22   | `PolylineEntity`        |
| 24–30   | `CatmullRomEntity`      |
| 32–37   | `BezierEntity`          |
| 39–46   | `ArcEntity`             |
| 48–55   | `RectEntity`            |
| 57–62   | `PolygonEntity`         |
| 65–111  | Apollo re-export        |
| 113     | `import ApolloEntity`   |
| 116–122 | `DrawingEntity`         |
| 125     | `MapEntity`             |

## 参见

- [`apollo`](./apollo.md) —— Apollo proto 类型源
- [`editor`](./editor.md) —— `DragPointType`
- [`entityOps`](../lib/entity-ops.md) —— `MapEntity` 的核心操作
- `core/fsm/editorMachine.ts` —— 绘图原语对应的 FSM 状态
