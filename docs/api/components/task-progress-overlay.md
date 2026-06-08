---
title: TaskProgressOverlay
description: 全屏 modal 进度条——长任务（导入/导出、Spatial worker 重算）专用，按 visibleAfterMs 延迟呈现以避免快任务闪烁。
---

# TaskProgressOverlay

> 源码：`src/components/layout/TaskProgressOverlay.tsx`

## 用途与 UX 角色

`TaskProgressOverlay` 是一个**单实例**全屏遮罩，专为编辑器中需要可视化进度的"重"任务设计：

- Apollo `.bin/.txt` 导入（解析 + entityOps 转换）
- Apollo `.bin/.txt` 导出
- Spatial worker 大规模 SYNC（首次加载 1e4+ entities）
- 未来：批量替换、批量重算 region overlap

它消费 `useTaskProgressStore` 的 `activeTask` 字段——任何地方调用 `taskProgressStore.start({ ... })` 都会触发本 overlay。结束 `taskProgressStore.finish()` 即关闭。

UX 关键点：

- **`visibleAfterMs` 延迟显示**：500ms 内完成的任务不闪屏，避免视觉噪音。
- **不可关闭**：没有 `×` 按钮——长任务期间用户被有意阻塞，否则会双触发导入/导出。
- **进度条两种模式**：`progress: number` → 显示百分比 + width 动画；`progress: null` → "indeterminate" cyan 横条循环动画。

## 组件接口

```ts
export function TaskProgressOverlay(): JSX.Element | null;
```

无 props。所有数据来自 `useTaskProgressStore`：

```ts
interface ActiveTask {
  label: string;
  detail?: string;
  startedAt: number;
  visibleAfterMs: number;
  progress: number | null; // 0..1 or null for indeterminate
}
```

## 内部状态

| 钩子                                 | 用途                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| `useTaskProgressStore(s.activeTask)` | 订阅当前任务（null 表示无任务）                             |
| `useState<number>(Date.now())` `now` | 通过 `setInterval(setNow, 100)` 每 100ms 更新——驱动延迟判定 |

## 副作用

```ts
useEffect(() => {
  if (!activeTask) return;
  setNow(Date.now());
  const timer = window.setInterval(() => setNow(Date.now()), 100);
  return () => window.clearInterval(timer);
}, [activeTask]);
```

任务存在时每 100ms tick 一次，仅用于 `elapsedMs >= visibleAfterMs` 的判定。任务结束 cleanup 立即停 timer。

## 渲染骨架

```jsx
if (!activeTask) return null;
const elapsedMs = now - activeTask.startedAt;
if (elapsedMs < activeTask.visibleAfterMs) return null;

const pct =
  activeTask.progress === null ? null : Math.round(Math.min(1, activeTask.progress) * 100);

return (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45">
    <div className="w-[min(420px,calc(100vw-32px))] rounded-md border border-white/10 bg-zinc-950/95 p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="truncate text-sm font-medium text-zinc-100">{activeTask.label}</div>
          {activeTask.detail && (
            <div className="mt-1 truncate text-xs text-zinc-500">{activeTask.detail}</div>
          )}
        </div>
        {pct !== null && <div className="font-mono text-xs text-cyan-300">{pct}%</div>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded bg-zinc-800">
        {pct === null ? (
          <div className="h-full w-1/3 animate-[ams-indeterminate_1.1s_ease-in-out_infinite] rounded bg-cyan-400" />
        ) : (
          <div
            className="h-full rounded bg-cyan-400 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  </div>
);
```

`ams-indeterminate` keyframes 见 `src/index.css`。

## 性能注释

- **100ms tick**：刚好够流畅显示百分比，又不浪费 CPU。
- **z-[100]**：高于 CommandPalette / SettingsPanel（z-50），因为长任务期间不应被叠加。
- **bg-black/45 vs CommandPalette bg-black/60**：略浅，强调"非 dialog"。

## 已知缺口

- **没有 cancel 按钮**：长任务无法中断；如果要支持取消，需要先扩展 worker 协议并接入 `AbortController`。
- **进度更新粒度依赖 caller**：worker SYNC 任务目前 0% → 100% 一跳，没有中间进度。
- 同一时刻只能显示**一个**任务；并发任务需要队列化（`taskProgressStore` 已有 `start/finish` 栈语义，但 overlay 只读 `activeTask`）。

## 源码索引

| 关注点            | 文件位置                         |
| ----------------- | -------------------------------- |
| 组件主体          | `TaskProgressOverlay.tsx:4-49`   |
| 100ms tick effect | `TaskProgressOverlay.tsx:8-13`   |
| 进度条样式        | `TaskProgressOverlay.tsx:36-44`  |
| keyframe 定义     | `src/index.css`                  |
| Store             | `src/store/taskProgressStore.ts` |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — 始终挂载于根
- [`taskProgressStore`](/api/store/) — 启动/结束任务 API
- 调用方：`src/io/mapIO.ts` / `src/io/apolloIOBridge.ts` / `src/io/apolloIO.worker.ts` / `src/core/workers/spatialBridge.ts`

## 英文镜像

[/en/api/components/task-progress-overlay](/en/api/components/task-progress-overlay)

## 与其他组件的协作

本组件位于 [WorkspaceLayout](./workspace-layout.md) 装配的 React 树中——大部分协作通过 store / context 完成，少量通过 props 直接传递。下表枚举可观察到的耦合点：

| 组件                                     | 协作方式                                                            |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [WorkspaceLayout](./workspace-layout.md) | 直接 mount 并/或注入 `actorRef` / 调度 callback                     |
| [MapCanvas](./map-canvas.md)             | 通过 `mapStore.entities` 间接联动（修改后冷层 round-trip 重渲染）   |
| [LayerTree](./layer-tree.md)             | 通过 `mapStore` 共享实体状态                                        |
| [InspectorForms](./inspector-forms.md)   | 通过 `editorMachine.context.selectedEntityId` 同步选中实体          |
| [Action Registry](/api/core/)            | 共享同一份 `ACTION_DEFS`；新增交互通常加 action，而不是组件特化逻辑 |

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

## 与其他组件的协作

| 组件                                                                          | 协作方式                                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [WorkspaceLayout](./workspace-layout.md)                                      | 始终 mount 在树根（`WorkspaceLayout.tsx:177`）                                                                                    |
| `taskProgressStore` 调用方                                                    | `src/io/mapIO.ts` / `src/io/apolloIOBridge.ts` / `src/io/apolloIO.worker.ts` / `src/core/workers/spatialBridge.ts` 等长任务发起方 |
| [CommandPalette](./command-palette.md) / [SettingsPanel](./settings-panel.md) | z-index 不冲突（Overlay z=100 > modal z=50）                                                                                      |

## 故障排查

| 症状                    | 可能原因                                       | 修复路径                           |
| ----------------------- | ---------------------------------------------- | ---------------------------------- |
| 进度条短任务后仍闪一下  | `visibleAfterMs` 设置过低                      | 改回 500ms 默认值                  |
| 不显示                  | caller 没有 `start({ ... })` 或同步 `finish()` | 检查任务调用栈                     |
| 卡死 100% 不消失        | `finish()` 在 catch 后未调用                   | 在 `try/finally` 中始终 `finish()` |
| z-index 被某 modal 覆盖 | 第三方 lib 用了更高 z                          | 把对方降回 < 100 / 改用 portal     |

## 设计决策

**为什么 `visibleAfterMs` 默认 500ms？**
低于 500ms 任务用户感知不到延迟；显示 spinner 反而成噪音。500ms 是 NN 研究的"用户开始等待焦虑"阈值。

**为什么 indeterminate 用 1.1s 周期？**
经验值——比 1s 慢一点，避免和 60Hz 整除节拍同步导致视觉"跳跃"，比 1.5s 快避免显得拖沓。

**为什么单实例而非队列？**
长任务通常是用户主动触发（导入/导出），同时跑两个长任务的 UX 本身就奇怪。如果未来需要并发，可以改 store 为栈，overlay 显示最新任务并把旧任务摞到下方。
