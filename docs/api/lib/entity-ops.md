---
title: entityOps — Apollo proto 反腐层
description: UI 与 Apollo proto 域之间的唯一适配层；包含编辑、级联删除、reparent、类型守卫四组操作。
---

# `entityOps` — Apollo proto 反腐层（Anti-Corruption Layer）

> 源码：`src/lib/entityOps.ts`（barrel） + `src/lib/entityOps/{edit,typeGuards,cascadeDeleteRefs,reparent}.ts`

## 用途

`entityOps` 是 R2 反腐层的唯一公开入口（参见 `ARCHITECTURE.md` "Anti-corruption layer (R2)"）。Apollo proto 类型住在 `src/types/apollo.ts`，几何编译器住在 `src/core/geometry/apolloCompile.ts`。如果 UI 直接 import 这俩，proto 升级（v2、字段重命名）会级联到所有触碰 `ApolloEntity` 的组件。

`entityOps` 把所有 proto-aware 操作收敛到一个模块，UI 只 import `@/lib/entityOps`，永远不直接 import `@/core/geometry/apolloCompile`。

审计入口：

```bash
git grep "from '@/core/geometry/apolloCompile'" -- 'src/components/**' 'src/hooks/**'
```

非空结果 = 新泄漏，PR 阻塞修复。

## 模块拆分

```
entityOps.ts                  ← public barrel; 仅做 re-export
├── entityOps/edit.ts         ← getEditPoints/setEditPoint/createEntity/...
├── entityOps/typeGuards.ts   ← isApolloEntityType/isAreaEntity/isDrawingEntity/...
├── entityOps/cascadeDeleteRefs.ts ← 删除时清理外键
└── entityOps/reparent.ts     ← lane/road/rsu 改父
```

barrel 仅 12 个 re-export 语句；实际逻辑全在 4 个子模块。

## 公共 API 一览

### Edit (`entityOps/edit.ts`)

| 符号               | 类型 | 签名                                                                 | 摘要                                                  |
| ------------------ | ---- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| `getEditPoints`    | fn   | `(entity: MapEntity) => GeoPoint[]`                                  | 取当前实体的可拖拽控制点序列                          |
| `setEditPoint`     | fn   | `(entity, index, point) => MapEntity`                                | 改单个控制点，触发派生                                |
| `setAllEditPoints` | fn   | `(entity, points: GeoPoint[]) => MapEntity`                          | 一次性替换全部控制点                                  |
| `moveEntity`       | fn   | `(entity, dx, dy) => MapEntity`                                      | 平移整个实体                                          |
| `deleteVertex`     | fn   | `(entity, index) => MapEntity \| null`                               | 删一个顶点；可能让实体降级到 null（点数不够）         |
| `compileEntity`    | fn   | `(entity) => GeoJSON.Feature[]`                                      | 编译为 cold/hot 层使用的 Feature 列表                 |
| `createEntity`     | fn   | `(elementType, drawTool, points, anchors, options?) => ApolloEntity` | FSM CONFIRM 时调用                                    |
| `entityCoords`     | fn   | `(entity) => LngLat[]`                                               | 实体的核心坐标序列（centerline / centroid / corners） |

### Type guards (`entityOps/typeGuards.ts`)

| 符号                  | 类型 | 签名                                  | 摘要                                |
| --------------------- | ---- | ------------------------------------- | ----------------------------------- |
| `isDrawingEntity`     | fn   | `(entity) => entity is DrawingEntity` | 是否绘图原语（polyline/bezier/...） |
| `isApolloEntityType`  | fn   | `(entity) => entity is ApolloEntity`  | 是否 Apollo 实体                    |
| `isAreaEntity`        | fn   | `(entity) => boolean`                 | 是否区域实体（hitTest 用）          |
| `isPolygonEditEntity` | fn   | `(entity) => boolean`                 | editPoints 是否闭合环（hot 层选择） |

### Cascade delete (`entityOps/cascadeDeleteRefs.ts`)

| 符号                    | 类型 | 签名                                               | 摘要                          |
| ----------------------- | ---- | -------------------------------------------------- | ----------------------------- |
| `cascadeDeleteRefsFull` | fn   | `(removedIds, allEntities) => CascadeDeleteResult` | 完整结果（含 cascadeRemoved） |
| `CascadeDeleteResult`   | type | `{changes, cascadeRemoved}`                        | 删除后 patch + 级联移除集合   |

### Reparent (`entityOps/reparent.ts`)

| 符号             | 类型      | 签名                                             | 摘要                                      |
| ---------------- | --------- | ------------------------------------------------ | ----------------------------------------- |
| `ParentTarget`   | union     | 见下                                             | `junction \| road \| roadSection \| none` |
| `ReparentResult` | interface | `{changes, rejected?}`                           | 改父后的 patch + 拒绝原因                 |
| `reparent`       | fn        | `(child, target, allEntities) => ReparentResult` | 执行 reparent                             |
| `canReparent`    | fn        | `(child, target, allEntities) => boolean`        | 干跑预览，给 DragOver UI 用               |

## 详细条目

### `getEditPoints(entity)`

```ts
function getEditPoints(entity: MapEntity): GeoPoint[];
```

- 绘图原语（polyline/catmullRom/polygon）→ `entity.points`
- bezier → `entity.anchors.map(a => a.point)`
- arc → `[start, mid, end]`
- rect → `[p1, p2]`
- Apollo 实体 → 委托给 `getApolloEditPoints`（按 entityType 分支）

文件位置：`entityOps/edit.ts:19-35`。

### `setEditPoint(entity, index, point)` / `setAllEditPoints`

仅对 Apollo 实体生效。绘图原语返回原对象（绘图原语在 mid-draw 走 FSM 自有路径，不进 store）。

每次改点都会调用 `applyDerive(next, { cause: 'editGeometry', prev: entity })`——把派生规则（lane.length, leftSamples 重采样等）重新应用，遵守 `_userOverrides` 不覆盖手改值。

文件位置：`entityOps/edit.ts:37-51`。

### `moveEntity(entity, dx, dy)`

平移所有顶点 `(dx, dy)`，触发 `applyDerive`。`dx`/`dy` 是经纬度增量；调用方负责把屏幕拖拽换算成度。

### `deleteVertex(entity, index)`

仅 Apollo 实体生效。删除后实体可能不再合法（lane 中心线 < 2 点），返回 `null`——调用方收到 null 应级联删除整个实体。

### `compileEntity(entity)`

把一个实体编译成 cold layer 用的 GeoJSON Feature 序列：lane → centerline + boundaries + arrows + ID label；junction → polygon + label。绘图原语返回 `[]`（hot 层自己处理）。

### `createEntity(elementType, drawTool, points, anchors, options?)`

FSM CONFIRM 后由 `useDrawCommit` 调用：

```ts
createEntity(
  elementType, // 'lane' | 'crosswalk' | ...
  drawTool, // 'drawPolyline' | 'drawBezier' | ...
  drawPoints, // FSM 累积的点
  drawAnchors, // bezier 锚点
  { laneHalfWidth, entities }, // 可选，用于宽度默认 + ID 自增
);
```

返回的实体已经走过 `applyDerive(_, { cause: 'create' })`——所有派生字段已就绪。

文件位置：`entityOps/edit.ts:76-85`。

### `entityCoords(entity)`

实体的"主线"坐标——lane → centralCurve；rect → 4 角；polygon → ring。给 hitTest / 工具提示用。

### `cascadeDeleteRefsFull(removedIds, allEntities)`

删除一个或多个实体时，需要清理：

1. 其他实体上的外键（`predecessorIds`、`successorIds`、`overlapIds`、`junctionId`、`road.sections[].laneIds`...）
2. 现在已无意义的 Overlap 实体（`objects.length < 2`）

```ts
interface CascadeDeleteResult {
  changes: Map<string, MapEntity>; // 需要 patch 的实体
  cascadeRemoved: Set<string>; // 额外删除的实体 ID（孤儿 overlap）
}
```

实现步骤：

1. 遍历 `allEntities`，每个实体调用 `patchOne(e, removed, cascadeRemoved)`。
2. `patchOne` 按 entityType 分发到 `cleanupLane` / `cleanupRoad` / `cleanupPNCJunction` / Overlap 的 `decideOverlap`。
3. Overlap 的 `objects.filter(o => !removed.has(o.objectId))` 后剩余 < 2 个 → cascade 删除 → 加入 `cascadeRemoved`。
4. 第二轮把 `cascadeRemoved` 也当作"被删除集合"再扫一遍 `overlapIds`，清理被新发现的孤儿。

文件位置：`entityOps/cascadeDeleteRefs.ts:135-154`。

### `reparent(child, target, allEntities)` / `ParentTarget`

```ts
type ParentTarget =
  | { kind: 'junction'; id: string }
  | { kind: 'road'; id: string }
  | { kind: 'roadSection'; roadId: string; sectionId: string }
  | { kind: 'none' };
```

合法的（child kind, target kind）组合在 `HANDLERS` map 里：

| child  | target        | handler                   |
| ------ | ------------- | ------------------------- |
| `lane` | `junction`    | `handleLaneToJunction`    |
| `lane` | `road`        | `handleLaneToRoad`        |
| `lane` | `roadSection` | `handleLaneToRoadSection` |
| `lane` | `none`        | `handleLaneToNone`        |
| `road` | `junction`    | `handleRoadToJunction`    |
| `road` | `none`        | `handleRoadToNone`        |
| `rsu`  | `junction`    | `handleRsuToJunction`     |
| `rsu`  | `none`        | `handleRsuToNone`         |

非法组合返回 `{ changes: Map(), rejected: '...' }`。

返回值：

```ts
interface ReparentResult {
  changes: Map<string, MapEntity>; // child + 旧 parent + 新 parent 的 patch
  rejected?: string; // 拒绝原因（'target is not a junction' 等）
}
```

#### Lane → Road（隐式 RoadSection）

```ts
function handleLaneToRoad(child, target, allEntities): ReparentResult {
  const road = allEntities.get(target.id);
  if (road?.entityType !== 'road') return rejected('target is not a road');
  const sectionId = road.sections[0]?.id ?? `${road.id}_s0`;
  return reparent(child, { kind: 'roadSection', roadId: road.id, sectionId }, allEntities);
}
```

把 lane 拽到 road 上 = 拽到该 road 的第 0 个 section。若 road 还没有 section，自动用 `${roadId}_s0` 创建。

#### Lane → RoadSection（核心 lane 移动）

`handleLaneToRoadSection` 是最长的 handler：

1. 若 lane 之前在 junction 里，先清掉 `junctionId`。
2. 在新 section 的 `laneIds` 里 push（已存在则 `alreadyThere`）。
3. 在该 road 的其他 section 的 `laneIds` 里删掉 lane（同 road 内移动）。
4. 在 _其他_ road 的 sections 里也清掉（跨 road 移动）。
5. 若 target sectionId 不存在，新建一个。

文件位置：`entityOps/reparent.ts:82-130`。

### `canReparent(child, target, allEntities)`

干跑 `reparent`，返回 `rejected === undefined`。给 DragOver 期间高亮合法 target 用——零副作用。

### Type guards 详解

```ts
const DRAWING_TYPES = new Set(['polyline', 'catmullRom', 'bezier', 'arc', 'rect', 'polygon']);
```

- `isDrawingEntity` —— `DRAWING_TYPES.has(entityType)`
- `isApolloEntityType` —— 反义
- `isAreaEntity` —— Apollo 实体走 `isApolloAreaEntity`（junction/parking/crosswalk/clearArea/area/...）；绘图原语只认 `rect`/`polygon`
- `isPolygonEditEntity` —— editPoints 是否闭合环。**不**等于 `isAreaEntity`：lane 是 area（junction 内 hitTest 用），但 lane 的 editPoints 是中心线（folylinic），所以 hot 层选中时不能闭合。`isPolygonEditEntity(lane) === false`。

文件位置：`entityOps/typeGuards.ts:7-28`。

## 依赖图

```
entityOps.ts (barrel)
├── entityOps/edit.ts
│   └── core/geometry/apolloCompile  (proto-aware fn 集中地)
│   └── core/elements/derive         (派生规则)
│   └── core/geometry/interpolate    (LngLat 类型)
├── entityOps/typeGuards.ts
│   └── core/geometry/apolloCompile
├── entityOps/cascadeDeleteRefs.ts
│   └── types/apollo (类型)
└── entityOps/reparent.ts
    └── types/apollo (类型)
```

UI 层 `import { ... } from '@/lib/entityOps'`，不直接 import `core/geometry/apolloCompile`。

## 测试覆盖

`src/lib/__tests__/entityOps.test.ts`——覆盖：

- `cascadeDeleteRefsFull`：删 lane → 其他 lane 的 predecessorIds 被清；删 junction → lane.junctionId = null；删两个对象的 overlap 还剩一个 → cascadeRemoved
- `reparent`：lane→junction、lane→roadSection、跨 road 移动
- `canReparent` 干跑
- `getEditPoints` / `setEditPoint` / `setAllEditPoints` 在每种 entityType 上
- `createEntity` 各 drawTool

## 副作用

- **零副作用**——所有函数纯函数，输入 `entity, allEntities`，返回新对象。
- 不读 store、不写 store、不打 log。
- 派生通过 `applyDerive`（来自 `core/elements/derive`）执行，遵守 `_userOverrides`。

## 源码索引（按行）

`entityOps.ts` 总览：

| 行    | 内容                              |
| ----- | --------------------------------- |
| 7–10  | type re-export                    |
| 12–15 | `cascadeDeleteRefsFull` re-export |
| 17–26 | edit 函数 re-export               |
| 27–32 | reparent re-export                |
| 33–38 | typeGuards re-export              |

## 参见

- `core/geometry/apolloCompile` —— proto 算子的真实实现（不要直接 import）
- `core/elements/derive` —— 派生规则引擎
- [`entities` 类型](../types/entities.md) —— `MapEntity` union
- [`apollo` 类型](../types/apollo.md) —— proto 类型
- `mapStore` —— store mutator 的实际调用方
- `ARCHITECTURE.md`「Anti-corruption layer (R2)」 —— 设计动机
