---
title: io / proto-apollo-geojson
description: src/io/proto/apolloGeoJson.ts — 导入预览 / 自动 fitBounds 用的 bounds 计算
---

# io / proto-apollo-geojson

`src/io/proto/apolloGeoJson.ts` 是为「导入预览自动 fitBounds」服务的
轻量计算模块。它从一份**已转 lon/lat 的 raw Apollo Map**里走一遍所有
点，返回 `[[minX, minY], [maxX, maxY]]` 的 WGS84 bbox。

> 注意：尽管文件名带 `apolloGeoJson`，当前**没有**对应的 GeoJSON
> 编译入口；GeoJSON 编译走 `src/core/geometry/compile.ts` +
> `apolloCompile/features.ts`。本文件只剩 `computeApolloMapBounds`。

## 公开符号

```ts
export function computeApolloMapBounds(
  map: RawApolloMap,
): [[number, number], [number, number]] | null;
```

> Source: `src/io/proto/apolloGeoJson.ts:1-158`

`RawApolloMap` 是仅供本模块用的内部 type，覆盖了：

```ts
interface RawApolloMap {
  lane?: RawLane[];
  crosswalk?: RawCrosswalk[];
  junction?: RawJunction[];
  road?: RawRoad[];
  signal?: RawSignal[];
  stop_sign?: RawStopSign[];
  speed_bump?: RawSpeedBump[];
  clear_area?: RawClearArea[];
  parking_space?: RawParkingSpace[];
}
```

每个 RawXxx 都是「只列出 bbox 计算需要的字段」的简化版。

## 实现

```ts
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;

const visit = (p: PointLL | undefined) => {
  /* update min/max */
};
const visitCurve = (c: Curve | undefined) => {
  /* iterate segments + line_segment.point */
};
const visitPolygon = (p: ApolloPolygon | undefined) => {
  /* iterate point */
};

for (const lane of map.lane ?? []) {
  visitCurve(lane.central_curve);
  visitCurve(lane.left_boundary?.curve);
  visitCurve(lane.right_boundary?.curve);
}
for (const cw of map.crosswalk ?? []) visitPolygon(cw.polygon);
for (const j of map.junction ?? []) visitPolygon(j.polygon);
for (const ca of map.clear_area ?? []) visitPolygon(ca.polygon);
for (const ps of map.parking_space ?? []) visitPolygon(ps.polygon);
for (const r of map.road ?? [])
  for (const sec of r.section ?? []) {
    for (const e of sec.boundary?.outer_polygon?.edge ?? []) visitCurve(e.curve);
  }
for (const sig of map.signal ?? []) {
  visitPolygon(sig.boundary);
  for (const sl of sig.stop_line ?? []) visitCurve(sl);
}
for (const ss of map.stop_sign ?? []) for (const sl of ss.stop_line ?? []) visitCurve(sl);
for (const sb of map.speed_bump ?? []) for (const c of sb.position ?? []) visitCurve(c);

if (!Number.isFinite(minX)) return null;
return [
  [minX, minY],
  [maxX, maxY],
];
```

每个点位的 `x / y` 必须是 number 才参与 min/max 计算（防御非法输入）。
完全没有合法点时返回 `null`，caller 跳过 fitBounds。

## 用法

```ts
import { computeApolloMapBounds } from '@/io/proto/apolloGeoJson';

const bounds = computeApolloMapBounds(lonLatMap as Parameters<typeof computeApolloMapBounds>[0]);
if (bounds) {
  map.fitBounds(bounds, { padding: 64, duration: 600 });
}
```

`apolloIO.worker` 在 `runImport` 末尾调用并把结果作为
`IMPORT_RESULT.bounds` 回传，主线程在 `apolloMapStore.setImported`
之后用 `apolloMapStore.bounds` 触发 `mapStore` 视图收敛。
