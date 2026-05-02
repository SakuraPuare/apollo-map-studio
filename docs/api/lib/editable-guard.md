---
title: editable-guard — 写操作许可证守卫
description: 跨切片的 "is this app currently editable?" 守卫；store mutator 与 action dispatcher 的统一短路点。
---

# `editable-guard` — 写操作许可证守卫

> 源码：`src/lib/editable-guard.ts` · 45 行 · 无副作用纯逻辑

## 用途

`editable-guard` 是一个 cross-cutting 的"是否允许写"检查器。所有可能修改 `mapStore` 的入口（store mutator、action dispatcher、IPC 回调）在执行前都会调用 `assertEditable()`：

- 许可证状态 `canEdit === true` → 返回 `true`，调用方继续
- 许可证状态 `canEdit === false`（试用过期 / 许可过期 / 篡改 / 机器不匹配 / ...）→ 返回 `false`，写控制台 warn（节流 5 秒），尝试拉起激活弹窗

它使用 zustand 的 `getState()` 而非 hook —— 这样在事件 handler、store action、IPC 回调里都能用同一段代码。

## 公共 API

| 符号             | 类型 | 签名                           | 摘要                               |
| ---------------- | ---- | ------------------------------ | ---------------------------------- |
| `assertEditable` | fn   | `(action?: string) => boolean` | 同步检查 + 副作用（warn / prompt） |
| `isEditable`     | fn   | `() => boolean`                | 纯读，不触发 prompt                |

## 详细条目

### `assertEditable(action = 'edit'): boolean`

```ts
export function assertEditable(action = 'edit'): boolean {
  const { state, promptActivation } = useLicenseStore.getState();
  if (state.canEdit) return true;

  const now = Date.now();
  if (now - lastWarn > WARN_INTERVAL) {
    lastWarn = now;
    console.warn(`[license] Blocked ${action}: status=${state.status}. ${state.reason}`);
    try {
      promptActivation();
    } catch {
      // promptActivation may not be wired before the dialog mounts.
    }
  }
  return false;
}
```

参数：

- `action`: 用于 console 日志的描述串（`'addEntity'`、`'undo'`、...）。默认 `'edit'`。

行为：

1. 读 `useLicenseStore.getState()`——同步、无 hook 限制。
2. `canEdit === true` → 立即返回 `true`。
3. 否则节流 5 秒打印一次 warn 并拉起激活弹窗（`promptActivation` 在弹窗组件挂载之前是 no-op，被 try/catch 兜住）。
4. 返回 `false`，调用方应 bail out。

文件位置：`editable-guard.ts:21-36`。

### `isEditable(): boolean`

```ts
export function isEditable(): boolean {
  return useLicenseStore.getState().state.canEdit;
}
```

纯读取——不打 warn、不拉弹窗。给 React 组件渲染路径用：

```tsx
<Button disabled={!isEditable()}>Add Lane</Button>
```

注意这是同步快照——`canEdit` 变化后组件不会自动重渲染。如果需要响应式，应订阅 store：

```tsx
const canEdit = useLicenseStore(selectCanEdit);
```

## 内部状态

```ts
let lastWarn = 0;
const WARN_INTERVAL = 5 * 1000;
```

模块级别的节流时间戳。**进程级别共享**——多个调用方共享一个时钟，避免日志洪流。

## 副作用

- 读 `useLicenseStore`
- 节流后调用 `console.warn`
- 节流后调用 `promptActivation`（注册式回调；未注册时是 no-op）

## 测试覆盖

无独立测试。被 `mapStore.test.ts` 间接覆盖（mock 许可证状态后写入应被拒绝）。

## 调用方

- `src/store/mapStore.ts` — `addEntity` / `updateEntity` / `removeEntity` / 等 mutator
- `src/hooks/useActionDispatcher.ts` — undo/redo 入口
- `src/hooks/useDrawCommit.ts` — FSM CONFIRM 时
- `src/components/menu/*` — 菜单项 disabled 状态（用 `isEditable`）

## 设计权衡

为什么不在主进程 IPC 层强制？因为主进程不持有 `entities`——entities 在渲染端 Zustand。主进程只能在 IPC `license:state` 广播 `canEdit=false` 时让渲染端"不写"，但这要求渲染端配合。

为什么不直接在 zundo 中间件里短路？zundo 不知道是写还是读；中间件也无法触发 UI 事件（弹窗）。最干净的位置就是 mutator 入口手动调用。

为什么节流 5 秒？写操作非常密集（拖拽时 60fps 调 `setEditPoint`），不节流 console 会被刷爆；5 秒平衡了"用户感知到自己被锁住"和"日志可读性"。

## 源码索引

| 行    | 内容                     |
| ----- | ------------------------ |
| 11    | `import useLicenseStore` |
| 13–14 | 节流变量                 |
| 21–36 | `assertEditable`         |
| 42–44 | `isEditable`             |

## 与 mutator 的集成模式

`mapStore` 内部的典型 mutator 大致长这样：

```ts
// src/store/mapStore.ts
addEntity(entity: MapEntity) {
  if (!assertEditable('addEntity')) return;
  set((s) => ({
    entities: new Map(s.entities).set(entity.id, entity),
  }));
}

updateEntity(id: string, patch: Partial<MapEntity>) {
  if (!assertEditable('updateEntity')) return;
  set((s) => {
    const e = s.entities.get(id);
    if (!e) return s;
    const next = new Map(s.entities);
    next.set(id, { ...e, ...patch } as MapEntity);
    return { entities: next };
  });
}
```

**模式约定**：

- 每个写 mutator 第一行 `if (!assertEditable('actionName')) return;`
- `actionName` 用动词，便于 console 日志识别（'addEntity' / 'undo' / 'paste' / 'reparent'）
- 读 mutator（`getEntity`、`select`）**不**调用守卫——只读操作不受许可证约束

## 与组件 disable 状态的协作

只读 UI 反馈通过订阅式 selector：

```tsx
import { useLicenseStore, selectCanEdit } from '@/store/licenseStore';

function AddLaneButton() {
  const canEdit = useLicenseStore(selectCanEdit);
  return (
    <Button disabled={!canEdit} onClick={addLane}>
      Add Lane
    </Button>
  );
}
```

selector 路径让 button 在许可证状态变化时自动重新渲染——比 `isEditable()` 同步快照路径更适合 UX。但点击 handler 内仍 **必须** 调 `assertEditable`——button disabled 是 UI 提示，不是安全屏障（攻击者可以从 React DevTools 强制 enable 后点击）。

## 节流逻辑边界

```ts
const WARN_INTERVAL = 5 * 1000; // 5s
```

5 秒内同一进程的多次失败只会打一次 warn。`Date.now()` 单调（即使时钟回退也不会触发额外 warn——节流变量永远只增不减），不需要额外保护。

但请注意：**节流是进程级别共享的**——多个 mutator 在同一时刻被调用都会"消费"这一次 warn 配额。这是优势（不刷屏），不是 bug。

## 调试 hint

如果在测试环境复现 `canEdit=false` 时 mutator 不响应：

1. 检查 `useLicenseStore.getState().state.status` —— 确认是否真的 expired/tampered
2. 检查 console —— 5 秒内至少一次 warn 信息
3. 检查 `useLicenseStore.getState().promptActivation` —— ActivationDialog 是否已挂载并注册回调

## 参见

- [`licenseStore`](../store/license-store.md) — 状态来源
- [`license-bridge`](./license-bridge.md) — IPC 包装
- [`electron/license-manager`](../electron/license-manager.md) — 主进程许可证状态机
- `src/store/mapStore.ts` — 实际 mutator 调用方
- `src/hooks/useActionDispatcher.ts` — undo/redo 守卫
