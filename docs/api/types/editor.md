---
title: types/editor — 编辑态拖拽元类型
description: 拖拽控制点的类型枚举（vertex / handleIn / handleOut / rotate / center），驱动 hot 层 cursor 与 setEditPoint 路径分发。
---

# `types/editor` — 编辑态拖拽元类型

> 源码：`src/types/editor.ts` · 3 行

## 用途

`types/editor` 持有 1 个公开类型——`DragPointType`，描述 hot 层上一个可拖拽点的类别。绘图原语和 Apollo 实体的编辑态都会渲染这些点；FSM 的 `EDIT_POINT` 事件把这个枚举值喂给 `entityOps.setEditPoint` / 等价路径。

## 公共 API

| 符号            | 类型  | 摘要       |
| --------------- | ----- | ---------- |
| `DragPointType` | union | 5 种拖拽点 |

## 详细条目

### `type DragPointType`

```ts
export type DragPointType = 'vertex' | 'handleIn' | 'handleOut' | 'rotate' | 'center';
```

| 值          | 含义                                                                              | 出现位置                                    |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| `vertex`    | 标准顶点（lane / polyline / polygon / arc 三点 / rect 四角 / Apollo edit points） | 几乎所有实体                                |
| `handleIn`  | Bezier 锚点的入向控制柄                                                           | bezier / 选中后的曲线 lane                  |
| `handleOut` | Bezier 锚点的出向控制柄                                                           | bezier / 选中后的曲线 lane                  |
| `rotate`    | 矩形旋转把手                                                                      | rect / parkingSpace / crosswalk / clearArea |
| `center`    | 整体平移把手（拖动整个实体）                                                      | 暂未在主流程使用，预留                      |

## 与渲染的关系

`geoJsonHelpers.ts` 的 `pointFeature(coord, role, props)` 把 `role` 字段写到 GeoJSON properties 上：

| GeoJSON `role`                                       | `DragPointType` 映射 |
| ---------------------------------------------------- | -------------------- |
| `'vertex'`                                           | `vertex`             |
| `'handle'` + `properties.handleType === 'handleIn'`  | `handleIn`           |
| `'handle'` + `properties.handleType === 'handleOut'` | `handleOut`          |
| `'handle'` + `properties.handleType === 'rotate'`    | `rotate`             |

`useMapEventRouter` 及其 `mapEventRouter/*` helpers 在 mousedown 时通过 maplibre `queryRenderedFeatures` 查到 feature → 读 `role` / `handleType` → 派发 `DragPointType` 给状态机。

## 副作用

无 —— 纯类型。

## 测试覆盖

无独立测试。

## 调用方

- `src/hooks/useMapEventRouter.ts` —— 绑定 maplibre 事件并委托给 router helpers
- `src/hooks/mapEventRouter/selectionDrag.ts` —— 用此枚举决定 selection drag 的目标类型
- `src/components/map/entityMutations.ts` / `src/components/map/entityMutations/*` —— 路由到点位、Bezier handle、rect rotation 等实体变更
- `src/hooks/useHotLayer.ts` —— 驱动 hot layer 的可交互 feature

## 设计动机

为什么独立成文件？早期所有"编辑控制点"相关的类型都堆在 `entities.ts` 里，与"实体本身"的类型混杂。拆出来后：

1. `entities.ts` 专心管"实体的形状"
2. `editor.ts` 管"运行时编辑态"
3. 未来想加 `'midpoint'`（折线中点插入新顶点）只需改这一个文件

文件极小（3 行）但语义清晰，是 R7 类型边界划分的一部分。

## 源码索引

| 行  | 内容                 |
| --- | -------------------- |
| 2   | `DragPointType` 定义 |

## 完整使用示例

### Hot 层渲染时打 role 标签

```ts
// geoJsonHelpers.ts
features.push(pointFeature(corners[i], 'vertex', { index: i }));
features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
features.push(pointFeature(a.handleIn, 'handle', { index, handleType: 'handleIn' }));
```

### maplibre 查询时还原 DragPointType

```ts
// mapEventRouter/selectionDrag.ts (简化)
function getDragPointType(features: maplibregl.MapGeoJSONFeature[]): DragPointType | null {
  const f = features[0];
  if (!f) return null;
  const role = f.properties?.role;
  if (role === 'vertex') return 'vertex';
  if (role === 'handle') {
    const t = f.properties?.handleType;
    if (t === 'handleIn') return 'handleIn';
    if (t === 'handleOut') return 'handleOut';
    if (t === 'rotate') return 'rotate';
  }
  return null;
}
```

### Cursor 路由

```ts
const CURSOR: Record<DragPointType, string> = {
  vertex: 'grab',
  handleIn: 'crosshair',
  handleOut: 'crosshair',
  rotate: 'alias',
  center: 'move',
};

function setCursor(type: DragPointType | null) {
  map.getCanvas().style.cursor = type ? CURSOR[type] : '';
}
```

### Dispatch 路由

```ts
// entityMutations.ts
function dispatch(type: DragPointType, index: number, point: GeoPoint) {
  switch (type) {
    case 'vertex':
      mapStore.updateEntity(id, setEditPoint(entity, index, point));
      break;
    case 'handleIn':
    case 'handleOut':
      mapStore.updateEntity(id, setBezierHandle(entity, index, type, point));
      break;
    case 'rotate':
      mapStore.updateEntity(id, setRectRotation(entity, point));
      break;
    case 'center':
      mapStore.updateEntity(id, moveEntity(entity, dx, dy));
      break;
  }
}
```

每种类型对应不同的 store 路径——5 个变体覆盖全部"拖什么意味着改什么"的语义。

## 与 `entityType` 的正交性

`DragPointType` 与 `entityType` **正交**——一个 `vertex` 可能属于 polyline / lane / signal 任意一种实体；一个 `rotate` 只属于 rect 类。但 union 设计允许调用方按需 narrow。

## 演化预案

未来可能加入的成员（**未实现**）：

- `'midpoint'` —— 折线中点点击插入新顶点
- `'start'` / `'end'` —— 区分折线起终点（首尾不同 cursor）
- `'add'` —— 在贝塞尔曲线上插入新锚点

加入新成员只需改本文件——所有调用方因为 `switch` exhaustiveness check 会被 TypeScript 强制更新。

## 参见

- [`entities`](./entities.md) —— 实体类型
- [`geoJsonHelpers`](../lib/geo-json-helpers.md) —— `pointFeature(coord, role, ...)`
- `src/hooks/useMapEventRouter.ts` —— map 事件入口
- `src/hooks/mapEventRouter/selectionDrag.ts` —— DragPointType 的主消费者
- `src/components/map/entityMutations.ts` —— 实体变更入口
- `src/hooks/useHotLayer.ts` —— Hot layer 渲染入口
