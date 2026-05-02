---
title: useMapEventRouter
description: 把 maplibre 的指针 / 键盘 / 缩放事件按 FSM 状态分流到 START_DRAG / SELECT_ENTITY / MOUSE_DOWN / DOUBLE_CLICK 等高层动作；并集中处理 connect-mode、snap、双击去重、cursor 节流。
---

# useMapEventRouter

> 源码：`src/hooks/useMapEventRouter.ts` · 子模块见 [Map Event Router 内部模块](./map-event-router-internals.md)

`useMapEventRouter` 是 Apollo Map Studio 主输入路由器。它在 `MapCanvas` 挂载
一次，把 `maplibregl.Map` 上的全部指针 / 键盘 / 缩放事件，按当前 FSM 状态
分流为高层动作：

- **`drawBezier` & 其它绘制态**：`mousedown` / `click` / `mousemove` →
  `MOUSE_DOWN` / `MOUSE_MOVE`，并通过 `isDuplicateInput` 去重 dblclick
  生成的伪 click。
- **`selected`**：交给 `handleSelectedMouseDown` 决定是否 `START_DRAG`，
  其它情况下 `click` 走 hit-test → `SELECT_ENTITY` / `DESELECT`。
- **`editingPoint`**：mousemove → `DRAG_MOVE`，mouseup → `updateEntity` +
  `DRAG_END`，center 拖拽时 `centerGrabOffset` 锁定光标和实体中心的差。
- **`idle`**：click hit-test → 命中实体则 `SELECT_ENTITY`；mousemove 仅更新
  cursor 与 snap target。
- **connect-mode**：拦截 click，调用 `handleConnectModeClick`。
- **键盘**：`Escape` / `Enter` / `Delete` 集中走 `handleMapKeyDown`。
- **zoomend**：写 `useUIStore.setCurrentZoom`，驱动状态条与 grid 重算。

每个具体路径的实现都拆到 `mapEventRouter/` 子模块里，本 hook 仅做**调度**。

## 设计动机

- **状态驱动**：`actorRef.getSnapshot().value` 是路由的唯一依据，避免分散
  的 if/else 散布在事件处理函数里。
- **抗重复点击**：`mousedown` + `dblclick` 在 maplibre 上会衍生伪
  `click` 事件，`isDuplicateInput` 用 px+ms 双窗口去重。
- **drag/编辑态独立分支**：`editingPoint` 完全跳过其它路径，避免被 selection
  逻辑误抢。

## 状态守门为什么放在 promise 回流处

```ts
hitTest(e).then((hitId) => {
  const current = actorRef.getSnapshot();
  if ((current.value as string) !== 'selected') return;
  // ...
});
```

`workerHitTest` 是异步的；用户在等待结果期间可能 Esc / dblclick / 切换工具，
让 FSM 状态变化。回流时如果不重新读取 snapshot，路由器可能在 `idle` 上
误发 `SELECT_ENTITY`。这一守门贯穿 `idle` / `selected` / `connect` 各路径。

## 签名

```ts
function useMapEventRouter(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
): void;

export { isDuplicateInput };
```

## 参数

| 名称        | 类型                                     | 角色                                                     |
| ----------- | ---------------------------------------- | -------------------------------------------------------- |
| `mapRef`    | `RefObject<maplibregl.Map \| null>`      | MapLibre 实例。                                          |
| `actorRef`  | `ActorRefFrom<typeof editorMachine>`     | FSM actor。                                              |
| `bridgeRef` | `RefObject<SpatialWorkerBridge \| null>` | spatial worker 桥；`workerHitTest` 通过它发 `HIT_TEST`。 |

## 副作用

| 副作用                                                                                  | 触发时机                                       | 清理                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| `map.on('mousedown' / 'click' / 'mousemove' / 'mouseup' / 'dblclick' / 'zoomend', ...)` | mount                                          | 同名 `map.off(...)`       |
| `window.addEventListener('keydown', onKeyDown)`                                         | mount                                          | `removeEventListener`     |
| `useUIStore.subscribe(...)` 监听 snapEnabled 翻转                                       | mount                                          | 返回 `unsubSnap()`        |
| `cursorScheduler.dispose()`                                                             | unmount                                        | —                         |
| `bridge.send({ type: 'HIT_TEST' })`                                                     | `hitTest()` 调用（idle/selected/connect 模式） | 通过 promise 自带超时丢弃 |
| `useUIStore.getState().setSnapTarget(...)`                                              | `applySnap` 内部                               | —                         |
| `map.dragPan.disable() / enable()`                                                      | START_DRAG / DRAG_END                          | —                         |
| `useMapStore.getState().updateEntity(...)`                                              | `mouseup` 提交编辑                             | —                         |

## 路由表

| FSM state           | event                    | 动作                                                              |
| ------------------- | ------------------------ | ----------------------------------------------------------------- |
| `selected`          | `mousedown` (hot-points) | `handleSelectedMouseDown` → `START_DRAG` 或 `TOGGLE_SMOOTH`       |
| `selected`          | `mousedown` (hot-fill)   | 计算 `centerGrabOffset` → `START_DRAG{ index:-2, type:'center' }` |
| `selected`          | `click` (hot-points)     | 跳过（不抢拖拽）                                                  |
| `selected`          | `click` (其它)           | hitTest → `SELECT_ENTITY` 或 `DESELECT`                           |
| `selected`          | `mousemove`              | 维护光标 `grab` / 清 snap target                                  |
| `idle`              | `click`                  | hitTest → `SELECT_ENTITY` 或保持 idle                             |
| `idle`              | `mousemove`              | 只清 snap target                                                  |
| `editingPoint`      | `mousemove`              | applySnap (excludeId) → `DRAG_MOVE`                               |
| `editingPoint`      | `mouseup`                | applySnap → updateEntity + `DRAG_END`                             |
| `editingPoint`      | `mousedown`              | 短路（避免重启 drag）                                             |
| `drawBezier`        | `mousedown`              | dedup → applySnap → `MOUSE_DOWN`                                  |
| 其它 draw           | `click`                  | dedup → applySnap → `MOUSE_DOWN`                                  |
| 任意                | `mousemove`              | applySnap → `MOUSE_MOVE`                                          |
| 任意                | `dblclick`               | applySnap → `DOUBLE_CLICK`（清 `lastDrawInput`）                  |
| 任意                | `keydown`                | `handleMapKeyDown`（Esc / Enter / Del / Backspace）               |
| 任意                | `zoomend`                | `setCurrentZoom(map.getZoom())`                                   |
| connect-mode active | `click`                  | `handleConnectModeClick` 拦截                                     |

## 双击去重

```mermaid
sequenceDiagram
    participant User
    participant Map as maplibre
    participant Router as useMapEventRouter
    participant FSM

    User->>Map: dblclick
    Map->>Router: mousedown #1
    Router->>Router: sample = {x,y,ts}; dedup → emit MOUSE_DOWN
    Map->>Router: click #1 (synthetic)
    Note over Router: state !== 'drawBezier'<br/>isDuplicateInput(prev, sample)?
    Router-->>Map: true → swallow
    Map->>Router: mousedown #2
    Router-->>Map: dedup ratio < threshold → swallow<br/>但仍更新 lastDrawInput
    Map->>Router: dblclick
    Router->>Router: lastDrawInput = null
    Router->>FSM: send DOUBLE_CLICK
```

`isDuplicateInput`（`mapEventRouter/inputDedup.ts`）使用 px<4 + ms<350 双窗口
判定。它必须在 `mousedown` / `click` 处理后立即更新 `lastDrawInput`，
否则下一次的 dblclick 触发的伪 click 会被错误地视作真实点击。

## click 距离阈值

```ts
// useMapEventRouter.ts:67-69
if (mouseDownScreenPos) {
  const dx = e.point.x - mouseDownScreenPos.x;
  const dy = e.point.y - mouseDownScreenPos.y;
  if (Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) return;
}
```

mousedown→mouseup 之间位移过大时（拖动 pan），`click` 事件不应被路由。
这避免了"一边拖图、一边在 idle 中误选实体"的体验问题。

## connect-mode 优先级

```ts
// useMapEventRouter.ts:72
if (handleConnectModeClick(actorRef, hitTest, e)) return;
```

`handleConnectModeClick` 内部检查 `useUIStore.connectMode.active`；只要
活跃就吃掉 click 并完成 lane 选择/连接，其它分支不会触发。

## 键盘事件

`handleMapKeyDown` 集中处理：

- `Escape` —— 退出 connect-mode + `CANCEL`
- `Enter` —— `CONFIRM`
- `Delete` / `Backspace` —— `selected` 状态下：vertex 模式删点（保留实体）；
  否则发送 `DELETE_ENTITY` + `removeEntity`

## center 拖拽偏移

```ts
// useMapEventRouter.ts:117-130
if (state === 'editingPoint') {
  const excludeId = snap.context.selectedEntityId ?? null;
  let pt = applySnap(toLngLat(e), excludeId);
  if (snap.context.dragPointType === 'center' && centerGrabOffset) {
    pt = [pt[0] - centerGrabOffset[0], pt[1] - centerGrabOffset[1]];
  }
  actorRef.send({ type: 'DRAG_MOVE', point: pt });
  return;
}
```

`centerGrabOffset` 在 `handleSelectedMouseDown` 中锁定为 `(cursor - center)`
的 lng/lat 差。后续每帧的 mousemove 都要扣除这一偏移，否则被抓住的点会
"跳"到光标下面，让 center 拖拽看起来抖动。

## 调用点

```tsx
// src/components/map/MapCanvas.tsx:36
useMapEventRouter(mapRef, actorRef, bridgeRef);
```

唯一调用方是 `MapCanvas`。

## 错误模式

| 现象                               | 根因                                                         | 修复                                                        |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| dblclick 同时触发了一次 MOUSE_DOWN | `isDuplicateInput` 阈值过严                                  | 调 `DBLCLICK_PX_TOLERANCE` / `DBLCLICK_MS_WINDOW`           |
| 空白区域 click 后实体仍被选中      | `idle` 分支的 hitTest 在 `current.value !== 'idle'` 时被丢弃 | 见 line 96-103 的 `current.value as string !== 'idle'` 守门 |
| pan 后立刻误选实体                 | `CLICK_THRESHOLD_PX` 太小                                    | 见 `config/mapConstants.ts`                                 |
| Esc 没退 connect-mode              | `handleMapKeyDown` 漏了 `exitConnectMode`                    | 见 `mapEventRouter/keyboard.ts`                             |
| dragPan 不关                       | `useDragPan` 没挂载                                          | 见 [`useDragPan`](./use-drag-pan.md)                        |

## 测试

- `src/hooks/__tests__/useMapEventRouter.test.ts`
- `src/components/map/__tests__/entityMutations.test.ts` —— 检查 mouseup
  写回路径的纯函数层

## 参见

- [Map Event Router 内部模块](./map-event-router-internals.md)
- [`useDrawCommit`](./use-draw-commit.md)
- [`useCursorManager`](./use-cursor-manager.md)
- [`useDragPan`](./use-drag-pan.md)
- [`SpatialWorkerBridge`](../core/spatial-bridge.md)

## 性能注记

- `cursorScheduler` 把 60Hz 的 `mousemove` 合并为 RAF，避免 store 写
  入抖动地图渲染。
- `applySnap` 在每个 mousemove 调用，但内部 `findSnapTarget` 用 RBush 索引
  - 半径过滤，O(log n + k)。
- `workerHitTest` 是异步 promise；同一帧内对应的 click 路径都通过
  `current.value === 'idle' / 'selected'` 守门避免回流过期。
- 双击去重的 px+ms 双窗口非常严格；若用户使用慢速触控板，可调高
  `DBLCLICK_MS_WINDOW`。

## 与其它 hook 的边界

| 关注                        | 归属 hook                                                    |
| --------------------------- | ------------------------------------------------------------ |
| 派发 FSM 事件               | useMapEventRouter                                            |
| 落盘 entity                 | useDrawCommit                                                |
| canvas cursor               | useCursorManager（router 在 hover hot-points 时直接改 grab） |
| dragPan disable/enable      | useDragPan（router 也兜底 disable 一次）                     |
| FSM → cold/hot/overlay 渲染 | useColdLayer / useHotLayer / useOverlayLayer                 |
| store ↔ FSM                 | actorRef 的 send / subscribe                                 |

## 源码索引

| 关注点                         | 行号                           |
| ------------------------------ | ------------------------------ |
| 状态闭包变量                   | `useMapEventRouter.ts:29-39`   |
| `onMouseDown` 路由             | `useMapEventRouter.ts:41-63`   |
| click 距离阈值                 | `useMapEventRouter.ts:65-69`   |
| connect-mode 优先级            | `useMapEventRouter.ts:72`      |
| `idle` / `selected` click 分支 | `useMapEventRouter.ts:74-104`  |
| `onMouseMove` 三分支           | `useMapEventRouter.ts:117-153` |
| `onMouseUp` 提交编辑           | `useMapEventRouter.ts:155-184` |
| `onDblClick`                   | `useMapEventRouter.ts:186-190` |
| `onKeyDown` 委派               | `useMapEventRouter.ts:192-196` |
| `zoomend` 同步                 | `useMapEventRouter.ts:198-201` |
| 事件订阅 + cleanup             | `useMapEventRouter.ts:205-231` |
