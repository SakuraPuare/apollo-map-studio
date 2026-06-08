---
title: 测试
description: Vitest 模式、fixture、回归测试（undoCancel、clickDedup）、如何加单元测试。
---

# 测试

测试 = Vitest 4。我们追求 **测确定的、不测随机的**：哪里出过 bug 就
哪里加回归；哪里覆盖率为 0 就要么删要么测。

::: tip 现状

- 单测在 `__tests__/` 子目录，与被测代码同级。
- bench 在 `*.bench.ts`，与被测代码同级。
- Web E2E 在 `tests/e2e/`，使用 Playwright + Chromium 覆盖浏览器/renderer 交互。
- Electron E2E 在 `electron-e2e/`，使用 Playwright Electron 启动真实桌面壳。
- `pnpm test:electron` 不是 E2E；它用 `node --test` 跑 main/preload/license 单测。

常规 CI 跑 `pnpm test` 和 `pnpm test:electron`；Web/Electron E2E 属于专项或发布前检查，除非 workflow 显式加入。
:::

## 命令速查

```bash
pnpm test                                    # 全跑
pnpm test src/core/elements                  # 子目录
pnpm test --watch                            # watch 模式
pnpm test --reporter=verbose                 # 看每个 it
pnpm test --coverage                         # v8 覆盖率
pnpm test --update                           # 更新 snapshot（慎用）
pnpm test:e2e                                # Web E2E：Chromium + Vite test server
pnpm test:e2e:ci                             # 安装 Chromium/deps 后跑 Web E2E
pnpm test:electron                           # Electron main/preload/license 单测
pnpm test:electron:e2e                       # Electron 桌面 E2E
```

Linux 无 `DISPLAY` 时，Electron E2E 需要 `xvfb-run`。脚本会自动使用它；
缺失时按提示安装 xvfb，或手动运行 `xvfb-run -a pnpm test:electron:e2e`。

## 目录约定

```
src/
├── core/
│   ├── elements/
│   │   ├── lane.ts
│   │   ├── lane.bench.ts
│   │   └── __tests__/
│   │       └── lane.test.ts
│   └── fsm/
│       ├── editorMachine.ts
│       └── __tests__/
│           └── editorMachine.test.ts
└── hooks/
    ├── useDrawCommit.ts
    └── __tests__/
        ├── useDrawCommit.test.ts
        ├── undoCancel.test.ts        # R1 回归
        └── clickDedup.test.ts        # double-click 回归
```

## 测试三件套 (Arrange-Act-Assert)

```ts
import { describe, it, expect } from 'vitest';
import { createLane } from '@/core/elements/lane';

describe('createLane', () => {
  it('produces a lane with default speed limit 60', () => {
    // Arrange
    const points = [
      [0, 0],
      [1, 0],
      [2, 0],
    ] as const;

    // Act
    const lane = createLane(points);

    // Assert
    expect(lane.entityType).toBe('lane');
    expect(lane.speedLimit).toBe(60);
    expect(lane.centralCurve.segments).toHaveLength(2);
  });
});
```

::: warning 一个 it = 一个断言主题
不要在一个 it 里 expect 七八件事。失败时分不清谁挂了。
:::

## Fixtures

放共享 fixture 在 `src/__fixtures__/`：

```ts
// src/__fixtures__/sampleLanes.ts
import { createLane } from '@/core/elements/lane';

export const horizontalLane = createLane([
  [0, 0],
  [1, 0],
]);
export const verticalLane = createLane([
  [0, 0],
  [0, 1],
]);
export const sampleMap = new Map([
  [horizontalLane.id, horizontalLane],
  [verticalLane.id, verticalLane],
]);
```

::: tip 不用 setup/teardown
Vitest 默认 ESM + 函数式，不需要 jest 的 beforeEach 全局污染。每个 it
自己造数据，独立又显式。
:::

## 回归测试 (Regression tests)

每修一个 bug，**必加一条测试**：测试名引用 issue/commit。

### 案例 1：`undoCancel.test.ts`（R1）

```ts
// src/hooks/__tests__/undoCancel.test.ts
it('cancels FSM before zundo undo to avoid stale drawPoints', () => {
  // 模拟 mid-draw 用户按 Ctrl+Z 的场景
  startDrawing();
  addPoint([0, 0]);
  addPoint([1, 0]);
  expect(actor.getSnapshot().context.drawPoints).toHaveLength(2);

  dispatch('edit.undo');

  // FSM 必须先收 CANCEL
  expect(actor.getSnapshot().value).toBe('idle');
  expect(actor.getSnapshot().context.drawPoints).toEqual([]);
});
```

### 案例 2：`clickDedup.test.ts`

```ts
it('does not commit twice when MOUSE_DOWN coincides with DOUBLE_CLICK', () => {
  startDrawing();
  addPoint([0, 0]);

  // 模拟双击：MOUSE_DOWN + DOUBLE_CLICK 同时到达
  fireMouseDown([1, 0]);
  fireDoubleClick([1, 0]);

  // 只应当 commit 一次
  expect(mapStore.getState().entities.size).toBe(1);
});
```

::: warning 每个 bug 都要回归
"我修了但没加测试" = 这个 bug 一定会再来。这是 P0 review 拦截点。
:::

## 测 React 组件

少用，能在 `lib/` 测的就别在 `components/` 测。React 组件测试聚焦
**用户可见行为**：

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '@/components/CommandPalette';

it('filters actions by query', () => {
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '复制' } });
  expect(screen.getByText(/复制选中实体/i)).toBeVisible();
});
```

::: tip 不用快照
快照测试遮蔽真实期望。要么 `getByText` / `getByRole`，要么不测渲染。
:::

## 测 FSM

```ts
import { createActor } from 'xstate';
import { editorMachine } from '@/core/fsm/editorMachine';

it('drawPolyline appends points on MOUSE_DOWN', () => {
  const actor = createActor(editorMachine).start();
  actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
  actor.send({ type: 'MOUSE_DOWN', point: [0, 0] });
  actor.send({ type: 'MOUSE_DOWN', point: [1, 0] });

  expect(actor.getSnapshot().context.drawPoints).toEqual([
    [0, 0],
    [1, 0],
  ]);
});
```

## 测 Worker（间接）

worker 真身在 jsdom 跑不起来。把算法抽成纯函数测：

```ts
// src/core/workers/computeBins.ts
export function computeBins(samples: number[], n: number): number[] {
  /* ... */
}

// src/core/workers/__tests__/computeBins.test.ts
it('groups samples into n bins', () => {
  expect(computeBins([1, 2, 3, 4], 4)).toEqual([1, 1, 1, 1]);
});
```

worker 文件本身只做 message routing，逻辑都在纯函数里。

## 测 import / export round-trip

```ts
// src/io/__tests__/roundTrip.test.ts
it('Lane survives an import/export round trip', () => {
  const original = createLane([
    [0, 0],
    [1, 0],
  ]);
  const encoded = encodeLane(original);
  const decoded = decodeLane(encoded);
  expect(decoded.id).toBe(original.id);
  expect(decoded.centralCurve).toEqual(original.centralCurve);
});
```

跑一遍 proto2 optional / required / repeated 各类字段都覆盖。

## 测假定 (assumptions)

```ts
it.fails('this assumption holds', () => {
  // 期望失败，记录已知 limitation
});
```

`it.fails` 用于明确"这事我们目前不支持但记录在案"。慎用。

## Mocking

最少 mocking。能用真实实现就用：

```ts
// ✅ 真实 zustand store
import { mapStore } from '@/store/mapStore';
mapStore.setState({ entities: new Map() });

// ❌ mock zustand
vi.mock('@/store/mapStore', () => ({ mapStore: { getState: () => ({}) } }));
```

非 mock 不可时（如 worker、网络）：

```ts
import { vi } from 'vitest';
vi.mock('@/core/workers/spatialBridge', () => ({
  requestSync: vi.fn().mockResolvedValue({ groups: [] }),
}));
```

## 异步测试

```ts
it('worker SYNC resolves within 1 frame', async () => {
  const result = await requestSyncDebounced(entities);
  expect(result.groups).toHaveLength(entities.length);
});
```

不要 `setTimeout(done, 100)`。要等 RAF 用 `vi.useFakeTimers()`：

```ts
it('coalesces multiple sync requests into one', () => {
  vi.useFakeTimers();
  for (let i = 0; i < 100; i++) requestSync(entities);
  vi.advanceTimersToNextFrame();
  expect(workerPostMessage).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

## 覆盖率

```bash
pnpm test --coverage
```

目标：

- core/、lib/：≥ 80%
- store/、hooks/：≥ 60%
- components/：≥ 40%（视觉行为多）

::: warning 别为覆盖率而测
80% 高质量测试胜过 100% 凑数测试。`expect(true).toBe(true)` 一行 100%
覆盖但 0 价值。
:::

## 加一条单测的最小步骤

1. 在 `src/.../foo.ts` 旁边的 `__tests__/foo.test.ts` 新建文件。
2. `import { ... } from '../foo'`。
3. 用 `describe` 包一下被测函数名。
4. 写 1 个 `it` happy path。
5. 写 1 个 `it` edge case（空、null、超大输入、负数等）。
6. `pnpm test src/.../foo` 通过。
7. 提交：`test(<scope>): cover ...` conventional commit。

## 常见坑 (Common pitfalls)

### "在我机器上跑过"

跑 `pnpm test` 全量。某些测试相互污染（共享 store 没重置），全量才暴露。

### Snapshot 大爆炸

不要在 component test 写大段 `toMatchSnapshot()`。一旦截图变，diff 看
不出哪里改。改用语义断言。

### `vi.useFakeTimers()` 忘记还原

`afterEach(() => vi.useRealTimers())` 否则下个测试也假的。

### 跨测试共享 store

```ts
beforeEach(() => mapStore.setState({ entities: new Map() }));
```

每个测试自己造数据，独立。

### 测 implementation 而非 behavior

测 "我调用了 internalFunction" 是脆性测试。重构 implementation 时坏。
测 "输入 X 输出 Y" 才稳定。

## 相关源码 (Source links)

- [`src/hooks/__tests__/undoCancel.test.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/src/hooks/__tests__/undoCancel.test.ts)
- [`src/hooks/__tests__/clickDedup.test.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/src/hooks/__tests__/clickDedup.test.ts)
- [Vitest 4 docs](https://vitest.dev/)
- [`vite.config.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/vite.config.ts) — vitest 配置

## 进阶 (Advanced)

### Fuzzing

部分几何函数用 [fast-check](https://fast-check.dev/)：

```ts
import fc from 'fast-check';
it('polyline length is non-negative', () => {
  fc.assert(
    fc.property(fc.array(fc.tuple(fc.float(), fc.float()), { minLength: 2 }), (pts) => {
      expect(polylineLength(pts)).toBeGreaterThanOrEqual(0);
    }),
  );
});
```

未启用，建议作为 P3 引入。

### Benchmark 与单测分离

`*.bench.ts` 用 `bench()`，`*.test.ts` 用 `it()`。`pnpm test` 不跑 bench。
详见 [基准测试](./benchmarking)。

::: tip 一句话
**测确定的、测过 bug 的、测公共契约的**。私有实现细节让重构去拆。
:::
