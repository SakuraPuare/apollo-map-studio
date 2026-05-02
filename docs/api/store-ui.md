---
title: Store / UI
description: src/store/uiStore.ts — drawing/scene 模式、grid/snap、layer 显隐、connect 模式、cursor / zoom 等瞬时 UI 状态
---

# Store / UI

`src/store/uiStore.ts` 是 Apollo Map Studio 的瞬时 UI 状态层。它不持久化、
不接入 zundo，也不保存地图实体。地图实体见
[Store / Map](/api/store-map)。本节列出 `uiStore` 的全部状态字段、actions、
布尔不变量与典型使用模式。

## 类型签名

```ts
import { create } from 'zustand';
import type { SnapTarget } from '@/core/geometry/snap';

export type AppMode = 'drawing' | 'scene';

interface LayerState {
  visible: boolean;
  locked: boolean;
}

interface UIState {
  appMode: AppMode;
  gridEnabled: boolean;
  snapEnabled: boolean;
  layerStates: Record<string, LayerState>;
  cursorLngLat: [number, number] | null;
  currentZoom: number;
  sidebarVisible: boolean;
  currentSnapTarget: SnapTarget | null;
  connectMode: {
    active: boolean;
    firstLaneId: string | null;
  };
}

interface UIActions {
  setAppMode(mode: AppMode): void;
  toggleAppMode(): void;
  toggleGrid(): void;
  toggleSnap(): void;
  setLayerVisible(type: string, visible: boolean): void;
  setLayerLocked(type: string, locked: boolean): void;
  toggleLayerVisible(type: string): void;
  toggleLayerLocked(type: string): void;
  isLayerVisible(type: string): boolean;
  isLayerLocked(type: string): boolean;
  setCursorLngLat(pos: [number, number] | null): void;
  setCurrentZoom(zoom: number): void;
  toggleSidebar(): void;
  setSnapTarget(target: SnapTarget | null): void;
  toggleConnectMode(): void;
  exitConnectMode(): void;
  setConnectFirstLane(id: string | null): void;
}

type UIStore = UIState & UIActions;

export const useUIStore: import('zustand').UseBoundStore<UIStore>;
```

> Source: `src/store/uiStore.ts:29-202`

## State 字段

| 字段                | 类型                                      | 默认值                                  | 说明                             |
| ------------------- | ----------------------------------------- | --------------------------------------- | -------------------------------- |
| `appMode`           | `'drawing' \| 'scene'`                    | `'drawing'`                             | 顶层模式切换；只读视图也走 scene |
| `gridEnabled`       | `boolean`                                 | `true`                                  | 网格层是否绘制                   |
| `snapEnabled`       | `boolean`                                 | `false`                                 | 顶点/边吸附是否生效              |
| `layerStates`       | `Record<entityType, { visible, locked }>` | 全部 `{ visible: true, locked: false }` | 13 种实体类型的可见性与锁状态    |
| `cursorLngLat`      | `[lng, lat] \| null`                      | `null`                                  | 鼠标当前经纬度（footer 显示用）  |
| `currentZoom`       | `number`                                  | `18`                                    | maplibre 当前 zoom level         |
| `sidebarVisible`    | `boolean`                                 | `true`                                  | 左侧面板可见                     |
| `currentSnapTarget` | `SnapTarget \| null`                      | `null`                                  | 实时吸附目标（drawing/dragging） |
| `connectMode`       | `{ active, firstLaneId }`                 | `{ active: false, firstLaneId: null }`  | 「连接两条 lane」临时模式状态    |

`ENTITY_TYPES` 数组定义了 layerStates 的初始 keys：`lane`、`junction`、
`parkingSpace`、`signal`、`crosswalk`、`stopSign`、`speedBump`、`polyline`、
`catmullRom`、`bezier`、`arc`、`rect`、`polygon`。

## Actions

### App mode

```ts
setAppMode(mode: AppMode): void
toggleAppMode(): void  // drawing ↔ scene
```

### Grid / Snap

```ts
toggleGrid(): void
toggleSnap(): void
```

`gridEnabled` 由 `useGridLayer` 订阅，`snapEnabled` 由 `mapEventRouter` 检查。

### Layer 可见性 / 锁

```ts
setLayerVisible(type: string, visible: boolean): void
setLayerLocked(type: string, locked: boolean): void
toggleLayerVisible(type: string): void
toggleLayerLocked(type: string): void
isLayerVisible(type: string): boolean   // 读取，未注册类型默认 true
isLayerLocked(type: string): boolean    // 读取，未注册类型默认 false
```

未在 `layerStates` 注册的 `type`（例如 Apollo 6.0 新增的实体类型）
默认 `visible: true / locked: false`，避免新增类型默认隐形。

### Viewport

```ts
setCursorLngLat(pos: [number, number] | null): void
setCurrentZoom(zoom: number): void
```

由 `useMapEventRouter` 在 `mousemove` / `zoom` 事件里调用。

### Sidebar

```ts
toggleSidebar(): void
```

### Snap target indicator

```ts
setSnapTarget(target: SnapTarget | null): void
```

实现里有 dedup：如果与上一次同 `kind / entityId / point.x / point.y`
就 short-circuit return，避免每帧 60fps mousemove 都触发 React 重渲。

### Connect mode

```ts
toggleConnectMode(): void
exitConnectMode(): void
setConnectFirstLane(id: string | null): void
```

工作流：

1. `toggleConnectMode()` 进入 connect mode (active=true, firstLaneId=null)；
2. 用户点击第一条 lane → `setConnectFirstLane(laneId)`；
3. 用户点击第二条 lane → `mapEventRouter.connectMode` 调
   `applyLaneConnection` 完成连接 → `exitConnectMode()`；
4. ESC 或第二次切换 → 任意时刻 `exitConnectMode()` 恢复。

## 使用模式

```ts
// React selector（推荐）
const gridEnabled = useUIStore((s) => s.gridEnabled);
const toggleGrid = useUIStore((s) => s.toggleGrid);

// 非 React 上下文
const layerLocked = useUIStore.getState().isLayerLocked('lane');

// 多字段订阅 + shallow
import { useShallow } from 'zustand/react/shallow';
const [zoom, cursor] = useUIStore(useShallow((s) => [s.currentZoom, s.cursorLngLat]));
```

## 不变量

- `layerStates` 的引用稳定性：所有 set/toggle 都通过 `patchLayer` 返回**新对象**，
  不会原地 mutate；React 选择器/`useShallow` 比较有效。
- `connectMode.firstLaneId` 仅在 `connectMode.active === true` 时有意义。
- `currentSnapTarget` 的更新经 dedup 过滤，引用稳定 = 没有几何变化。

## 不进 store 的状态

- 当前选中实体 id：在 `editorMachine`（XState）里，参考 `useActionDispatcher`；
- 当前 hover 实体：在 hot layer / overlay layer 的局部 state；
- localStorage 偏好：在 `settingsStore`。
