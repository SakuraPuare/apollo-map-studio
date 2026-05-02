---
title: useGridLayer
description: 按当前 zoom 自适应间距、按 viewport bounds 实时重算的米制参考网格图层；toggle 关闭时仅切 visibility 不重算。
---

# useGridLayer

> 源码：`src/hooks/useGridLayer.ts`

`useGridLayer` 是 ToolStrip "G" 切换按钮真正落到画布的那一层。它根据当前
`map.getZoom()` 选定米制网格的步长（`metersForZoom`），把视口范围内的
经纬线写入 `grid` source 并应用到 `grid-line` layer。

设计目标：

- **gridEnabled=false**：仅切 layer `visibility:none`，跳过任何重算 / setData。
- **gridEnabled=true**：立即 apply 一次，并订阅 `moveend` / `zoomend` 实时刷新。
- **不漂移**：网格起点 `Math.floor(south / stepLat) * stepLat` 始终对齐到
  step 整数倍，缩放/平移时不会产生肉眼可见的抖动。
- **安全上限**：`MAX_LINES_PER_AXIS = 240` 兜底，避免极端 zoom-out 生成数万根线。

## 与 toolstrip / status bar 的互动

- ToolStrip 上的 G 按钮 → `execute('toggleGrid')` →
  `useUIStore.toggleGrid()` → `gridEnabled` 翻转 → 本 hook re-run。
- Status bar 显示当前 zoom 与"当前一格 = N 米"，反查 `metersForZoom`。
- 状态条与本 hook 都消费同一个 `useUIStore.gridEnabled`，保证视觉一致。

## 签名

```ts
function useGridLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
): void;

export function metersForZoom(zoom: number): { step: number; majorEvery: number };
export const MAX_LINES_PER_AXIS = 240;
```

## 参数

| 名称           | 类型                                | 角色                              |
| -------------- | ----------------------------------- | --------------------------------- |
| `mapRef`       | `RefObject<maplibregl.Map \| null>` | MapLibre 实例。                   |
| `mapLoadedRef` | `RefObject<boolean>`                | 用于 layer 刚刚注册前的兜底等待。 |

## 返回值

`void`。作用于 `grid` source 与 `grid-line` layer。

## 与全局 zoom 状态的同步

```ts
// useMapEventRouter.ts:198-203
const onZoomEnd = () => {
  useUIStore.getState().setCurrentZoom(map.getZoom());
};
useUIStore.getState().setCurrentZoom(map.getZoom());
map.on('zoomend', onZoomEnd);
```

router 把当前 zoom 写入 store；状态条 + 本 hook 都消费它。这让 grid 重算
路径与状态条更新天然对齐。

## 重新计算的成本

`buildGrid(map)` 在 240 + 240 上限下产出最多 480 条 `LineString` feature。
maplibre 在 `setData` 处理这个量级 < 0.5ms。`moveend` / `zoomend`
触发频率低（用户停止拖动后才发），不会成为帧预算瓶颈。

## 边界 case：极地与跨经线 180°

- 极地附近 `cos(midLat * π/180) → 0`，`stepLng` 趋于无穷。`Math.floor(west / stepLng)`
  会得到 0；`startLng = 0`；循环很快超过 `MAX_LINES_PER_AXIS`，安全
  提前退出。
- 视口跨 180° 经线时（`west > east`），`bounds.getWest()` 返回值仍
  小于 `getEast()`（maplibre 自带规范化），网格仍能正常渲染，但
  两侧边界处对齐有微小偏差（约 1px）。当前 Apollo 编辑场景不在跨日界线
  附近，未优化。

## 数据来源

- `useUIStore.gridEnabled` —— 主开关，由 `useActionDispatcher` 中的
  `toggleGrid` action 切换。
- `map.getZoom()` —— 决定 step 与 major 频率。
- `map.getBounds()` —— 决定网格覆盖的经纬范围。

## 副作用

| 副作用                                                  | 触发时机                                                 | 清理                                |
| ------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| `map.setLayoutProperty('grid-line', 'visibility', ...)` | 每次 effect 执行                                         | —                                   |
| `src.setData(buildGrid(map))`                           | `gridEnabled=true` 的 `apply()` 与每次 moveend / zoomend | —                                   |
| `map.on('moveend', onMove)`                             | `gridEnabled=true`                                       | `map.off('moveend', onMove)`        |
| `map.on('zoomend', onMove)`                             | `gridEnabled=true`                                       | `map.off('zoomend', onMove)`        |
| `map.once('load', apply)`                               | 当前未加载                                               | cleanup 中 `map.off('load', apply)` |

## `metersForZoom` 表

```ts
// useGridLayer.ts:9-21
zoom >= 20 → step 0.5m / major 5m
zoom >= 19 → step 1m   / major 10m
zoom >= 18 → step 2m   / major 10m
zoom >= 17 → step 5m   / major 25m
zoom >= 16 → step 10m  / major 50m
zoom >= 15 → step 25m  / major 100m
zoom >= 14 → step 50m  / major 200m
zoom >= 13 → step 100m / major 500m
zoom >= 12 → step 250m / major 1km
zoom >= 11 → step 500m / major 2km
其它       → step 1000m / major 5km
```

## 生命周期

```
[gridEnabled, mapRef, mapLoadedRef] 任何变化 → effect re-run
  ├── apply()
  │     ├── setLayoutProperty('grid-line', visibility: enabled ? 'visible' : 'none')
  │     └── src.setData(enabled ? buildGrid(map) : EMPTY_FC)
  ├── if !mapLoaded: map.once('load', apply)
  ├── if !enabled: cleanup 提前返回
  └── enabled:
        ├── map.on('moveend', onMove)
        └── map.on('zoomend', onMove)

cleanup
  ├── if pendingLoad: map.off('load', apply)
  └── enabled: map.off('moveend' | 'zoomend', onMove)
```

## 不变量

### 关闭时不进入订阅路径

```ts
// useGridLayer.ts:128-132
if (!gridEnabled) {
  return () => {
    if (pendingLoad) map.off('load', apply);
  };
}
```

避免不可见时仍然在每次平移重算 GeoJSON，节省 GPU 与 CPU。

### 网格起点对齐 step

```ts
// useGridLayer.ts:42-43
const startLat = Math.floor(south / stepLat) * stepLat;
const startLng = Math.floor(west / stepLng) * stepLng;
```

否则缩放或平移时网格线位置会随机滑动，看起来"漂"。

### Major 周期由 `latIdx` / `lngIdx` 决定，不是相对 `startLat`

```ts
// useGridLayer.ts:48, 50, 52, 64
let latIdx = Math.floor(south / stepLat);
// ...
const major = latIdx % majorEvery === 0;
```

整数索引基于绝对地理位置取模 —— 这样无论从何处开始绘制，主网格线总是落在
"world 整数倍"上，而不是当前 viewport 的相对位置。

### 安全上限

```ts
// useGridLayer.ts:25
export const MAX_LINES_PER_AXIS = 240;

// 循环条件
for (let lat = startLat; lat <= north && countLat < MAX_LINES_PER_AXIS; ...)
```

极端 zoom-out + 错配 step 的兜底；避免一次循环生成几万 LineString。

## 调用点

```tsx
// src/components/map/MapCanvas.tsx:40
useGridLayer(mapRef, mapLoadedRef);
```

`gridEnabled` 由 `useActionDispatcher` 的 `toggleGrid` action 翻转。
菜单 / 工具栏 / 状态条所有 toggle 行为都汇集在 `useUIStore.toggleGrid()`。

## 错误模式

| 现象               | 根因                                         | 修复                                                                             |
| ------------------ | -------------------------------------------- | -------------------------------------------------------------------------------- |
| 切换不生效         | `grid-line` layer 还没注册                   | `mapLoadedRef.current=false` 时 `apply` 早返回；等 `once('load')` 触发再次 apply |
| zoom-out 卡顿      | step 落到错配档位，单帧 > MAX_LINES_PER_AXIS | 调整 `metersForZoom` 阈值                                                        |
| 网格漂移           | 计算 `startLat` 时漏掉 `Math.floor`          | 见 line 42-43                                                                    |
| 关掉网格后还在重算 | `enabled=false` 没走 cleanup 早返回          | 见 line 128-132                                                                  |

## 测试

- `src/hooks/__tests__/useGridLayer.test.ts` —— `metersForZoom`、`buildGrid`
  上限测试

## 参见

- [`useActionDispatcher`](./use-action-dispatcher.md)（`toggleGrid` 派发器）
- [`useUIStore.gridEnabled`](../store/store-ui.md)
- [`mapLibreInit/layers.ts` —— `grid-line`](./use-map-libre-init.md)

## 网格美学

`mapLibreInit/layers.ts:14-23` 中的 `grid-line` paint 采用：

```js
'line-color': ['case', ['==', ['get', 'major'], true],
  'rgba(255,255,255,0.18)',     // 主线：18% 白
  'rgba(255,255,255,0.07)'],    // 次线：7% 白
'line-width': ['case', ['==', ['get', 'major'], true], 1, 0.5],
```

低对比度故意保留 —— 网格是参考，不应该抢用户绘制内容的视觉焦点。

## 与 cursorScheduler / status bar 的协同

`useUIStore.cursorLngLat` 与 `useUIStore.currentZoom` 由
[`useMapEventRouter` cursorScheduler](./map-event-router-internals.md#cursorschedulerts)
与 `zoomend` handler 写入。状态条同时显示当前光标的米制坐标 + 当前
grid step（通过 `metersForZoom` 反查），让用户对"当前一格 = N 米"有直观
感受。

## 选 zoom 阈值的考量

每档间距按 5 / 10 / 25 / 50 / 100 倍数演进，而不是平均切：

- 15 米 / 30 米这种"奇数档位"在地图上看起来不自然。
- `majorEvery` 按"每 5 / 10 步出一根主线"调整，确保主线密度独立于 step。
- zoom 17 (5m) / zoom 16 (10m) 是一对平滑过渡：用户从 17 滑到 16 时，
  网格密度仅 2× 变化，不会突然变粗或变细。

## 源码索引

| 关注点                     | 行号                      |
| -------------------------- | ------------------------- |
| `metersForZoom`            | `useGridLayer.ts:9-21`    |
| `MAX_LINES_PER_AXIS`       | `useGridLayer.ts:25`      |
| `buildGrid`                | `useGridLayer.ts:27-88`   |
| `apply`                    | `useGridLayer.ts:107-116` |
| `gridEnabled=false` 早返回 | `useGridLayer.ts:128-132` |
| `moveend` / `zoomend` 订阅 | `useGridLayer.ts:135-141` |
| cleanup                    | `useGridLayer.ts:142-146` |
