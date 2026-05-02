---
title: geometry/hitTest — 命中检测
description: 点到折线 / 多边形距离的两套实现——纯欧氏度空间（legacy）+ 纬度补偿版（worker hitTest 用），保证高纬度排序正确。
---

# `geometry/hitTest` — 命中检测

> 源码：`src/core/geometry/hitTest.ts`
> 测试：`src/core/geometry/__tests__/hitTest.test.ts`（~9.3 KB）

## Purpose & Invariants

`hitTest` 提供两套"点到折线 / 多边形最近距离"的纯函数：

1. **纯欧氏度空间**（`pointToPolylineDist` / `pointToPolygonDist`）：把
   `(lng, lat)` 当成一个二维欧氏空间的点。赤道附近误差小，但高纬度（lat 40°）
   东西向被算小 cos40° ≈ 0.766 倍。**legacy**——主要给单元测试和向后兼容用。
2. **纬度补偿版**（`pointToPolylineDistGeo` / `pointToPolygonDistGeo`）：caller
   传入 `cosLat`，函数内部把 Δlat 乘 `1/cosLat` 转到"等效 lng 度空间"，与 caller
   传的"lng 度数半径"量纲一致——worker `hitTest` 用这一套。

`pointInPolygon` 只判断拓扑包含（射线法），跟量纲无关，两套共用。

### 不变量（R4 修正后的关键）

1. **caller 拿到的"距离"必须能和"半径"在同一空间里比较**：
   - 纯欧氏：度空间，半径也是度
   - Geo 版：放大后的度空间，半径仍是度（caller 不感知，零改动）
2. **极端纬度 `cosLat → 0`**：用 `Math.max(cosLat, 1e-6)` 兜底，避免除零。
3. **闭合多边形检测**：`pointToPolygonDist(Geo)` 自动闭合环：若首尾不重合，
   隐式补一段 `[last, first]`。

## Public API

### `pointToPolylineDist(point, coords): number`（legacy 欧氏）

```ts
let min = Infinity;
for (let i = 0; i < coords.length - 1; i++) {
  const d = pointToSegmentDist(
    point[0],
    point[1],
    coords[i][0],
    coords[i][1],
    coords[i + 1][0],
    coords[i + 1][1],
  );
  if (d < min) min = d;
}
return min;
```

度空间欧氏距离。
（`hitTest.ts:47-56`）

### `pointInPolygon(point, polygon): boolean`

经典射线法（半开约定）：

```ts
for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
  if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
    inside = !inside;
  }
}
```

`yi > py !== yj > py` 隐含 `yi !== yj`，分母安全；水平边自动跳过（不切换 inside）。
（`hitTest.ts:59-72`）

### `pointToPolygonDist(point, polygon): number`

内点 → 0；外点 → 到环的最近距离（必要时自动闭合）。
（`hitTest.ts:75-82`）

### `pointToPolylineDistGeo(point, coords, cosLat): number`

纬度补偿版。

```ts
function pointToSegmentDistGeo(...) {
  const dy = (by - ay) * invCosLat;     // Δlat 放大到 lng 空间
  const dx = bx - ax;                   // Δlng 不动
  // ... 然后做欧氏 + segment 投影
}
```

返回的距离量纲 = "lng 度数"，可以直接和 `pixelToRadius(px)` 算出的度数半径比较。
极端纬度 `cosLat ≈ 0` 用 `1e-6` 兜底退化回纯欧氏。
（`hitTest.ts:118-130`）

### `pointToPolygonDistGeo(point, polygon, cosLat): number`

`pointInPolygon` 包含 + `pointToPolylineDistGeo` 边界。
（`hitTest.ts:136-143`）

## 数学背景（为什么放大 dy）

Web Mercator 每像素 lng 步长 = `360 / (512 · 2^zoom)`（与 lat 无关）。
每像素 lat 步长 = lng 步长 × cos(lat)（高纬变小）。

所以同一 `pixelToRadius(px)` 既是 lng 半径 r，也是 lat 半径 r/cosLat。等价地：
**把 Δlat 乘 1/cosLat** 后，可以直接和 `r` 比较。这就是 Geo 版的核心。

之所以选"放大 dy"而不是"压缩 dx"，是为了让返回距离的量纲和 caller 传入的
半径（lng 度数）一致——caller 零改动。

## 用法对比

```ts
// 主线程命中（hot layer 最近距离 ranking）
const d = pointToPolylineDist(cursor, lineCoords);
// d 的量纲 = 度空间欧氏，高纬度会偏小

// Worker hitTest（lng-degree 半径）
const cosLat = Math.max(Math.cos((point.y * Math.PI) / 180), 1e-6);
const d = pointToPolylineDistGeo(cursor, lineCoords, cosLat);
const r = pixelToRadius(8, currentZoom);
if (d <= r) {
  /* hit */
}
```

## 测试覆盖

`hitTest.test.ts` 覆盖：

- `pointToPolylineDist`：起点 / 终点 / 中段最近、空数组 ∞、单点退化
- `pointInPolygon`：内点、外点、顶点、边上、水平边不切换 inside
- `pointToPolygonDist`：内点 0、外点到环、自动闭合
- Geo 版在低纬度（赤道）与欧氏版结果接近
- Geo 版在高纬度（lat 60°）与欧氏版差异显著（约 cos60°=0.5 的偏差）
- `cosLat → 0` 退化（极地兜底）

## 复杂度

| 函数                   | 复杂度 |
| ---------------------- | ------ |
| `pointToSegmentDist*`  | O(1)   |
| `pointToPolylineDist*` | O(P-1) |
| `pointInPolygon`       | O(P)   |
| `pointToPolygonDist*`  | O(P)   |

worker hitTest 在 RBush 缩范围后单实体调用一次，5w 实体规模下 hit 邻域 ~10 个
candidates × 30 顶点平均 = ~300 次评估，< 0.5ms。

## See also

- [workers/spatial](./workers-spatial) — `spatialHitTest.ts` 调用 Geo 版
- [geometry/snap](./geometry-snap) — 顶点 / 边段距离比较（欧氏度空间，cosLat 投到米）
- [geometry/validation](./geometry-validation) — `polygonSelfIntersects` 是另一个独立谓词
