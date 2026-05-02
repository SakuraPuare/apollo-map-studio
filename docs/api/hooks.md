---
title: Hooks Index
description: src/hooks/* — 一句话概述每个 React hook 与其在事件路由 / 层调度中的角色
---

# Hooks Index

`src/hooks/` 把 React 19 + maplibre + XState + Zustand 之间的接线集中
收口。每个 hook 都是「订阅 store / 转发到 maplibre 或 FSM / 暴露
最小受控接口」三件套。本节列出全部公开 hook 与一行概述；详细签名
与内部数据流在各自源文件的 JSDoc 里。

## 顶层

| Hook                  | 文件                     | 职责                                                      |
| --------------------- | ------------------------ | --------------------------------------------------------- |
| `useMapLibreInit`     | `useMapLibreInit.ts`     | 创建 maplibre 实例 + 注入 dark style + 注册 layer/sources |
| `useApolloLayer`      | `useApolloLayer.ts`      | 把 `apolloMapStore.rawMap` 投到 GeoJSON 源                |
| `useColdLayer`        | `useColdLayer.ts`        | 把 `mapStore.entities` 编译到冷层 GeoJSON                 |
| `useHotLayer`         | `useHotLayer.ts`         | FSM 在飞绘点 / drag preview 实时渲染                      |
| `useOverlayLayer`     | `useOverlayLayer.ts`     | 选中状态、snap indicator、editPoints 等 overlay           |
| `useGridLayer`        | `useGridLayer.ts`        | 自适应网格层（米级 step + 主线副线）                      |
| `useCursorManager`    | `useCursorManager.ts`    | 根据 FSM 状态设置 maplibre canvas 鼠标样式                |
| `useDragPan`          | `useDragPan.ts`          | 拖拽实体期间禁用 maplibre 自带 dragPan                    |
| `useActionDispatcher` | `useActionDispatcher.ts` | undo / redo / 删除 / 工具切换的统一入口（带 R1 闭环）     |
| `useDrawCommit`       | `useDrawCommit.ts`       | FSM 退出 draw 状态时把临时点 commit 到 mapStore           |
| `useMapEventRouter`   | `useMapEventRouter.ts`   | maplibre 事件 → FSM event；含 dblclick 去重               |
| `useLicenseSync`      | `useLicense.ts`          | 把 license bridge 状态同步到 `licenseStore`               |

## 子目录

`src/hooks/mapLibreInit/`：

- `assets.ts` — `EMPTY_FC`、`DARK_STYLE`、`registerRuntimeImages(map)`
- `layers.ts` — `addEditorLayers(map)` 注册全部 cold/hot/overlay layer

`src/hooks/mapEventRouter/`：

- `inputDedup.ts` — `sampleInput(e)`、`isDuplicateInput(prev, next)`，
  在 dblclick 之间过滤重复 click；
- `keyboard.ts` — `handleMapKeyDown(...)`，把 keydown 转 FSM event；
- `selectionDrag.ts` — `handleSelectedMouseDown(...)`，开始拖拽
  实体；
- `cursorScheduler.ts` — RAF coalesce cursor 设置；
- `connectMode.ts` — `handleConnectModeClick(...)`，第二次 lane 点击
  落地连接；
- `snap.ts` — `applySnap(...)`，把 cursor 投到 SnapTarget；
- `hitTest.ts` — `toLngLat`、`hitBbox`、`pixelToRadius`、`workerHitTest`。

## `useActionDispatcher`

```ts
export interface ActionDispatcher {
  dispatch(actionId: ActionId): void;
  undo(): void;
  redo(): void;
  deleteSelected(): void;
  setDrawTool(tool: DrawTool): void;
  cancelFsm(): void;
}

export function useActionDispatcher(options: {
  actorRef: ActorRefFrom<typeof editorMachine>;
}): ActionDispatcher;
```

R1 闭环（`useActionDispatcher.ts:76-82`）：undo 之前先向 FSM 发
`CANCEL`，避免半途中绘点状态在 entities 回滚后失配。

## `useDrawCommit`

```ts
export function hasGeometryForState(state: ReturnType<typeof editorMachine.transition>): boolean;

export function useDrawCommit(actorRef: ActorRefFrom<typeof editorMachine>): void;
```

订阅 FSM 状态转移，draw 状态退出 → idle 时调 `mapStore.addEntity`。
关键：读取**post-transition** snapshot，让 `removeLastPoint`
（DOUBLE_CLICK guard）propagation 不出 off-by-one。

## `useColdLayer`

```ts
export function groupFeaturesByEntity(features: GeoJSON.Feature[]): Map<string, GeoJSON.Feature[]>;
export function flattenEntityFeatures(/* ... */): GeoJSON.Feature[];
export function diffEntities(prev, next): { added; removed; changed };
export function hasEntityChanges(diff): boolean;
export function useColdLayer(map: maplibregl.Map | null): void;
```

冷层调度：subscribe `mapStore.entities` → RAF coalesce → 通过
`SpatialWorkerBridge.send()` 把 INCREMENTAL / SYNC 派给 worker，
回收 `COLD_READY` 后调用 `setData` 一次性更新 `cold` GeoJSONSource。

## `useHotLayer`

```ts
export type HotRenderState = {
  /* 关于 FSM 飞绘点 / drag preview */
};
export function samePoint(a: LngLat | null, b: LngLat | null): boolean;
export function sameHotRenderState(a: HotRenderState | null, b: HotRenderState): boolean;
export function useHotLayer(map: maplibregl.Map | null /* ... */): void;
```

不进 worker，60fps 帧内直接 setData。

## `useOverlayLayer`

```ts
export type OverlayRenderState = {
  /* 选中、snap、editPoints */
};
export function buildOverlayFeatures(state: OverlayRenderState): GeoJSON.Feature[];
export function useOverlayLayer(/* ... */): void;
```

## `useGridLayer`

```ts
export function metersForZoom(zoom: number): { step: number; majorEvery: number };
export const MAX_LINES_PER_AXIS: 240;
export function useGridLayer(map: maplibregl.Map | null): void;
```

## `useCursorManager`

```ts
export function cursorForState(currentState: string, connectModeActive?: boolean): string;
export function useCursorManager(/* ... */): void;
```

根据 FSM state name 返回 CSS cursor（`crosshair` / `grab` / `pointer`
/ `not-allowed` …）。connect mode 强制 `pointer`。

## `useDragPan`

```ts
export function shouldDisableDragPan(currentState: string, isDraggingHandle: boolean): boolean;
export function useDragPan(/* ... */): void;
```

拖拽 vertex / 整体 entity 时禁用 maplibre 默认 dragPan，避免画布
跟着拖。

## `useMapEventRouter`

```ts
export { isDuplicateInput };
export function useMapEventRouter(/* ... */): void;
```

把 maplibre 的 mouse / keydown 事件转 FSM event，并 dblclick 去重
（`isDuplicateInput`）。

## `useApolloLayer`

```ts
export function useApolloLayer(map: maplibregl.Map | null): void;
```

订阅 `apolloMapStore.rawMap`（导入但尚未编辑的原始 Apollo map），
直出 GeoJSON 源 `apollo-base`，给"导入预览"层用。

## `useLicenseSync`

```ts
export function useLicenseSync(): void;
```

挂在 `App.tsx`，把 Tauri / Web 的 license bridge 推到 `licenseStore`。

## 不变量

- 所有 hook 不直接修改 `mapStore.entities` —— 改动统一走
  `useActionDispatcher` 或 store action；
- 所有 hook 假设 maplibre 实例已经 ready（`useMapLibreInit` 完成）；
  顶层 `App.tsx` 用 condition rendering 保证。
