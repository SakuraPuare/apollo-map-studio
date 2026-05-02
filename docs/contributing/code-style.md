# Code Style

Style rules are enforced by three tools:

- **TypeScript** (`tsconfig.json`, strict mode) — type correctness.
- **ESLint 9** (`eslint.config.js`, flat config) — react-hooks
  correctness, import hygiene, complexity caps, AST-level traps.
- **Prettier** (`.prettierrc.json`) — formatting.

Type-aware ESLint rules are deliberately **off** — they're too slow
for a geometry-heavy codebase, and `tsc --noEmit` already runs in CI.
ESLint here is limited to react-hooks, idiomatic TS, and bug catching.

## Quick reference

| Tool       | Local                          | CI                  |
| ---------- | ------------------------------ | ------------------- |
| TypeScript | `pnpm typecheck`               | `pnpm typecheck`    |
| ESLint     | `pnpm lint` / `pnpm lint:fix`  | `pnpm lint`         |
| Prettier   | `pnpm format` / `format:check` | `pnpm format:check` |
| Pre-commit | `lint-staged` via husky        | n/a                 |

## TypeScript

Strict mode is on. `noUncheckedIndexedAccess` shapes a lot of code —
expect to see explicit null checks after `arr[i]`:

```ts
const tail = anchors[anchors.length - 1];
if (!tail) return context.bezierAnchors;
const last = { ...tail };
```

This is intentional. The compile-time guard prevents whole classes of
"undefined is not an object" errors at runtime.

### `as unknown as X` is banned

ESLint blocks the chained-cast escape hatch:

```ts
// blocked by eslint.config.js → no-restricted-syntax
const x = thing as unknown as Lane;
```

Use a typed accessor, a type guard, or `in`-narrowing:

```ts
// preferred
function getLane(e: MapEntity): LaneEntity | null {
  return e.entityType === 'lane' ? e : null;
}
if ('overlapIds' in e && Array.isArray(e.overlapIds)) { … }
```

Reference: `src/types/apollo.ts` — `getSource` / `getSourceRect` are
the canonical typed-accessor examples after the 2026-04 cleanup.

### Type imports

Inline type imports are required:

```ts
// good
import { type ActionDef, getMenuActions } from '@/core/actions/registry';

// bad — eslint warns
import { ActionDef, getMenuActions } from '@/core/actions/registry';
```

ESLint auto-fixes this with the `consistent-type-imports` rule.

## ESLint rules at a glance

From `eslint.config.js`:

### React

- `react-hooks/rules-of-hooks: error` — no conditional hook calls.
- `react-hooks/exhaustive-deps: warn` — missing deps cause warnings.
  Justify exclusions inline (`// eslint-disable-next-line
react-hooks/exhaustive-deps`) with a one-line reason.
- `react-refresh/only-export-components: warn` — keeps Fast Refresh
  reliable.

### TypeScript ergonomics

- `@typescript-eslint/no-unused-vars: warn` with `^_` ignore prefix.
- `@typescript-eslint/no-explicit-any: warn` — `any` is allowed in
  test files, warned elsewhere.
- `@typescript-eslint/no-empty-object-type: off` — `{}` is sometimes
  the right type.

### Size and complexity caps

These are AI-friendly limits. Smaller files / functions = a
language model can fit the whole unit in context for local reasoning.
Going over usually means the unit is doing too much; split into a
sibling subdirectory.

| Rule                     | Limit                     |
| ------------------------ | ------------------------- |
| `max-lines`              | 400 lines per file (warn) |
| `max-lines-per-function` | 80 lines (warn)           |
| `complexity`             | 15 (warn)                 |
| `max-depth`              | 4 (warn)                  |
| `max-params`             | 5 (warn)                  |

Reference splits: `WorkspaceLayout/`, `mapEventRouter/`,
`mapLibreInit/` — each was a single file that grew past the caps and
was fanned into a directory of cohesive sub-modules.

Test files and type definitions get exemptions:

```ts
// type files: max-lines off
{ files: ['src/types/**/*.ts', 'src/proto/**/*.ts'], rules: { 'max-lines': 'off' } }

// tests: laxer caps
{ files: ['**/*.test.ts', '**/__tests__/**'], rules: { 'max-lines-per-function': 'off', complexity: 'off' } }
```

### Imports

- `no-restricted-imports` — deep relative paths (`../../../`) are
  warned. Use `@/...` instead.
- `consistent-type-imports` — see above.

### Plain JS hygiene

| Rule               | Setting                                            |
| ------------------ | -------------------------------------------------- |
| `no-console`       | warn, except `console.warn` / `console.error`      |
| `no-debugger`      | warn                                               |
| `prefer-const`     | warn                                               |
| `eqeqeq`           | error (with `null` ignored — `== null` is allowed) |
| `prefer-template`  | warn                                               |
| `object-shorthand` | warn                                               |

### Layer-import rule (backlog)

Imports flow downward only:
`components/` → `hooks/` → `store/` → `lib/` → `core/`. The codebase
follows this convention manually; an automated lint rule (likely a
custom plugin or `eslint-plugin-boundaries`) is on the P2 backlog.
Until then, **review checklist enforces the rule**:

::: warning Layer-import order
A `core/` file importing from `lib/` or higher is an ACL violation.
Check during review:

```sh
git grep -E "from '@/lib|from '@/store|from '@/hooks|from '@/components'" -- 'src/core/**'
git grep -E "from '@/store|from '@/hooks|from '@/components'" -- 'src/lib/**'
```

Empty results = clean. Non-empty = block the PR until refactored.
:::

## Prettier

`.prettierrc.json`:

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

Two-space indent, semicolons on, single quotes for JS / TS, double
quotes for JSX attributes (Prettier's default — leave them be).

## Naming conventions

| Kind                 | Style             | Example                                           |
| -------------------- | ----------------- | ------------------------------------------------- |
| React component file | `PascalCase.tsx`  | `MapCanvas.tsx`, `LaneForm.tsx`                   |
| Hook file            | `useThing.ts`     | `useColdLayer.ts`, `useDrawCommit.ts`             |
| Plain module         | `camelCase.ts`    | `entityOps.ts`, `mapIcons.ts`, `editorMachine.ts` |
| Test file            | `name.test.ts(x)` | `useDrawCommit.test.ts`, `LaneForm.test.tsx`      |
| Bench file           | `name.bench.ts`   | `laneJunctions.bench.ts`                          |
| Worker entry         | `name.worker.ts`  | `spatial.worker.ts`, `apolloIO.worker.ts`         |
| Type-only module     | `lowercase.ts`    | `entities.ts`, `apollo.ts`                        |
| Constants module     | `camelCase.ts`    | `constants.ts`, `enumLabels.ts`                   |

Function names are verb-first; types and interfaces are PascalCase.
Action ids use camelCase with optional `prefix:` (`tool:drawPolyline`,
`importApollo`).

## File layout patterns

Two patterns recur:

### Single-file module

A self-contained module that fits within `max-lines: 400`:

```text
src/lib/mapIcons.ts
src/lib/idGenerator.ts
src/store/uiStore.ts
```

### Split-into-folder

When a single file outgrows the caps, split into a sibling directory
with an entrypoint:

```text
src/lib/
  entityOps.ts                   # re-exports the surface
  entityOps/
    cascadeDeleteRefs.ts
    edit.ts
    reparent.ts
    typeGuards.ts
```

The entrypoint **re-exports** types and functions so consumers stay
unchanged:

```ts
// src/lib/entityOps.ts
export {
  cascadeDeleteRefs,
  cascadeDeleteRefsFull,
  type CascadeDeleteResult,
} from './entityOps/cascadeDeleteRefs';
export { compileEntity, createEntity, … } from './entityOps/edit';
```

This keeps the import surface stable when the implementation reshuffles.

## Comment policy

**Minimal.** Comments answer "why", not "what". Default to letting
the code and types speak for themselves.

When you do comment, be specific:

```ts
// Read POST-transition snapshot: addPoint runs as a transition action,
// so prevSnapshot is short by exactly one point. drawArc / drawRotatedRect
// rely on the post-snapshot.
```

Avoid:

```ts
// Add the new point to drawPoints
drawPoints.push(p);
```

The function name and the call already say that.

## `// @ts-nocheck` and `eslint-disable`

`editorMachine.ts` carries a deliberate `// @ts-nocheck` for the
XState 5 generic inference bugs. ESLint's `ban-ts-comment` is
suppressed for that one file.

Anywhere else, both directives need a comment that:

1. Names the rule being silenced.
2. Explains why the rule's normal advice is wrong here.
3. Links to a follow-up if the suppression should be temporary.

```ts
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [entity.id]);   // intentional: stable subscription per selection, not per render
```

## Pre-commit hook

`.husky/pre-commit` runs `pnpm exec lint-staged`. The `lint-staged`
config is in `package.json`:

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"]
}
```

The hook runs on **staged** files only. If the auto-fix produces
changes, the hook re-stages them, then your commit proceeds. If the
ESLint pass fails (e.g. an error not auto-fixable), the commit is
blocked.

::: tip Bypassing the hook
Don't `git commit --no-verify` to skip a pre-commit failure. Fix the
issue and create a new commit. The CI runs the same checks; bypassing
locally just defers the failure.
:::

## Cross-references

- [development-setup](./development-setup.md) — install + run
- [commit-conventions](./commit-conventions.md) — Conventional Commits
- [pr-checklist](./pr-checklist.md) — gating items for review
- [/architecture/overview](../architecture/overview.md) — layer-import rules
