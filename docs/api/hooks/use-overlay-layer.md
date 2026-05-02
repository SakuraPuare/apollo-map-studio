---
title: useOverlayLayer
description: 把绘制 FSM（drawPolyline / drawCatmullRom / drawBezier / drawArc / drawRotatedRect / drawPolygon）状态投影到 overlay 黄色虚线源；副带 snap 指示环。
---

# useOverlayLayer

> 源码：`src/hooks/useOverlayLayer.ts`

`useOverlayLayer` 是绘制态的可视层。它读取 FSM 当前状态值（`drawPolyline`
/ `drawCatmullRom` / `drawBezier` / `drawArc` / `drawRotatedRect` /
`drawPolygon`）+ 上下文（`drawPoints` / `previewPoint` / `bezierAnchors`），
将每种状态对应的预览几何渲染到 `overlay` GeoJSON source（黄色虚线 +
顶点 + 控制柄）。

同一文件内还导出 `useSnapIndicatorLayer`（私有），它单独订阅
`useUIStore.currentSnapTarget`，把 snap 指示环画在 `snap` source 上。
两者共同构成绘制阶段的所有"漂浮 UI"。

## 三层 source 的边界

| Source    | 内容                                            | 写入者                                  |
| --------- | ----------------------------------------------- | --------------------------------------- |
| `cold`    | 已提交的全部实体                                | `useColdLayer`（worker）                |
| `hot`     | 当前选中的实体 + 拖拽预览                       | `useHotLayer`                           |
| `overlay` | 绘制中的草稿几何（drawPoints / bezier anchors） | `useOverlayLayer`                       |
| `snap`    | snap 指示器                                     | `useOverlayLayer.useSnapIndicatorLayer` |
| `grid`    | 米制参考网格                                    | `useGridLayer`                          |

颜色编码：cold 用 ams-\* 主色 / hot 蓝色 / overlay 黄色虚线 / snap 青色环。

## 设计动机

- 绘制反馈纯前端、零 worker：每个 builder 函数 < 30 行，覆盖一种几何形态。
- 状态切换 → 直接换 builder：`OVERLAY_BUILDERS` 是单点查表，新增几何只需
  注册一项。
- snap 指示与绘制反馈完全解耦：snap 在拖拽顶点时也要可见，因此它独立 source。

## 何时进入 / 退出 isDrawingState

`isDrawingState` 集合（`editorMachine.ts`）包含：`drawPolyline` /
`drawCatmullRom` / `drawBezier` / `drawArc` / `drawRotatedRect` /
`drawPolygon`。FSM 进入这些状态的方式：

- `SELECT_TOOL` 事件携带 `tool: 'drawXxx'` —— ToolStrip 点击
- `idle → drawXxx` 仅经过 `SELECT_TOOL`

退出：

- `CONFIRM` / `DOUBLE_CLICK` → `idle`
- `CANCEL` → `idle`（resetDraw 清空 drawPoints）
- `SELECT_TOOL` 切到其它 draw 工具 → 直接到目标 draw 状态

## 签名

```ts
function useOverlayLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
): void;
```

## 参数

| 名称           | 类型                                 | 角色                                   |
| -------------- | ------------------------------------ | -------------------------------------- |
| `mapRef`       | `RefObject<maplibregl.Map \| null>`  | MapLibre 实例。                        |
| `mapLoadedRef` | `RefObject<boolean>`                 | 就绪标志。                             |
| `actorRef`     | `ActorRefFrom<typeof editorMachine>` | FSM actor；订阅其变化触发 RAF render。 |

## 返回值

`void`。作用于 `overlay` 与 `snap` 两个 source。

## `OverlayRenderState`

```ts
export type OverlayRenderState = {
  currentState: string; // FSM value
  drawPoints: LngLat[]; // 已经确认的点
  previewPoint: LngLat | null; // 跟随光标的预览点
  bezierAnchors: BezierAnchor[]; // 仅 drawBezier
};
```

## Builder 表

```ts
// useOverlayLayer.ts:157-164
const OVERLAY_BUILDERS: Record<string, OverlayBuilder> = {
  drawPolyline: buildPolylineFeatures,
  drawCatmullRom: buildCatmullRomFeatures,
  drawBezier: buildBezierFeatures,
  drawArc: buildArcFeatures,
  drawRotatedRect: buildRotatedRectFeatures,
  drawPolygon: buildPolygonFeatures,
};
```

| 状态              | 预览几何                           | 触发条件                         |
| ----------------- | ---------------------------------- | -------------------------------- |
| `drawPolyline`    | 线段链 + 顶点                      | `allPts.length >= 2`             |
| `drawCatmullRom`  | Catmull-Rom 平滑曲线 + 顶点        | `allPts.length >= 2`             |
| `drawBezier`      | 三次贝塞尔曲线 + 句柄虚线 + 控制柄 | `withPreviewAnchors.length >= 2` |
| `drawArc`         | 三点圆弧（2 点先画线）             | `allPts.length === 3`            |
| `drawRotatedRect` | 旋转矩形 + 主轴预览                | `allPts.length === 3`            |
| `drawPolygon`     | 闭合多边形（< 3 点显示线）         | `allPts.length >= 3`             |

## 副作用

| 副作用                                      | 触发时机                                           | 清理                            |
| ------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| `actorRef.subscribe(scheduleRender)`        | mount                                              | `subscription.unsubscribe()`    |
| `requestAnimationFrame(renderOverlayLayer)` | actor 状态变更                                     | `cancelAnimationFrame(frameId)` |
| `src.setData(...)`                          | render fires + `sameOverlayRenderState` 返回 false | —                               |
| `useUIStore.subscribe(currentSnapTarget)`   | `useSnapIndicatorLayer` mount                      | 返回的 unsub                    |
| `snap` source 写入                          | snap target 变化                                   | —                               |

## 生命周期

```
mount (overlay)
  ├── subscribe(actorRef) → scheduleRender
  └── if mapLoaded: scheduleRender() else: map.once('load', scheduleRender)

renderOverlayLayer (RAF)
  ├── snapshot → OverlayRenderState
  ├── if sameOverlayRenderState(last, next): return
  ├── if !isDrawingState(currentState): setData(EMPTY_FC); return
  └── setData(buildOverlayFeatures(state))

mount (snap indicator)
  ├── 立即 apply 一次当前 currentSnapTarget
  └── subscribe(useUIStore) → 仅 currentSnapTarget 变化时 apply
```

## 不变量

### 仅在绘制态写 overlay

```ts
// useOverlayLayer.ts:249-252
if (!isDrawingState(nextState.currentState)) {
  src.setData(EMPTY_FC);
  return;
}
```

切回 `idle` / `selected` 时立刻清空，避免上一笔的预览残留。

### Bezier 预览的克隆

```ts
// useOverlayLayer.ts:101
const runtimeAnchors: BezierAnchor[] = bezierAnchors.map((anchor) => ({ ...anchor }));
```

绘制阶段的预览必须复制 anchor 数组，否则 `withPreviewAnchors`
push 进去的临时项会污染 FSM context（XState 5 不会自动冻结）。

### Snap target 去重在 store 端

```ts
// useOverlayLayer.ts:208-212
const unsub = useUIStore.subscribe((s, prev) => {
  if (s.currentSnapTarget !== prev.currentSnapTarget) {
    apply(s.currentSnapTarget);
  }
});
```

`uiStore.setSnapTarget` 内部已对 SnapTarget 等价做去重（详见 store
文档），这里只比较引用即可。

## 调用点

```tsx
// src/components/map/MapCanvas.tsx:37
useOverlayLayer(mapRef, mapLoadedRef, actorRef);
```

`MapCanvas` 同时也通过 `useMapEventRouter` 中的 `applySnap` 写入
`uiStore.currentSnapTarget`，因此 overlay + snap 指示器在同一个 hook 调用
里联动起来。

## 错误模式

| 现象                    | 根因                                                 | 修复                                                                  |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| 预览不刷新              | `OVERLAY_BUILDERS` 缺少状态映射                      | 在 `OVERLAY_BUILDERS` 注册新 state                                    |
| Bezier 控制柄重叠       | `bezierAnchorFeatures` 没区分 in / out               | 见 line 80-94，确认 `handleIn` / `handleOut` 都有 `pointFeature` 写入 |
| 切换工具后老线残留      | `isDrawingState` 没把新 state 标记为 drawing         | 检查 `editorMachine.ts` 的 `isDrawingState` 集合                      |
| Snap 关闭后指示环不消失 | `useMapEventRouter` 的 `useUIStore.subscribe` 没触发 | 见 router 中 line 215-219 的兜底清理                                  |

## 参见

- [Editor Machine 绘制状态](../core/editor-machine.md)
- [`useDrawCommit`](./use-draw-commit.md)
- [Geometry interpolate](../core/geometry-interpolate.md)
- [`uiStore.currentSnapTarget`](../store/store-ui.md)

## 帧预算

- builder 函数全部 O(n)，n = 当前已确认点数（绘制中通常 < 20）。
- `cubicBezier` 与 `catmullRom` 的采样点数固定（默认 24 / 段），不随
  缩放级别增长。
- snap 指示器仅 1 个 Point feature，setData 成本忽略不计。

## Snap 指示器细节

```ts
// useOverlayLayer.ts:171-186
function snapTargetFeatureCollection(target: SnapTarget): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: target.kind, entityId: target.entityId, entityType: target.entityType },
        geometry: { type: 'Point', coordinates: [target.point.x, target.point.y] },
      },
    ],
  };
}
```

- `kind: 'vertex' | 'edge'` —— `mapLibreInit/layers.ts:248-256` 通过
  `match` 表达式把 vertex / edge 渲染为不同颜色。
- `entityType` 仅作 debug 信息，不影响样式。

## 与 useDrawCommit 的关系

`useOverlayLayer` 仅读 FSM 上下文绘制预览；真正落盘走
[`useDrawCommit`](./use-draw-commit.md)。两者互不干扰：

```
绘制中：FSM + drawPoints → useOverlayLayer 渲染预览
↓ DOUBLE_CLICK / Enter
FSM transition → idle: useDrawCommit 调 addEntity（POST snapshot）
↓
useOverlayLayer 看到 !isDrawingState → setData(EMPTY_FC) 清空预览
useColdLayer 看到 entities 变化 → 写入 cold source
```

## 源码索引

| 关注点                           | 行号                         |
| -------------------------------- | ---------------------------- |
| `OverlayRenderState` 类型        | `useOverlayLayer.ts:21-26`   |
| `sameOverlayRenderState`         | `useOverlayLayer.ts:34-42`   |
| `withPreview` / `vertexFeatures` | `useOverlayLayer.ts:50-56`   |
| `buildPolylineFeatures`          | `useOverlayLayer.ts:58-67`   |
| `buildCatmullRomFeatures`        | `useOverlayLayer.ts:69-78`   |
| `buildBezierFeatures`            | `useOverlayLayer.ts:96-115`  |
| `buildArcFeatures`               | `useOverlayLayer.ts:117-126` |
| `buildRotatedRectFeatures`       | `useOverlayLayer.ts:128-144` |
| `buildPolygonFeatures`           | `useOverlayLayer.ts:146-155` |
| `OVERLAY_BUILDERS` dispatch      | `useOverlayLayer.ts:157-164` |
| `useSnapIndicatorLayer`          | `useOverlayLayer.ts:188-217` |
| `useOverlayLayer` 主体           | `useOverlayLayer.ts:219-285` |
