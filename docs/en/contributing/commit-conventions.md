---
title: Commit Conventions
description: Conventional Commits, scopes, body, breaking changes, atomic splits, and no co-author.
---

# Commit Conventions

The format is [Conventional Commits 1.0](https://www.conventionalcommits.org/).
`cliff.toml` parses commit prefixes to generate the CHANGELOG, so strict
adherence is not pedantry — it's release input.

::: tip One line

```
<type>(<scope>): <subject>

<body>

<footer>
```

`<type>` required, `<scope>` strongly recommended, `<subject>` ≤ 50
chars, blank line, optional `<body>` (explain why), `<footer>` for
BREAKING / refs.
:::

## `type`

| type       | Use                             | CHANGELOG group  |
| ---------- | ------------------------------- | ---------------- |
| `feat`     | New feature (user-visible)      | 🚀 Features      |
| `fix`      | Bug fix                         | 🐛 Bug Fixes     |
| `refactor` | Refactor (no behavior change)   | 🚜 Refactor      |
| `perf`     | Performance (quantifiable)      | ⚡ Performance   |
| `docs`     | Documentation                   | 📚 Documentation |
| `style`    | Formatting (no behavior change) | 🎨 Styling       |
| `test`     | Add / update tests              | 🧪 Testing       |
| `chore`    | Build tooling, miscellaneous    | ⚙️ Miscellaneous |
| `ci`       | CI config                       | ⚙️ Miscellaneous |
| `revert`   | Revert                          | ◀️ Revert        |

`cliff.toml` `commit_parsers` is the source of truth — see
[`cliff.toml`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/cliff.toml).

## `scope`

`scope` names the module (one word). Common scopes:

| scope       | Area                           |
| ----------- | ------------------------------ |
| `actions`   | `src/core/actions/`            |
| `fsm`       | `src/core/fsm/`                |
| `geometry`  | `src/core/geometry/`           |
| `workers`   | `src/core/workers/`            |
| `inspector` | inspector + schema             |
| `import`    | `src/io/proto/entityBridge.ts` |
| `export`    | `src/io/proto/entityBridge.ts` |
| `electron`  | `electron/`                    |
| `license`   | license subsystem              |
| `docs`      | documentation site             |
| `ci`        | `.github/workflows/`           |
| `vitepress` | docs build                     |
| `theme`     | tokens.css / theming           |
| `merge`     | merge housekeeping             |

::: warning Keep scope narrow
A change touching multiple scopes = split the PR. Combining actions +
inspector + electron in one commit hides the highlights from the
CHANGELOG and over-reverts on rollback.
:::

## `subject`

- 50 chars or less (GitHub list view truncates).
- Imperative: `add`, `fix`, `update` — not `added` / `fixes` / `updating`.
- Lowercase first letter, no trailing `.`.
- Describe **what** was done; "why" goes into the body.

```
✅ feat(actions): add edit.duplicateSelection
❌ feat(actions): adding duplicate action
❌ Fix bug.
❌ feat: Implemented brand new awesome duplicate selection feature so users can clone entities.
```

## `body`

- Optional but **strongly encouraged** for non-trivial changes.
- Wrap at 72 chars.
- Explain the why, the alternative considered, the trade-offs.
- Separate from subject by a blank line.

```
feat(fsm): add drawEllipse FSM state

Existing draw states require N anchors then DOUBLE_CLICK to commit.
Ellipse needs only 2 clicks (center + edge), so it has a custom guard
that targets idle on the second MOUSE_DOWN.

Trade-off: ESC during the first click leaves a stale drawPoints; the
clearDrawCtx action resets it. See undoCancel.test.ts for the regression
guard.
```

## `footer`

```
BREAKING CHANGE: <description + migration>
Refs: #123
Closes: #456
```

`BREAKING CHANGE` triggers a minor or major version bump; cliff tags it
as `[**breaking**]`.

## Atomic-split principle

### One commit = one thing

```
✅ git log --oneline
feat(fsm): add drawEllipse state
feat(actions): register tool.drawEllipse action
feat(elements): add ellipse factory and type guard
test(elements): cover ellipse factory edge cases

❌ git log --oneline
feat: ellipse tool (FSM, action, element, tests, docs)
```

### When to split

| Scenario                        | Split / not         |
| ------------------------------- | ------------------- |
| ActionDef + dispatcher branch   | **Don't** (depends) |
| ActionDef + style token         | Split               |
| Bug fix + drive-by refactor     | Split               |
| Bug fix + regression test       | **Don't** (verify)  |
| Dep upgrade + adaptation        | Split               |
| Variable rename across 50 files | Standalone          |

## No co-author

::: warning Project policy
Do NOT add `Co-Authored-By:` in commit messages. AI signature banners
are not allowed either. Authorship lives in `git author`; for
collaboration, name reviewer / committer explicitly.
:::

Why:

- Cleaner blame history.
- CHANGELOG stays free of co-author noise.
- AI collaboration is the norm; tagging "Co-Authored-By: Claude"
  pollutes history.

## Template

Save to `.gitmessage`:

```
<type>(<scope>): <subject>

<body>

<footer>
```

```bash
git config commit.template .gitmessage
```

## Worked examples

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
FeatureCollection across the postMessage boundary. Bench drops the
1k-edit p99 from 142 ms to 23 ms.

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

## Commit workflow

1. **Write code** — stop when one thing is done.
2. **`git add -p`** — pick relevant hunks; drop unrelated noise.
3. **`git commit`** — write the message; body explains why.
4. **CI** — pre-commit runs lint-staged; commit-msg validates format.
5. **Push & PR**.

::: tip Two iron rules

1. **Read `git diff --staged` before commit** — confirm staging is
   intentional.
2. **When writing the body, ask "could a reader 5 years from now
   understand this?"** Rewrite if not.
   :::

## Husky hooks

| Hook         | Job                               |
| ------------ | --------------------------------- |
| `pre-commit` | `pnpm exec lint-staged` autofixes |
| `commit-msg` | Validates conventional commit     |

If a hook blocks you, **never** `--no-verify`. Fix the issue and
re-commit.

## Changelog automation

```bash
pnpm exec git-cliff -o CHANGELOG.md
```

`cliff.toml` controls grouping. `feat: foo` → `Features`, `fix: foo` →
`Bug Fixes`, etc. See [Release Process](./release-process).

## Anti-examples

```
❌ wip
❌ fix typo
❌ asdf
❌ Final commit
❌ feat: many improvements
❌ fix: oops
❌ Update README.md
```

Every one of those (1) fails the commit-msg hook (first 6) or (2) is a
GitHub-generated default that you should manually rewrite to conventional
format.

## Source links

- [`cliff.toml`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/cliff.toml)
- [`.husky/pre-commit`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/.husky/pre-commit)
- [Conventional Commits 1.0 spec](https://www.conventionalcommits.org/en/v1.0.0/)

::: tip Three things to remember

1. type + scope + subject.
2. body explains why.
3. one commit = one thing.
   The rest is enforced by `cliff.toml`.
   :::
