---
title: geoJsonHelpers — hot 层 GeoJSON 编译
description: 把 MapEntity（含编辑控制点 / 把手）转成 hot 层渲染用的 GeoJSON Features；包含 line/point/polygon 工厂。
---

# `geoJsonHelpers` — hot 层 GeoJSON 编译

> 源码：`src/lib/geoJsonHelpers.ts` · 186 行 · 纯函数

## 用途

Apollo Map Studio 的地图栈分两层：

- **Cold 层**：committed entities，由 spatial worker 编译并缓存（参见 `src/core/workers/spatial.worker.ts`）
- **Hot 层**：选中 / 拖拽 / 绘制中的实体的实时叠加（橡皮筋、控制点、控制柄等）

`geoJsonHelpers` 是 hot 层的编译器：把一个 `MapEntity`（包括 mid-draw 状态和已 commit 的实体被选中后的状态）转成 GeoJSON Feature 序列，maplibre 直接 `setData` 消费。它故意 **不缓存**——每次 RAF 都重新计算，因为正在变化的状态本来就需要每帧重画。

它处理两类实体：

1. **绘图原语**（polyline / catmullRom / bezier / arc / rect / polygon）—— 对应 FSM 中正在画的临时实体
2. **Apollo 实体的编辑态**—— 选中后通过 `_source` / `_sourceRect` 找回原始绘制信息，用同一套控制柄编辑

## 公共 API

| 符号                  | 类型 | 签名                                       | 摘要                                |
| --------------------- | ---- | ------------------------------------------ | ----------------------------------- |
| `lineFeature`         | fn   | `(coords, props?) => GeoJSON.Feature`      | LineString feature 工厂             |
| `pointFeature`        | fn   | `(coord, role, props?) => GeoJSON.Feature` | Point feature 工厂；`role` 影响渲染 |
| `handleLineFeature`   | fn   | `(from, to) => GeoJSON.Feature`            | 控制柄虚线（连接锚点和 handle 点）  |
| `polygonFeature`      | fn   | `(coords, props?) => GeoJSON.Feature`      | Polygon feature；自动闭环           |
| `entityToHotFeatures` | fn   | `(entity: MapEntity) => GeoJSON.Feature[]` | **核心** —— 实体 → hot 层 features  |

## 详细条目

### `lineFeature(coords, props?)`

```ts
export function lineFeature(coords: LngLat[], props = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'LineString', coordinates: coords },
  };
}
```

最小骨架。`props` 浅拷贝以防被外部 mutate。

### `pointFeature(coord, role, props?)`

```ts
export function pointFeature(coord: LngLat, role: string, props = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role, ...props },
    geometry: { type: 'Point', coordinates: coord },
  };
}
```

`role` 是 maplibre layer filter 用的关键字段，决定渲染样式：

| `role`   | 渲染                             |
| -------- | -------------------------------- |
| `vertex` | 实心圆，可拖拽                   |
| `handle` | 空心圆 + 颜色（贝塞尔 / rotate） |

`props` 通常包含 `index`（点序号）和 `handleType`（'handleIn'/'handleOut'/'rotate'）。

### `handleLineFeature(from, to)`

```ts
{
  type: 'Feature',
  properties: { role: 'handleLine' },
  geometry: { type: 'LineString', coordinates: [from, to] },
}
```

贝塞尔锚点 → 控制柄之间的虚线。`role: 'handleLine'` 让 maplibre layer 用 dasharray 渲染。

### `polygonFeature(coords, props?)`

```ts
const ring =
  first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...coords, first] : coords;
return {
  type: 'Feature',
  properties: { ...props },
  geometry: { type: 'Polygon', coordinates: [ring] },
};
```

**自动闭环** —— 若首尾点不同，则把首点 append 到末尾，符合 GeoJSON 规范要求 LinearRing 闭合。这避免每个 caller 都写一遍闭合逻辑。

### `entityToHotFeatures(entity): GeoJSON.Feature[]` —— 主函数

按 `entityType` 分支：

#### Polyline / catmullRom

```ts
features.push(lineFeature(coords)); // 主线
coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
```

`catmullRom` 用 `catmullRom(coords)` 把控制点插值成平滑曲线再画线；控制点本身仍是离散点。

#### Bezier

```ts
features.push(lineFeature(cubicBezier(anchors))); // 平滑主线
anchors.forEach((a, i) => {
  features.push(pointFeature(a.point, 'vertex', { index: i }));
  if (a.handleIn) {
    features.push(handleLineFeature(a.point, a.handleIn));
    features.push(pointFeature(a.handleIn, 'handle', { index: i, handleType: 'handleIn' }));
  }
  if (a.handleOut) {
    features.push(handleLineFeature(a.point, a.handleOut));
    features.push(pointFeature(a.handleOut, 'handle', { index: i, handleType: 'handleOut' }));
  }
});
```

每个锚点对应：

- 1 个 vertex 点
- 0/1 个 handleIn 点 + 连线
- 0/1 个 handleOut 点 + 连线

#### Arc（三点定弧）

```ts
features.push(lineFeature(threePointArc(p1, p2, p3)));
features.push(pointFeature(p1, 'vertex', { index: 0 }));
features.push(pointFeature(p2, 'vertex', { index: 1 }));
features.push(pointFeature(p3, 'vertex', { index: 2 }));
```

3 个点决定唯一圆弧；`threePointArc` 在 `core/geometry/interpolate` 中。

#### Rect（含旋转）

```ts
const corners = rectCorners(p1, p2, entity.rotation);
features.push(polygonFeature(corners)); // 4 角形成的多边形
for (let i = 0; i < 4; i++) {
  features.push(pointFeature(corners[i], 'vertex', { index: i }));
}
const center = [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2];
const handle = rectRotateHandle(p1, p2, entity.rotation);
features.push(handleLineFeature(center, handle));
features.push(pointFeature(handle, 'handle', { index: -1, handleType: 'rotate' }));
```

矩形渲染 4 角 + 1 个旋转把手（中心 → 把手的虚线 + 把手点）。

#### Polygon

跟 polyline 类似但 polygon 几何，自动闭环。

#### Apollo 实体的编辑态（兜底）

通过 `_source` / `_sourceRect` 找回原始绘制类型：

1. **`source.drawTool === 'drawBezier'`** → 同 Bezier 分支，从 `source.anchors` 重建
2. **`source.drawTool === 'drawArc'`** → 同 Arc 分支，从 `source.arcPoints` 重建
3. **`sourceRect`** → 同 Rect 分支
4. **通用兜底** —— 走 `getEditPoints(apolloEntity)`：
   - `isPolygonEditEntity(e) === true` → polygonFeature（rect/polygon/junction/...）
   - 否则 → lineFeature（lane 中心线 / signal stopLine 等）
   - 每个 editPoint 渲染 vertex 点

通用兜底关键代码：

```ts
const editPoints = getEditPoints(apolloEntity);
const coords = editPoints.map((p) => [p.x, p.y] as LngLat);

if (coords.length >= 2) {
  if (isPolygonEditEntity(apolloEntity)) {
    features.push(polygonFeature(coords));
  } else {
    features.push(lineFeature(coords));
  }
}
coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
```

为什么要分 `isPolygonEditEntity` 而不是 `isAreaEntity`？因为 lane 既是 area（hitTest 视角），又有 _中心线_ 而非闭合多边形。`isAreaEntity(lane) = true`，但若用 polygonFeature 渲染会把 lane 中心线首尾闭合成一个橡皮筋。`isPolygonEditEntity` 区分了"几何形态闭合 vs 开放"。

文件位置：`geoJsonHelpers.ts:166-179`。

## 性能考量

- 没有缓存——每次 RAF 调用都重算
- `entityToHotFeatures` 单次调用通常生成 5–30 个 features（点数线性）
- 主开销在 `cubicBezier` / `threePointArc` 的曲线插值（每帧 ~0.1ms）
- 调用方应只对 _正在变化_ 的实体调用——cold 层永远走 worker 路径

## 副作用

- **零** —— 纯函数
- 不读 store / 不写 store / 不打 console

## 测试覆盖

`src/lib/__tests__/geoJsonHelpers.test.ts`：

- 每种 entityType 的 features 数量 / role / index
- `polygonFeature` 自动闭环
- Apollo lane 的兜底走 lineFeature 而非 polygonFeature
- bezier handleIn/handleOut 缺失的 corner case

## 调用方

- `src/hooks/useHotLayer.ts` —— RAF 内调用 `entityToHotFeatures(currentEntity)` 并 `setData`
- 仅此一处直接调用方；`lineFeature` / `pointFeature` / 等工厂被多个内部分支使用

## 源码索引

| 行      | 内容                       |
| ------- | -------------------------- |
| 1–14    | 依赖 import                |
| 16–25   | `lineFeature`              |
| 27–37   | `pointFeature`             |
| 39–45   | `handleLineFeature`        |
| 47–60   | `polygonFeature`           |
| 62      | `entityToHotFeatures` 注释 |
| 65–70   | polyline / catmullRom      |
| 71–87   | bezier                     |
| 87–95   | arc                        |
| 95–106  | rect                       |
| 107–110 | polygon                    |
| 111–183 | Apollo 实体兜底            |

## 参见

- `core/geometry/interpolate` —— `catmullRom` / `cubicBezier` / `threePointArc` / `rectCorners`
- `core/geometry/coords` —— `pointsToCoords` / `toLngLat`
- `core/geometry/anchorConvert` —— `anchorToRuntime`（持久态 → runtime BezierAnchor）
- [`entityOps`](./entity-ops.md) —— `getEditPoints` / `isPolygonEditEntity`
- `src/hooks/useHotLayer` —— 唯一真实调用方
