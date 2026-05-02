---
title: TimelinePanel
description: 场景模式下的底部时间轴面板，提供 transport 控件、适配容器宽度的 ruler，以及 tracks/keyframes 的可视化渲染。
---

# TimelinePanel

> 源码：`src/components/layout/panels/TimelinePanel.tsx`

## 用途与 UX 角色

`TimelinePanel` 是 Scene 模式下方的时间轴面板（默认 180px 高）。它目前负责展示时间轴交互骨架：tracks 和 keyframes 来自组件内部状态，尚未连接到 mapStore、apolloMapStore 或持久化存储。

它覆盖的主要界面能力包括：

- 顶栏 transport 控件（`SkipBack` / `Play/Pause` / `Stop` / `SkipForward` + `Add Track`）
- 时间显示 `mm:ss.cc / mm:ss.cc`
- 左侧 `160px` 固定宽度 track header 列（chevron + 颜色点 + 名称）
- 右侧"自适应宽度"的 track + ruler 区，**永不出现水平滚动条**——通过 `ResizeObserver` 测出可用宽度，把 `effectiveZoom`（px/秒）设为 `(width - 16) / duration`
- 播放头（cyan 1px 竖线 + 顶部圆点）
- 每个 keyframe 渲染为 12px×12px 旋转 45° 的方块，颜色取自 track

## 组件接口

`TimelinePanel` 不接受 props：

```ts
export function TimelinePanel(): JSX.Element;
```

## 内部状态

```ts
interface TimelineState {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  tracks: Track[];
}

interface Track {
  id: string;
  name: string;
  entityId: string;
  keyframes: { time: number; value: unknown }[];
  expanded: boolean;
  color: string;
}
```

| 钩子                                     | 用途                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| `useState<TimelineState>(...)`           | 当前 30s duration + 3 个示例 track（Ego / NPC1 / Signal） |
| `useState<number>(600)` `trackAreaWidth` | 容器宽度，由 ResizeObserver 同步                          |
| `useRef<HTMLDivElement>` `trackAreaRef`  | 度量目标                                                  |
| `useRef<number \| null>` `animationRef`  | 播放循环用的 RAF 句柄                                     |

## 副作用

| 时机                                               | 行为                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useLayoutEffect([])`                              | 创建 `ResizeObserver(update)`，初次同步宽度，cleanup 时 `disconnect()`                                                                                   |
| `useEffect([isPlaying, duration])`                 | `isPlaying=true` 时 `requestAnimationFrame(tick)`：每帧 `currentTime = startPlayTime + (now - startTime)`；越界则停止；cleanup 时 `cancelAnimationFrame` |
| `togglePlay` / `stop` / `skipBack` / `skipForward` | 修改 `isPlaying` / `currentTime`                                                                                                                         |
| `toggleTrackExpand(id)`                            | 切换 track 的 `expanded`                                                                                                                                 |

::: info `tick` 闭包注意事项
`tick` 内部用函数式 setState 更新 `currentTime`，所以 `useEffect` 依赖数组**不**包含 `currentTime` —— 否则每帧都会 restart 动画。注意 `// eslint-disable-next-line react-hooks/exhaustive-deps`。
:::

## 子组件

### `Playhead`

```ts
function Playhead({ time, zoom }: { time: number; zoom: number }): JSX.Element;
```

播放头：cyan 竖线 + 顶部 12px 圆点。`left = time * zoom`，pointer-events:none。

### `TimeRuler`

```ts
function TimeRuler({ duration, zoom }: { duration: number; zoom: number }): JSX.Element;
```

- 通过 `pickRulerStep(duration, zoom)` 选出在当前缩放下 ~60px 的 tick 步长（候选：`0.1 / 0.2 / 0.5 / 1 / 2 / 5 / 10 / 15 / 30 / 60`）。
- 每条 tick 一根 2px 短线 + `{t}s` 标签。

### `pickRulerStep`

```ts
function pickRulerStep(duration: number, zoom: number): number;
```

返回最小的"≥ 60/zoom"候选步长；超出列表则 fallback `Math.ceil(duration / 10)`。

## 渲染骨架

```jsx
<div className="h-full flex flex-col bg-zinc-950">
  <div className="h-9 flex items-center gap-2 px-3 border-b border-white/[0.07]">
    {/* transport buttons + 时间显示 + Add Track */}
  </div>
  <div className="flex-1 flex overflow-hidden">
    <div style={{ width: 160 }}>{/* track header column */}</div>
    <div ref={trackAreaRef} className="flex-1 min-w-0 relative overflow-hidden">
      <TimeRuler … />
      <div className="relative">{state.tracks.map(track => …)}</div>
      <Playhead time={currentTime} zoom={effectiveZoom} />
    </div>
  </div>
</div>
```

## 性能注释

- **fit-to-container 而非可滚动**：避免出现水平滚动条；适合时间轴概览展示。N 个 keyframe 全部渲染为绝对定位 div，超过约 500 个 keyframe 后建议引入虚拟化。
- **RAF 播放循环**：动画通过 `requestAnimationFrame` 在 60fps 下推进；停止时及时 `cancelAnimationFrame`。
- **ResizeObserver 单次创建**：不会在每次 render 都重建。

## 已知缺口

- track 数据来自 `useState` 默认值，没有 `setEntities` / `addKeyframe` 等真实编辑接口。
- 没有拖动播放头、没有可调 duration、没有 track ↔ entity 双向链接。
- 复制/粘贴 keyframe、TimingEasing 曲线全部缺失。
- "Add Track" 按钮 onClick 为空——点了没反应。

## 源码索引

| 关注点           | 文件位置                    |
| ---------------- | --------------------------- |
| 主组件           | `TimelinePanel.tsx:100-344` |
| `Playhead`       | `TimelinePanel.tsx:43-54`   |
| `pickRulerStep`  | `TimelinePanel.tsx:62-70`   |
| `TimeRuler`      | `TimelinePanel.tsx:72-96`   |
| ResizeObserver   | `TimelinePanel.tsx:150-163` |
| 播放循环         | `TimelinePanel.tsx:172-201` |
| Transport 控件   | `TimelinePanel.tsx:235-278` |
| Track header 列  | `TimelinePanel.tsx:281-309` |
| Track + ruler 列 | `TimelinePanel.tsx:311-340` |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — `TimelinePanelContent` 在 scene 模式下被加入 Dockview
- [架构](/architecture/) — Scene 模式 vs Drawing 模式区分

## 英文镜像

[/en/api/components/timeline-panel](/en/api/components/timeline-panel)

## 与其他组件的协作

本组件位于 [WorkspaceLayout](./workspace-layout.md) 装配的 React 树中——大部分协作通过 store / context 完成，少量通过 props 直接传递。下表枚举可观察到的耦合点：

| 组件                                     | 协作方式                                                            |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [WorkspaceLayout](./workspace-layout.md) | 直接 mount 并/或注入 `actorRef` / 调度 callback                     |
| [MapCanvas](./map-canvas.md)             | 通过 `mapStore.entities` 间接联动（修改后冷层 round-trip 重渲染）   |
| [LayerTree](./layer-tree.md)             | 通过 `mapStore` 共享实体状态                                        |
| [InspectorForms](./inspector-forms.md)   | 通过 `editorMachine.context.selectedEntityId` 同步选中实体          |
| [Action Registry](/api/core)             | 共享同一份 `ACTION_DEFS`；新增交互通常加 action，而不是组件特化逻辑 |

::: tip 维护建议
当组件之间需要**直接 prop 传递**时，先问自己：能不能改放到 store？如果该数据被 ≥3 个组件读取，store 通常更合适；2 个之间则 props 更轻量。
:::

## 设计 Token 与样式约定

本组件遵循 [架构](/architecture/) "Design tokens" 章节的命名约定：

- 背景：`bg-ams-bg-base` / `bg-ams-surface-active` / `bg-ams-surface-hover`
- 文字：`text-ams-text-primary` / `text-ams-text-secondary` / `text-ams-text-muted` / `text-ams-text-disabled`
- 边界：`border-ams-border-subtle` / `border-ams-border-strong`
- 强调：`text-ams-accent` / `bg-ams-accent`

新增样式应优先复用以上 token。如果当前 token 不能精确表达意图，再扩展 `src/index.css` 的 `@theme` 块。

## 测试策略

| 测试类型                | 关注点                                                         |
| ----------------------- | -------------------------------------------------------------- |
| 单元（vitest）          | Pure 函数、reducer、derived selector                           |
| 组件（testing-library） | props → render output、用户交互 → 回调触发                     |
| 集成                    | 与 store 协同（mock 全局 store） / 与 actor 协同（mock actor） |
| E2E（Playwright）       | 跨组件流程（draw → undo → redo / import → 编辑 → export）      |

测试文件遵循 `__tests__/{component}.test.tsx` 命名约定，与组件同级。
