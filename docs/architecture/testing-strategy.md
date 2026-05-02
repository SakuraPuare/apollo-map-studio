---
title: 测试策略 (Testing Strategy)
description: Vitest 单元测试，分层覆盖，lib/core/hook 三层测什么；fixtures（src/io/__fixtures__/）；undoCancel.test.ts 作为典范回归测试
---

# 测试策略 (Testing Strategy)

> 测试运行器：Vitest 4.1.4
> 命令：`pnpm test`（运行）/ `pnpm bench`（基准）
> 配置：`vitest.config` 继承 vite resolver；jsdom / happy-dom **不引入**
> （刻意保持纯 Node 环境，避免 DOM mock 漂移）。

## 1. 测试金字塔

```
    ┌────────────────────────────────────┐
    │  Integration / Round-trip          │  src/io/__tests__/endToEnd.test.ts
    │  少量、跑真实 Apollo fixture        │
    ├────────────────────────────────────┤
    │  Hooks (closure 与时序)            │  src/hooks/__tests__/*.test.ts
    │  断言"调用顺序"、"side effect"      │  e.g. undoCancel.test.ts
    ├────────────────────────────────────┤
    │  Pure-function unit (大头)         │  src/lib/__tests__/*.test.ts
    │  几何 / adapter / schema / derive   │  e.g. entityOps.test.ts
    └────────────────────────────────────┘
```

底层最厚 —— 它最便宜也最稳定。

## 2. 三层覆盖原则

### 2.1 lib 层（pure）

**测什么**：

- adapter / 反腐层：`entityOps` 的类型守卫、setter、coords 形状。
- schema：`formValuesFromEntity` / `applyFormValuesToEntity` 互逆性。
- 几何：bezier / polyline / arc 的 hit test、长度积分。
- enum / 标签：`getEnumLabel` 全集覆盖。

**怎么测**：

- 完全不 mock；所有依赖都真实实例。
- fixture 用 hand-written object literal，避免间接构造让断言失真。

**示例**（`src/lib/__tests__/entityOps.test.ts`）：

```ts
function polyline(): PolylineEntity {
  return {
    id: 'pl-1',
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ],
  };
}

it('isDrawingEntity 区分 lane 与 polyline', () => {
  expect(isDrawingEntity(polyline())).toBe(true);
  // ...
});
```

### 2.2 core 层

**测什么**：

- FSM transition 顺序与 guard。
- worker request 处理（不真起 Worker，调 `handleRequest(state, req, respond)`）。
- topology / overlap reconciler 的局部 patch 正确性。
- spatial index 的 R 树 invariants。

**怎么测**：

- core 模块通常无 React，可纯 vitest 跑。
- worker 模块用 stub worker —— 不实例化 Worker，直接调 `handleRequest`
  并用 in-memory respond callback 收集消息。

**示例**（`src/core/workers/__tests__/spatialRequests.test.ts`）：

```ts
const responses: WorkerResponse[] = [];
handleRequest(state, { type: 'SYNC', requestId: 'r1', entities: [...] },
  (msg) => responses.push(msg));
expect(responses[0].type).toBe('COLD_READY');
```

### 2.3 hooks 层

**测什么**：

- closure 时序：例如 R1 R2 闭合的 ordering 契约。
- store 与 action dispatcher 的协同。
- 重复输入抑制（`isDuplicateInput`、dblclick dedup）。

**怎么测**：

- 不引入 jsdom；hooks 的纯函数核心被抽到独立 ts，hook 仅做粘合。
- mock zustand store via `vi.mock('@/store/...')`。
- 重新实现 hook 内部的"最小契约"，断言契约（见 undoCancel.test.ts）。

## 3. R1 典范回归：`undoCancel.test.ts`

`src/hooks/__tests__/undoCancel.test.ts` 是模板，它解决了：

> Bug：zundo 只 partialize `mapStore.entities`。Ctrl+Z 在 mid-draw
> 时回滚 entities 但 FSM 仍持有 stale `drawPoints`，下一次 CONFIRM /
> DRAG_END 写入坏数据。
>
> Fix：dispatcher 包裹 undo/redo，先给 FSM actor `send({ type: 'CANCEL' })`
> 再调 `temporal.undo()`。

测试做法：

1. **Mock 单例**：`vi.mock('@/store/mapStore')` 把 `useMapStore.temporal.getState()`
   替换为 spy。
2. **重写最小契约**：手工实现 `historyWithCancel` 函数，跑实际 ordering：

   ```ts
   const historyWithCancel = (op: 'undo' | 'redo') => {
     actorRef.send({ type: 'CANCEL' });
     if (op === 'undo') temporalUndo();
     else temporalRedo();
   };
   ```

3. **断言 callLog 顺序**：

   ```ts
   expect(callLog).toEqual(['send:CANCEL', 'temporal.undo']);
   ```

4. **额外 case**：idle-state undo 也应发 CANCEL（保持 always-fire 简单语义）。

为什么这样写：

- 没有 jsdom，hook 不能直接挂载，但 hook 内的"ordering 契约"是纯逻辑，
  本就该可测；把契约**显式表达**为函数 = 文档 + 回归。
- mock 单例 + 重写契约也是 future hooks 的通用 pattern。

## 4. Fixture 策略

`src/io/__fixtures__/apollo/`：

| Fixture        | 来源                   | 大小 / 用途                        |
| -------------- | ---------------------- | ---------------------------------- |
| `borregas_ave` | Apollo demo            | ~小型城市地图，测端到端 round trip |
| `demo`         | Apollo `map_data/demo` | 入门 fixture                       |
| `dreamview`    | Apollo Dreamview       | 中型，覆盖更多 entity 类型         |

设计要点：

- fixture 是 git tracked 的真实 Apollo `.bin`，不是手工拼接 ——
  保证 schema 演进时仍能回归真实数据。
- size 控制在 KB-MB 级别，不是 100MB 大图（专门的性能测试单独跑）。

加载示例（`endToEnd.test.ts`）：

```ts
const bytes = await fs.readFile(path.join(FIXTURE_DIR, 'borregas_ave/base_map.bin'));
const result = await runImport(bytes);
const reExported = await runExport(result.entities, result.info.projString);
const second = await runImport(reExported);
expect(second.lanes.length).toBe(result.lanes.length);
```

round trip 是黄金断言：导入→编辑→导出→再导入，关键不变量保持。

## 5. Bench 与性能预算

`pnpm bench` 跑 `vitest bench --run`，输出到 `bench-results.json`。
`scripts/check-bench-budget.mjs` 比对 `scripts/bench-budgets.json`，超额阻断 CI。

```json
// scripts/bench-budgets.json (示意)
{
  "buildFeatureCollection": { "max_ms": 50 },
  "reconcileOverlaps_full": { "max_ms": 600 },
  ...
}
```

加新 bench 必须同步加预算 —— 否则 CI 不知道阈值，回归也不会失败。

## 6. 不引入 jsdom 的取舍

**原因**：

- jsdom mock 与真实浏览器行为差异大，特别是 maplibre-gl 的 GL context、
  rAF 时序、ResizeObserver。
- 模拟 DOM 很容易把"测试"做成"测试 mock 自己"。

**代价**：

- 不能直接 `render(<Form />)`。
- 需要把 hooks 的纯逻辑核心抽出为可测函数（如 `formValuesFromEntity`）。

**结果**：测试更稳定、跑得更快（全部 ~1s）；UI 渲染层留给 Playwright /
人工冒烟。

## 7. CI 集成

`.github/workflows/ci.yml` 在 push / PR 上运行：

```yaml
- run: pnpm typecheck
- run: pnpm lint
- run: pnpm format:check
- run: pnpm build:web
- run: pnpm docs:build
- run: pnpm test
- run: pnpm bench --outputJson bench-results.json
- run: node scripts/check-bench-budget.mjs bench-results.json
```

`pnpm test` 失败 / `bench-budget` 超额都 block。

## 8. 命名约定

- 单元测试与被测代码同目录的 `__tests__/`（vitest auto-discovery）。
- 文件名 `<subject>.test.ts`；regression 用 `<symbol>Cancel.test.ts`、
  `<topic>Migration.test.ts` 这种语义命名。
- describe 第一级与文件名匹配。
- it 第一句话能直接被复制到 PR 描述。

## 9. mock vs 真实代码

| 场景               | 选择                            |
| ------------------ | ------------------------------- |
| 纯函数（lib/core） | 真实代码，无 mock               |
| 跨层闭包（hook）   | mock zustand 单例 + 重写契约    |
| Web Worker         | 直接调 `handleRequest`          |
| MapLibre GL        | 不测；E2E 走 Playwright（计划） |
| Electron IPC       | 不测；fallback 验证 web 路径    |
| FileReader / Blob  | Node Buffer 替代                |

## 10. 覆盖率（计划）

`@vitest/coverage-v8` 已在 devDeps 中；当前不强制阈值。计划：

- lib 层 → 80%+
- core 层 → 70%+
- hooks 层 → 关键 closure 100%（undoCancel 已覆盖）

## 11. 陷阱

1. **hook 测试引入 jsdom** 会让其他测试随机偶发失败 —— 不要为单个 case
   引入 jsdom；考虑提取纯函数。
2. **mock 顺序错位** —— `vi.mock` 必须在 `import` 之前；`undoCancel.test.ts`
   动态 import dispatcher 后再断言。
3. **fixture drift** —— 改 entity 类型时，fixture 加载可能失败；要么
   regenerate fixture，要么在 IO 层兼容旧字段。
4. **bench 不稳定** —— 预算留 1.5x 余量，避免 CI runner 抖动 false
   negative。
5. **vi.useFakeTimers() 与 RAF** —— RAF 需要 `vi.advanceTimersByTime` 或
   `vi.runAllTimers`，否则测试 hang。

## 12. 加新测试 SOP

1. 在被测模块同级建 `__tests__/`。
2. 优先把可测部分提到 `lib/`，让测试自然变成 lib 单元。
3. 闭包测试：mock + 重写最小契约。
4. round trip：用 fixture，断言不变量。
5. PR 里贴一句"为什么这个用例值得守"。

## 13. Public Test API

| Helper / Fixture          | 文件                                   |
| ------------------------- | -------------------------------------- |
| `polyline / bezier / arc` | `src/lib/__tests__/entityOps.test.ts`  |
| Apollo fixtures           | `src/io/__fixtures__/apollo/*`         |
| FSM stub                  | `src/hooks/__tests__/*.test.ts` 内复用 |
| WorkerResponse collector  | `src/core/workers/__tests__/*.test.ts` |

## 14. 源码地图

```
src/lib/__tests__/                ← pure-function units
src/core/__tests__/               ← geometry / fsm / overlap units
src/core/workers/__tests__/       ← worker handlers
src/hooks/__tests__/              ← hook closure regression
src/components/layout/panels/__tests__/  ← Inspector R1
src/io/__tests__/                 ← end-to-end round trip
src/io/__fixtures__/apollo/       ← Apollo .bin fixtures
scripts/check-bench-budget.mjs    ← perf gate
scripts/bench-budgets.json        ← per-bench thresholds
.github/workflows/ci.yml          ← CI 入口
```

## 15. 关键测试清单（精选）

| 测试文件                                                        | 守护契约                                              |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `src/hooks/__tests__/undoCancel.test.ts`                        | R1：undo 之前发 CANCEL，FSM 不残留 stale drawPoints   |
| `src/lib/__tests__/entityOps.test.ts`                           | R2：entityOps 是 UI ↔ Apollo proto 唯一接缝           |
| `src/components/layout/panels/__tests__/InspectorForms.test.ts` | Schema 化的 Lane 表单 R1                              |
| `src/io/__tests__/endToEnd.test.ts`                             | round trip：import → edit → export → re-import 不变量 |
| `src/core/workers/__tests__/spatialRequests.test.ts`            | SYNC / INCREMENTAL / HIT_TEST 协议契约                |
| `src/hooks/__tests__/clickDedup.test.ts`                        | dblclick 去重，避免 single click 重复触发             |

## 15.1 反例：什么"不"测

- **maplibre 渲染像素**：留给手工冒烟 / Playwright（计划中）。
- **dockview 拖拽几何**：dockview 自身已有测试，我们不复测。
- **Electron BrowserWindow 真启动**：不在 unit 范畴。
- **proj4 数学正确性**：proj4 上游覆盖；我们只测 sanitizeProjString。
- **maplibre paint expression 等同**：颜色调整以视觉为主，测试代价高
  收益低。

## 16. 何时把测试上移

如果一个 bug 出现两次，说明对应契约缺失。处理顺序：

1. 写一个 reproduce 用例（哪怕只是 console.log 顺序的断言）。
2. 抽出契约成纯函数 / 显式 ordering helper。
3. 把 fix 与回归测试一起合入。
4. 记入 `R<n>` 闭合条目（架构审计同步）。

R1 / R2 的回归测试就是这样诞生的。

## 17. See also

- [Build & Bundle](./build-and-bundle.md)
- [Worker Protocol](./worker-protocol.md)
- [Anti-corruption Layer](./anti-corruption-layer.md)
- [State Management](./state-management.md)
- ARCHITECTURE.md → "Quality gates"
