---
title: useCursorManager
description: 根据 FSM 状态与 connect-mode 选择 maplibre canvas 的 CSS cursor —— crosshair / grabbing / 默认。
---

# useCursorManager

> 源码：`src/hooks/useCursorManager.ts`

`useCursorManager` 决定 MapLibre canvas 的 `style.cursor` 该长什么样。
策略简单但与多个状态源耦合：

- `connectMode.active` 优先 → `crosshair`
- 否则 `editingPoint` → `grabbing`
- 否则 `isDrawingState(currentState)` → `crosshair`
- 否则 `''`（让 maplibre 自己处理 hover/grab）

它的存在让 cursor 变化和 FSM 解耦：UI 不需要在每个事件 handler 里手动
调 `canvas.style.cursor = ...`。

## 与 useDragPan 的关系

`useCursorManager` 与 [`useDragPan`](./use-drag-pan.md) 都基于 FSM 状态
做决策，但管的是不同维度：

- cursorManager —— 只改 `canvas.style.cursor`
- dragPan —— 只改 `map.dragPan.disable / enable`

两者订阅同一 actor 但互不依赖。它们曾经合并在一个 hook 里，但因为
cursor 还要响应 connectMode（uiStore），dragPan 还要响应
`isDraggingHandle`（FSM context），关注点重叠不一致；最终拆分为独立单元。

## cursor 状态总览

| FSM 状态          | connectMode | hot-points 命中 | 实际 cursor    | 写入者                           |
| ----------------- | ----------- | --------------- | -------------- | -------------------------------- |
| `idle`            | false       | —               | `''` (default) | `useCursorManager`               |
| `idle`            | true        | —               | `crosshair`    | `useCursorManager`               |
| `selected`        | false       | 否              | `''`           | router 写空字符串                |
| `selected`        | false       | 是              | `grab`         | `useMapEventRouter.onMouseMove`  |
| `selected`        | true        | —               | `crosshair`    | `useCursorManager`（优先级更高） |
| `editingPoint`    | —           | —               | `grabbing`     | `useCursorManager`               |
| `drawPolyline` 等 | false       | —               | `crosshair`    | `useCursorManager`               |

## 调试技巧

- 在 console 调用 `document.querySelector('canvas').style.cursor` 查看
  当前 cursor。
- 想看实时变化，可临时给 `applyCursor` 加 `console.log`，所有状态切换
  都会打印。
- connectMode 翻转可在 console 调
  `useUIStore.getState().toggleConnectMode()`。

## 单元可测性

`cursorForState` 是纯函数：输入 `(state, connectModeActive)` → 输出
cursor 字符串。`src/hooks/__tests__/useCursorManager.test.ts` 列出
完整真值表。FSM / store 副作用通过 mock actor 与 mock store 完成
集成测试。

## 设计回顾

历史上，多个 hook 都修改 cursor —— router 在 hover、layer hooks 在
load 完成、cursorManager 在 FSM 转移。后果：cursor 在某些瞬间被覆盖错。
2025 年初的 P9 重构后，policy 收敛为：

1. `useCursorManager` 是默认主战场。
2. `useMapEventRouter` 仅在 `selected` 状态下基于像素查询写
   `'grab'` / `''`，覆盖 cursorManager 的 `''`（不影响其它状态）。
3. 没有第三方写入。

## 触发频率

`actorRef.subscribe` 每次 FSM 转移都会回调；`useUIStore.subscribe` 仅
在 `connectMode.active` 真正翻转时调度。`applyCursor` 内部读 snapshot

- store 完成后写 cursor 字符串，单次成本 < 10μs，是廉价操作。

## "返回 ''" 的细节

`canvas.style.cursor = ''` 等价于"删除内联样式"，让 maplibre 自己
根据当前操作覆盖。它和 `cursor: 'auto'` / `cursor: 'default'` 不一样：

- `'auto'` —— 浏览器决定，通常退化为 `'default'` arrow，但对图像 / 链接等元素
  可能选 `pointer`。
- `'default'` —— 强制 arrow，会覆盖 maplibre 的 `grab`。
- `''` —— 移除属性；maplibre 重新接管，pan 时可以正常切换 grab/grabbing。

## 设计动机

- **避免散布**：早期版本里多个 hook 都在改 `canvas.style.cursor`，互相覆盖。
- **优先级清晰**：connect-mode 是一个 UI-level modal，比 FSM 更外层；
  必须放在最前。
- **不和 maplibre 内置 hover 抢**：默认值返回 `''` 而不是 `'default'`，
  让 maplibre 自己接管（例如 hover 在可拖动区域时变 `grab`）。

## 签名

```ts
function useCursorManager(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
): void;

export function cursorForState(currentState: string, connectModeActive?: boolean): string;
```

## 参数

| 名称       | 类型                                 | 角色            |
| ---------- | ------------------------------------ | --------------- |
| `mapRef`   | `RefObject<maplibregl.Map \| null>`  | MapLibre 实例。 |
| `actorRef` | `ActorRefFrom<typeof editorMachine>` | FSM actor。     |

## 副作用

| 副作用                            | 触发时机                                  | 清理                         |
| --------------------------------- | ----------------------------------------- | ---------------------------- |
| `canvas.style.cursor = ...`       | mount + 每次 actor / connectMode 变化     | —                            |
| `actorRef.subscribe(applyCursor)` | mount                                     | `subscription.unsubscribe()` |
| `useUIStore.subscribe(...)`       | mount，仅 connectMode.active 变化时 apply | 返回的 unsub                 |

## `cursorForState` 逻辑

```ts
// useCursorManager.ts:8-15
export function cursorForState(currentState: string, connectModeActive = false): string {
  if (connectModeActive) return 'crosshair';
  if (currentState === 'editingPoint') return 'grabbing';
  if (isDrawingState(currentState)) return 'crosshair';
  return '';
}
```

| FSM state                                     | connectMode | 返回          |
| --------------------------------------------- | ----------- | ------------- |
| 任意                                          | `true`      | `'crosshair'` |
| `editingPoint`                                | `false`     | `'grabbing'`  |
| `drawPolyline` / `drawArc` / `drawBezier` / … | `false`     | `'crosshair'` |
| `idle` / `selected`                           | `false`     | `''`          |

## 生命周期

```
mount
  ├── canvas = mapRef.current.getCanvas()
  ├── if !canvas: return
  ├── applyCursor() —— 用当前 snapshot + uiStore 立即写一次
  ├── subscribe(actorRef, applyCursor)
  └── subscribe(useUIStore, prev/next: connectMode.active 变化时 applyCursor)

unmount
  ├── actorSubscription.unsubscribe()
  └── unsubUI()
```

## 不变量

### connectMode 优先于 FSM

```ts
// useCursorManager.ts:11
if (connectModeActive) return 'crosshair';
```

connect-mode 是 UI-level modal —— 即使 FSM 还在 `selected`（因为
connect-mode 第一次点击 lane 后会 SELECT_ENTITY，让被选实体高亮），
cursor 仍要保持 crosshair，告诉用户"要点第二条 lane"。

### 默认值是空字符串而不是 `'default'`

```ts
// useCursorManager.ts:14
return '';
```

设置成空字符串等于"重置"，让 maplibre 自己根据 hover 状态选择
（pan 时是 `grab`，拖图时是 `grabbing`）。设成 `'default'` 会盖掉这些。

### `selected` 状态下 cursor 由 router 维护

`useCursorManager` 不处理 `selected`：当用户 hover hot-points 时，
`useMapEventRouter.onMouseMove` 直接写 `canvas.style.cursor = 'grab'`
（`useMapEventRouter.ts:137`）。

这是历史遗留：把 `selected` 移进本 hook 需要订阅 mapStore + 计算 hot
hits，复杂度不值得。

## 调用点

```tsx
// src/components/map/MapCanvas.tsx:42
useCursorManager(mapRef, actorRef);
```

## 错误模式

| 现象                           | 根因                                                        | 修复                                          |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| connect-mode 时 cursor 是默认  | UI 只调用 `useUIStore.toggleConnectMode` 但没触发 subscribe | 检查 store 的 set 是否真的 emit 了 prev≠next  |
| 拖拽时 cursor 不变 grabbing    | 没进 `editingPoint`                                         | 见 router `START_DRAG` 路径                   |
| 退出绘制后 cursor 卡 crosshair | actor subscribe 漏了 idle 转移                              | 不可能 —— `applyCursor` 每次 actor 变化都重算 |

## 测试

- `src/hooks/__tests__/useCursorManager.test.ts` —— `cursorForState` 真值表

## 参见

- [`useMapEventRouter`](./use-map-event-router.md)（hot-points hover 改 grab）
- [`useDragPan`](./use-drag-pan.md)（拖拽时禁 maplibre pan）
- [Editor Machine](../core/editor-machine.md)
- [`uiStore.connectMode`](../store/store-ui.md)

## 与 router hover 路径的边界

`useMapEventRouter.onMouseMove`（line 135-143）在 `selected` 状态下
检查 hot-points 命中：

```ts
if (state === 'selected') {
  const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
  map.getCanvas().style.cursor = hotHits.length > 0 ? 'grab' : '';
  // ...
}
```

这条直接写 cursor 是因为 `useCursorManager` 的 `cursorForState` 没有
"hover hot-points" 这个维度 —— 那是一个像素级查询结果，依赖 mapStore +
queryRenderedFeatures，超出了 `cursorForState` 的纯函数范围。

边界划分：

- `useCursorManager` —— FSM/connect-mode 全局 cursor
- `useMapEventRouter` —— hover 像素查询带来的瞬时 cursor 覆盖

二者写同一个 `canvas.style.cursor`，但优先级是 router → cursorManager（因为
router 的 `mousemove` 频率更高，最近一次写赢）。在 `selected` 状态下这正好
是想要的：FSM 不动，hover 决定光标。

## 浏览器原生兜底

`return ''` 让 maplibre 接管，常见效果：

- pannable area + 没按下 → `''`（默认 arrow）
- 按下 + 拖动 → `grab` / `grabbing`（maplibre 内置 dragPan handler 写入）

仅当 dragPan 被 [`useDragPan`](./use-drag-pan.md) 关掉时，pan 行为消失，
canvas 保持 `''`，看起来像普通光标——这是 `editingPoint` / `drawBezier`
中的预期表现。

## 源码索引

| 关注点               | 行号                        |
| -------------------- | --------------------------- |
| `cursorForState`     | `useCursorManager.ts:8-15`  |
| `applyCursor`        | `useCursorManager.ts:25-30` |
| 订阅 actor + uiStore | `useCursorManager.ts:33-36` |
| cleanup              | `useCursorManager.ts:38-41` |
