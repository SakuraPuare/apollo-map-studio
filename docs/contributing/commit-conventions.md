---
title: 提交规范
description: Conventional Commits、scope、body、breaking changes、原子拆分、不带 co-author。
---

# 提交规范

提交格式 = [Conventional Commits 1.0](https://www.conventionalcommits.org/)。
`cliff.toml` 用 commit prefix 自动归类生成 CHANGELOG，所以**严格遵守**
不是吹毛求疵，是发版的输入。

::: tip 一句话

```
<type>(<scope>): <subject>

<body>

<footer>
```

`<type>` 必填、`<scope>` 强烈推荐、`<subject>` 50 字内、空行、`<body>` 可选
但建议解释 **为什么**、`<footer>` 用于 BREAKING / refs。
:::

## type 字段

| type       | 用途                          | CHANGELOG 分组   |
| ---------- | ----------------------------- | ---------------- |
| `feat`     | 新功能（用户能感知）          | 🚀 Features      |
| `fix`      | bug 修复                      | 🐛 Bug Fixes     |
| `refactor` | 重构（行为不变）              | 🚜 Refactor      |
| `perf`     | 性能优化（结果可量化）        | ⚡ Performance   |
| `docs`     | 文档（README / docs/）        | 📚 Documentation |
| `style`    | 代码格式 / 样式（不影响行为） | 🎨 Styling       |
| `test`     | 加 / 改测试                   | 🧪 Testing       |
| `chore`    | 构建工具 / 杂项               | ⚙️ Miscellaneous |
| `ci`       | CI 配置                       | ⚙️ Miscellaneous |
| `revert`   | 回滚                          | ◀️ Revert        |

`cliff.toml` 的 `commit_parsers` 是真相：见
[`cliff.toml`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/cliff.toml)。

## scope 字段

scope 描述受影响 **模块**，不超 1 个单词。常用：

| scope       | 范围                           |
| ----------- | ------------------------------ |
| `actions`   | `src/core/actions/`            |
| `fsm`       | `src/core/fsm/`                |
| `geometry`  | `src/core/geometry/`           |
| `workers`   | `src/core/workers/`            |
| `inspector` | inspector 与 schema            |
| `import`    | `src/io/proto/entityBridge.ts` |
| `export`    | `src/io/proto/entityBridge.ts` |
| `electron`  | `electron/`                    |
| `license`   | license 子系统                 |
| `docs`      | 文档站                         |
| `ci`        | `.github/workflows/`           |
| `vitepress` | 文档构建                       |
| `theme`     | tokens.css / 主题              |
| `merge`     | 合并相关 housekeeping          |

::: warning scope 范围窄一点
跨多个 scope 的改动 = 拆 PR。一次提交动 actions 与 inspector 与
electron，CHANGELOG 看不出重点，回滚时一起 revert 太宽。
:::

## subject 字段

- 50 字以内（GitHub 列表会截断）。
- 祈使句 (imperative): `add`, `fix`, `update` —— 不是 `added`/`fixes`/`updating`。
- 句首小写、句末无 `.`。
- 描述 **做了什么**，不是 **为什么**（"为什么" 留给 body）。

```
✅ feat(actions): add edit.duplicateSelection
❌ feat(actions): adding duplicate action
❌ Fix bug.
❌ feat: Implemented brand new awesome duplicate selection feature so users can clone entities.
```

## body

- 可选，但**强烈建议**对非 trivial 改动写。
- 72 字一行（git log 易读）。
- 描述 **为什么**、**对比之前的方案**、**已知 trade-off**。
- 与 subject 之间空一行。

```
feat(fsm): add drawEllipse FSM state

Existing draw states require N anchors then DOUBLE_CLICK to commit.
Ellipse needs only 2 clicks (center + edge), so it has a custom guard
that targets idle on the second MOUSE_DOWN.

Trade-off: ESC during the first click leaves a stale drawPoints; the
clearDrawCtx action resets it. See undoCancel.test.ts for the regression
guard.
```

## footer

```
BREAKING CHANGE: <说明 + 迁移指引>
Refs: #123
Closes: #456
```

`BREAKING CHANGE` 触发 minor / major bump，cliff 标 `[**breaking**]`。

## 原子拆分原则

### 一个提交 = 一件事

```
✅
git log --oneline
feat(fsm): add drawEllipse state
feat(actions): register tool.drawEllipse action
feat(elements): add ellipse factory and type guard
test(elements): cover ellipse factory edge cases

❌
git log --oneline
feat: ellipse tool (FSM, action, element, tests, docs)
```

### 何时分开？

| 场景                                | 拆 / 不拆        |
| ----------------------------------- | ---------------- |
| 新增 ActionDef + 接 dispatcher 分支 | **不拆**（互依） |
| 新增 ActionDef + 改样式 token       | 拆               |
| 修 bug + 顺手 refactor 周边         | 拆               |
| 修 bug + 加回归测试                 | **不拆**（验证） |
| 升级一个依赖 + 适配代码             | 拆               |
| 重命名变量遍布 50 个文件            | 单独             |

## 不带 co-author

::: warning 项目 policy
不在 commit message 中加 `Co-Authored-By:`。CI 工具签名也禁止。
作者归属看 `git author`；多人协作请明确 reviewer / committer。
:::

理由：

- 历史 blame 干净。
- changelog 不需要混入 co-author 噪音。
- AI 协作是常态，加 `Co-Authored-By: Claude` 之类的污染历史。

## 实用模板

### 复制到 `.git/commit-template`

```
<type>(<scope>): <subject>

<body>

<footer>
```

```bash
git config commit.template .gitmessage
```

## 常见 commit 范例

```
feat(inspector): add laneRefList field kind

Schema-driven inspector now supports referenced lane id arrays. Lane
predecessor/successor fields are migrated. Junction migration deferred
to a follow-up PR.

Refs: #234
```

```
fix(fsm): cancel before temporal.undo() in dispatcher

Mid-draw Ctrl+Z left FSM drawPoints stale while mapStore.entities
rolled back, corrupting the next CONFIRM. Send CANCEL to the actor
before invoking temporal.undo() so the FSM context resets first.

Regression: src/hooks/__tests__/undoCancel.test.ts
Closes: #198
```

```
perf(workers): incremental cold-layer update

P1 spatial worker accepts INCREMENTAL { added, removed, updated } and
maintains an internal cache. Previously every edit cloned the full
FeatureCollection across the postMessage boundary. Bench drops 1k-edit
p99 from 142 ms to 23 ms.

bench: scripts/bench-budgets.json updated
```

```
docs(architecture): document anti-corruption layer

Add anti-corruption.md explaining why entityOps wraps proto-aware ops
and how to audit leaks (`git grep "from '@/core/geometry/apolloCompile'"`).
```

```
refactor(layout): extract WorkspaceLayout into siblings

WorkspaceLayout.tsx exceeded 400 lines; split into:
- WorkspaceLayout.tsx (entry, < 80 lines)
- WorkspacePanels.tsx
- WorkspaceTabs.tsx
- index.ts re-export

No behavior change.
```

## 提交工作流

1. **写代码** —— 完成一件事就停。
2. **`git add -p`** —— 选有关 hunk，丢弃无关临时改动。
3. **`git commit`** —— 写 message，body 解释 why。
4. **CI** —— pre-commit hook 跑 lint-staged，commit-msg hook 校验格式。
5. **Push & PR**。

::: tip 两条铁律

1. **Commit 前看一遍 `git diff --staged`** —— 确认 staging 是你想提交的。
2. **写 body 时问自己 "5 年后的人能看懂吗"** —— 不能就改写。
   :::

## Husky hooks

| Hook         | 作用                           |
| ------------ | ------------------------------ |
| `pre-commit` | `pnpm exec lint-staged` 自动修 |
| `commit-msg` | 校验 conventional commit 格式  |

如果钩子拦了你的 commit，**不要** `--no-verify`。修问题再 commit。

## changelog 自动化

```bash
pnpm exec git-cliff -o CHANGELOG.md
```

`cliff.toml` 决定怎么分组。`feat: foo` → `Features` 节，`fix: foo` →
`Bug Fixes` 节，等等。详见 [发版流程](./release-process)。

## 反例（请勿模仿）

```
❌ wip
❌ fix typo
❌ asdf
❌ Final commit
❌ feat: many improvements
❌ fix: oops
❌ Update README.md
```

每一条都 (1) 不通过 commit-msg 钩子（前 6 个），(2) GitHub UI 自动写的
"Update X" 也尽量手动改成 conventional 格式。

## 相关源码 (Source links)

- [`cliff.toml`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/cliff.toml)
- [`.husky/pre-commit`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/.husky/pre-commit)
- [Conventional Commits 1.0 spec](https://www.conventionalcommits.org/en/v1.0.0/)

::: tip 三条记住

1. type + scope + subject。
2. body 写"为什么"。
3. 一个提交 = 一件事。
   其他规则照着 cliff.toml 自动执行。
   :::
