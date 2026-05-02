---
title: taskProgressStore — 长任务进度状态
description: 单插槽的长任务状态机，配合 visibleAfterMs 抑制短任务闪烁，给状态栏 / 进度条提供唯一数据源。
---

# `taskProgressStore` — 长任务进度状态

> 源码：`src/store/taskProgressStore.ts` · 66 行 · 不参与撤销 · 单插槽

## 用途

`taskProgressStore` 是一个 "**当前活跃任务**" 单插槽的小型 store，专给状态栏 / 进度条用。它存在的意义：

1. **抑制闪烁**——`visibleAfterMs`（默认 1 秒）让导入 / 导出小图时根本不弹进度条。
2. **统一显示**——只有一个全局 active task；同时只展示一份进度，避免状态栏堆叠。
3. **0–1 进度归一化**——`progress` 归一到 `[0, 1]`，UI 不需要做条件判断。

设计权衡：**没有任务队列**。同时只允许一个长任务（导入 → 导出 → 重渲染按 promise 串行）；新 `beginTask` 直接覆盖前一个 active task，老任务的 `endTask` 被无视（id 不匹配）。

## 公共 API

| 符号                    | 类型      | 签名                                                     | 摘要                      |
| ----------------------- | --------- | -------------------------------------------------------- | ------------------------- |
| `useTaskProgressStore`  | hook      | `() => TaskProgressState & TaskProgressActions`          | Zustand store             |
| `TaskProgress`          | interface | 见下                                                     | 一个活跃任务的全部字段    |
| `beginTask(task)`       | action    | `({id,label,detail?,progress?,visibleAfterMs?}) => void` | 开始新任务（覆盖旧任务）  |
| `updateTask(id, patch)` | action    | `(id, patch) => void`                                    | 仅在 id 命中时 patch 字段 |
| `endTask(id)`           | action    | `(id) => void`                                           | 仅在 id 命中时清空        |

## 详细条目

### `interface TaskProgress`

```ts
export interface TaskProgress {
  id: string; // 全局唯一标识（建议 'import:'+filename）
  label: string; // 主标题（'Importing base_map.bin'）
  detail?: string; // 副标题（'Decoding lanes 234/812'）
  progress: number | null; // [0,1] 或 null（不确定进度，渲染为 spinner）
  startedAt: number; // Date.now() at beginTask
  visibleAfterMs: number; // UI 等待这么久才显示——抑制 50ms 的"闪一下"
}
```

文件位置：`taskProgressStore.ts:3-10`。

### `beginTask({id, label, detail?, progress?, visibleAfterMs?})`

**覆盖式**——前一任务被丢弃。`progress` 默认 `null`（不确定进度，UI 显示 spinner）。

```ts
useTaskProgressStore.getState().beginTask({
  id: 'export:routing_map.txt',
  label: 'Exporting routing map',
  visibleAfterMs: 500,
});
```

文件位置：`taskProgressStore.ts:31-42`。

### `updateTask(id, patch)`

**Id 守卫**——若当前 active task 的 id 不匹配则静默忽略，避免 stale Promise 把已完成任务的进度条往回推。

`patch` 仅允许 `label` / `detail` / `progress`；其他字段（`startedAt` / `visibleAfterMs`）一旦确定不可变。`progress` 经 `clampProgress` 归一化到 `[0,1]` 或 `null`。

```ts
useTaskProgressStore.getState().updateTask('import:base.bin', {
  detail: 'Building cold layer (lane 312/812)',
  progress: 312 / 812,
});
```

文件位置：`taskProgressStore.ts:44-54`。

### `endTask(id)`

清空 `activeTask`——**仅** 在 id 匹配时。多个 fire-and-forget 的导入 promise 嵌套时，外层 `endTask` 不会误清里层任务。

文件位置：`taskProgressStore.ts:56-59`。

### `clampProgress(value)` — 内部

```ts
function clampProgress(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}
```

`NaN` / `Infinity` 退化为 `null`，UI 退回到 spinner，永远不会渲染负进度条。

## 内部状态

```ts
interface TaskProgressState {
  activeTask: TaskProgress | null;
}
```

唯一字段 `activeTask`——`null` 表示没有任务在进行。

## 使用模式

最佳实践：把 begin/update/end 包装在 try/finally 里：

```ts
const id = 'export:base';
useTaskProgressStore.getState().beginTask({ id, label: 'Exporting base map' });
try {
  await exportBaseMap(map, (p) => useTaskProgressStore.getState().updateTask(id, { progress: p }));
} finally {
  useTaskProgressStore.getState().endTask(id);
}
```

## 副作用

- 没有 IPC、没有 LS、没有定时器
- `Date.now()` 在 `beginTask` 时调用
- UI 侧基于 `Date.now() - startedAt > visibleAfterMs` 决定是否渲染——store 自己不管 UI

## 测试覆盖

无独立测试文件。被 IO 层端到端测试间接覆盖（导入失败时 active task 被清空）。

## 调用方

- `src/io/mapIO.ts` — import / export 的进度回调
- `src/components/layout/StatusBar.tsx` — 渲染条
- `src/hooks/useColdLayer.ts` — 大幅重建时短暂占用

## 源码索引

| 行    | 内容                  |
| ----- | --------------------- |
| 3–10  | `TaskProgress`        |
| 12–14 | `TaskProgressState`   |
| 16–26 | `TaskProgressActions` |
| 28–60 | store 工厂            |
| 62–65 | `clampProgress`       |

## 与 StatusBar 的协作

```tsx
// 简化版 StatusBar
function TaskBadge() {
  const task = useTaskProgressStore((s) => s.activeTask);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!task) {
      setVisible(false);
      return;
    }
    const ms = task.visibleAfterMs - (Date.now() - task.startedAt);
    if (ms <= 0) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), ms);
    return () => clearTimeout(t);
  }, [task?.id]);
  if (!task || !visible) return null;
  return (
    <div>
      {task.label}
      {task.detail ? ` — ${task.detail}` : ''}
      {task.progress !== null ? <ProgressBar value={task.progress} /> : <Spinner />}
    </div>
  );
}
```

`visible` 由 `setTimeout` 控制——在 `visibleAfterMs` 之前任务就完成了，`activeTask` 变 `null`，badge 永不出现。

## 设计权衡：为什么不做队列

队列让"我有 5 个并行任务"变得可表达，但带来：

- 状态栏一次只能显示 1 个 → 还是要选优先级
- 多任务并行可能让 UI 信息过载
- Apollo Map Studio 的实际工作流是串行的（导入 → 重 index → 渲染），并行任务非常罕见

所以一个插槽的简化模型 + 抢占式覆盖更适合这个产品。

## 与 Promise 的协作

任何 IO 路径标准模板：

```ts
async function exportBaseMap(/* ... */) {
  const id = `export:${Date.now()}`;
  const store = useTaskProgressStore.getState();
  store.beginTask({ id, label: 'Exporting base map', visibleAfterMs: 500 });
  try {
    await /* 实际导出 */;
  } finally {
    store.endTask(id);
  }
}
```

`finally` 关键 —— exception 路径也清理 active task，避免状态栏永远卡在"Exporting...".

## 测试 hook

```ts
// vitest 中
import { useTaskProgressStore } from '@/store/taskProgressStore';
useTaskProgressStore.getState().beginTask({ id: 'test', label: 'X' });
expect(useTaskProgressStore.getState().activeTask?.id).toBe('test');
useTaskProgressStore.getState().endTask('test');
expect(useTaskProgressStore.getState().activeTask).toBeNull();
```

测试间需要手动 `endTask`——否则 store 在 vitest 间隔之间漏出 active task，可能影响下个 test。

## 参见

- [`apolloMapStore`](./apollo-map-store.md) — `info.counts` 是 import 完成后的"摘要"
- `StatusBar.tsx` — 唯一渲染方
- `src/io/mapIO.ts` — 主要 begin/update/end 来源
- `src/hooks/useColdLayer.ts` — 大幅重建短暂占用
