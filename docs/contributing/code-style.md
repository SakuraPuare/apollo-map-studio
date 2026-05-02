---
title: 代码风格
description: eslint.config.js 规则、Prettier 配置、Tailwind class 排序、命名规范、TS 类型纪律。
---

# 代码风格

代码风格规则就一句话：**ESLint 9 + Prettier 3 自动跑，CI 红了改完再
push**。本章列出规则背后的"为什么"以及好 / 坏示例。

::: tip 三层防线

1. **本地** — `.husky/pre-commit` 跑 lint-staged，自动修。
2. **CI** — `pnpm format:check && pnpm lint`，红就 block。
3. **Code Review** — 看人能看的（架构、命名、可读性），不要重复 linter 工作。
   :::

## ESLint flat config

`eslint.config.js` 已开 React Hooks rules、TypeScript ESLint，
**type-aware** 规则故意关闭（在几何代码里太慢，且 `tsc --noEmit` 在 CI
里独立跑）。

### 必遵守的规则

| 规则                                    | 等级  | 原因                        |
| --------------------------------------- | ----- | --------------------------- |
| `react-hooks/rules-of-hooks`            | error | 调用顺序错乱直接 runtime 崩 |
| `react-hooks/exhaustive-deps`           | warn  | 闭包陷阱常见出 bug          |
| `eqeqeq`                                | error | `==` 几乎总是 bug           |
| `no-restricted-syntax: as unknown as X` | error | 见下文 "类型纪律"           |
| `max-lines: 400`                        | warn  | AI 友好；超出请拆兄弟模块   |
| `max-lines-per-function: 80`            | warn  | 同上                        |
| `complexity: 15`                        | warn  | 圈复杂度高 = 难测难读       |

### AI 友好的尺寸约束

`eslint.config.js` 注释解释了为什么：

> 小文件 / 小函数 = AI agent 能把整个单元装进上下文做局部推理。超出
> 阈值通常意味着模块责任不单一——拆成兄弟子目录（参考 `WorkspaceLayout/`、
> `mapEventRouter/`、`mapLibreInit/` 三处既有模式）。

::: warning 不是建议是硬性预算
当一个文件超过 400 行 / 一个函数超过 80 行 / 圈复杂度 > 15，**先拆再加
功能**。挤进现有文件的 PR 不会被合并。
:::

### TypeScript 纪律

```ts
// ❌ 禁止
const x = something as unknown as MyType;

// ✅ 用类型守卫 / typed accessor / `in` 收敛
function isMyType(v: unknown): v is MyType {
  /* ... */
}
if (isMyType(something)) use(something);
```

参考 `src/types/apollo.ts` 的 `getSource` / `getSourceRect` 模式。

### Import 路径

```ts
// ❌
import { x } from '../../../core/foo';

// ✅
import { x } from '@/core/foo';
```

`@/` alias 在 `tsconfig.json` 与 `vite.config.ts` 同步配置。深相对路径
被 ESLint warn。

## Prettier 配置

`.prettierrc.json`：

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "tabWidth": 2,
  "useTabs": false
}
```

### 命中要点

- 单引号字符串。
- 永远尾随逗号。
- 100 列折行（不是 80，也不是 120 —— 100 兼顾可读性与现代显示）。
- 永远 `;`。
- arrow `(x) => x`，不省括号。
- LF 换行。

::: tip 不要争论格式
所有格式问题让 Prettier 决定。`pnpm format` 一键修。Code Review 不要
评论 "缩进 / 引号"。
:::

## Tailwind 类排序

::: warning 关闭 prettier-plugin-tailwindcss
当前没启用 prettier-plugin-tailwindcss。Class 排序由人维护：

推荐顺序：**布局 → 盒模型 → 颜色 → 字体 → 状态变体**

```tsx
// ✅
<div className="flex items-center gap-2 px-4 py-2 bg-ams-bg-canvas text-ams-fg-default hover:bg-ams-bg-canvas-hover" />

// ❌（颜色穿插在布局里）
<div className="flex bg-blue-500 items-center text-red-700 px-4" />
```

:::

未来可能启用插件，启用后会自动排，PR 会一次性 reflow 整库。

## 命名规范

### 文件

| 类型       | 命名                            | 示例                 |
| ---------- | ------------------------------- | -------------------- |
| React 组件 | PascalCase + `.tsx`             | `LaneInspector.tsx`  |
| Hook       | `use*` + `.ts`                  | `useDrawCommit.ts`   |
| Worker     | `*.worker.ts`                   | `spatial.worker.ts`  |
| 单测       | `*.test.ts(x)`                  | `lane.test.ts`       |
| 类型定义   | camelCase                       | `inspectorSchema.ts` |
| 常量配置   | camelCase                       | `mapConstants.ts`    |
| 目录       | kebab-case 或 camelCase（一致） | `core/actions/`      |

### 标识符

```ts
// ✅
const laneCount = 12; // camelCase 变量
function createLane() {} // camelCase 函数
class LaneRenderer {} // PascalCase 类
const DEFAULT_LANE_HALF_WIDTH = 1.75; // SCREAMING_SNAKE 常量
type LaneEntity = {
  /* ... */
}; // PascalCase 类型

// ❌
const lane_count = 12;
function CreateLane() {}
const default_lane_half_width = 1.75;
```

### React 组件 props

```tsx
// ✅ 显式接口
interface LaneInspectorProps {
  laneId: string;
  readonly?: boolean;
  onSave?: (lane: LaneEntity) => void;
}

export function LaneInspector({ laneId, readonly, onSave }: LaneInspectorProps) {}

// ❌ 内联
export function LaneInspector(props: { laneId: string; readonly?: boolean }) {}
```

### Boolean 命名

```ts
// ✅ is/has/can/should 前缀
const isDirty = true;
const hasErrors = errors.length > 0;
const canEdit = !readonly && hasPermission;

// ❌
const dirty = true;
const errors = errors.length > 0;
```

## React 模式

### 组件大小

- 单文件 < 200 行。
- 单组件 < 80 行 JSX（含 hooks）。

超出则按职责拆：

```
LaneInspector/
  LaneInspector.tsx        # 主组件，< 60 行
  LaneInspectorHeader.tsx
  LaneInspectorFields.tsx
  LaneInspectorActions.tsx
  index.ts                 # re-export
```

### 副作用

- 一个 `useEffect` 一个职责。`useEffect` 里 5 个 if-else = 拆成 5 个 hook。
- 副作用清理永远 return cleanup（`return () => unsub();`）。
- 依赖列表用 `react-hooks/exhaustive-deps` 守，不要 `// eslint-disable`。

### 不要 prop drill 5 层

3 层及以上把 prop 改成 zustand store 或 React context。详见
[State Management](../architecture/state-management)。

## TypeScript 模式

### 严格联合 + discriminated union

```ts
// ✅
type DrawState =
  | { kind: 'idle' }
  | { kind: 'drawing'; points: LngLat[] }
  | { kind: 'editing'; entityId: string };

function step(s: DrawState): DrawState {
  switch (s.kind) {
    case 'idle':
      return s;
    case 'drawing':
      return { ...s, points: [...s.points, [0, 0]] };
    case 'editing':
      return s;
  }
}
```

### 禁止裸 `any`

`any` 关闭 type 检查。用 `unknown` + 类型守卫，或写精确类型。

### `readonly` 默认

```ts
// 函数入参用 readonly
function sumWidths(samples: readonly LaneSample[]): number {
  /* ... */
}

// 永久不变的 array literal
const DRAW_STATES = ['drawPolyline', 'drawArc'] as const;
```

## 注释

- **为什么** 写在代码里（`// R1: cancel before undo because ...`）。
- **是什么** 让代码自己说（用变量名、函数名）。
- 永远不写 "this is the lane" 这种废话。

::: tip 引用 git history
重大设计决策注释末尾标 commit hash，方便后人追：

```ts
// R1: send CANCEL before temporal.undo() (commit 6a83d9d)
```

:::

## CSS

- 用 [`ams-*` token](../recipes/theming-with-ams-tokens)，不写 hex。
- 不要用空的 React `style` 对象做静态样式（用 Tailwind utility）。
- 动态值（如 `transform: rotate(${a}deg)`）才用 `style`。

## 文件 / 模块组织

- `core/` 不能 import `lib/`、`store/`、`hooks/`、`components/`。
- `lib/` 不能 import `store/`、`hooks/`、`components/`。
- `store/` 不能 import `hooks/`、`components/`。
- `hooks/` 不能 import `components/`。

详见 [Architecture: Layering](../architecture/layering)。

## 好 vs 坏对比

```ts
// ❌
function f(x: any) {
  if (x.entityType == 'lane') {
    if (x.leftBoundary) {
      if (x.leftBoundary.curve) {
        return x.leftBoundary.curve.segments[0].length;
      }
    }
  }
  return 0;
}

// ✅
import { isLane } from '@/core/elements/lane';

function getFirstSegmentLength(entity: MapEntity): number {
  if (!isLane(entity)) return 0;
  return entity.leftBoundary.curve.segments[0]?.length ?? 0;
}
```

## 工具命令

```bash
pnpm format         # 修
pnpm format:check   # 验
pnpm lint           # ESLint
pnpm lint:fix       # ESLint --fix
pnpm typecheck      # tsc --noEmit
```

CI 全跑。本地 commit 前跑一遍。

## 相关源码 (Source links)

- [`eslint.config.js`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/eslint.config.js)
- [`.prettierrc.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/.prettierrc.json)
- [`tsconfig.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/tsconfig.json)
- [Architecture: Layering](../architecture/layering)

::: warning 不要为了通过 lint 写糟糕代码
ESLint 规则是底线，不是上限。"短" 不等于 "好"，"通过 max-lines" 不等
于 "可读"。规则 + 品味缺一不可。
:::
