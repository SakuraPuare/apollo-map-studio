---
title: Code Style
description: eslint.config.js rules, Prettier config, Tailwind class ordering, naming conventions, and TypeScript discipline.
---

# Code Style

Code style is one sentence: **ESLint 9 + Prettier 3 run automatically; CI
red, fix it, re-push.** This page documents the "why" behind the rules
and shows good vs bad examples.

::: tip Three lines of defense

1. **Local** — `.husky/pre-commit` runs lint-staged, auto-fixing.
2. **CI** — `pnpm format:check && pnpm lint`, red blocks the merge.
3. **Code review** — humans look at architecture, naming, readability.
   Don't re-do the linter's job.
   :::

## ESLint flat config

`eslint.config.js` enables React Hooks rules and TypeScript ESLint.
**Type-aware** rules are deliberately OFF (too slow on a geometry-heavy
codebase, and `tsc --noEmit` already runs in CI).

### Rules that MUST hold

| Rule                                    | Level | Why                                     |
| --------------------------------------- | ----- | --------------------------------------- |
| `react-hooks/rules-of-hooks`            | error | Wrong call order = runtime crash        |
| `react-hooks/exhaustive-deps`           | warn  | Closure traps cause bugs                |
| `eqeqeq`                                | error | `==` is almost always a bug             |
| `no-restricted-syntax: as unknown as X` | error | See "TypeScript discipline" below       |
| `max-lines: 400`                        | warn  | AI-friendly; split into sibling modules |
| `max-lines-per-function: 80`            | warn  | Same                                    |
| `complexity: 15`                        | warn  | High complexity = hard to read or test  |

### Why the AI-friendly size budgets

From `eslint.config.js` itself:

> Small files / small functions = an AI agent can hold the whole unit in
> context for local reasoning. Going past the threshold usually means
> the module has more than one responsibility — split into sibling
> subdirectories (see `WorkspaceLayout/`, `mapEventRouter/`,
> `mapLibreInit/` for examples).

::: warning Not advice — a hard budget
When a file exceeds 400 lines / a function exceeds 80 lines / complexity

> 15: **split before adding features**. PRs that cram into existing
> files do not merge.
> :::

### TypeScript discipline

```ts
// ❌ Forbidden
const x = something as unknown as MyType;

// ✅ Use a type guard / typed accessor / `in` narrowing
function isMyType(v: unknown): v is MyType {
  /* ... */
}
if (isMyType(something)) use(something);
```

See `src/types/apollo.ts` `getSource` / `getSourceRect` for the pattern.

### Import paths

```ts
// ❌
import { x } from '../../../core/foo';

// ✅
import { x } from '@/core/foo';
```

`@/` alias is configured in `tsconfig.json` and `vite.config.ts`. Deep
relative paths produce an ESLint warning.

## Prettier configuration

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

### Highlights

- Single-quoted strings.
- Always trailing commas.
- 100-col wrap (not 80, not 120 — 100 balances readability against
  modern displays).
- Always `;`.
- Arrow `(x) => x`, parens always.
- LF line endings.

::: tip Don't argue formatting
Prettier owns formatting. `pnpm format` fixes it. Code review must not
comment on indent or quotes.
:::

## Tailwind class ordering

::: warning prettier-plugin-tailwindcss is OFF today
Class ordering is human-maintained. Suggested order:
**layout → box model → color → typography → state variants**.

```tsx
// ✅
<div className="flex items-center gap-2 px-4 py-2 bg-ams-bg-canvas text-ams-fg-default hover:bg-ams-bg-canvas-hover" />

// ❌ (colors mixed into layout)
<div className="flex bg-blue-500 items-center text-red-700 px-4" />
```

:::

When the plugin is enabled, ordering will be automatic; expect a
one-shot reflow PR.

## Naming conventions

### Files

| Kind            | Naming                  | Example              |
| --------------- | ----------------------- | -------------------- |
| React component | PascalCase + `.tsx`     | `LaneInspector.tsx`  |
| Hook            | `use*` + `.ts`          | `useDrawCommit.ts`   |
| Worker          | `*.worker.ts`           | `spatial.worker.ts`  |
| Test            | `*.test.ts(x)`          | `lane.test.ts`       |
| Types           | camelCase               | `inspectorSchema.ts` |
| Constants       | camelCase               | `mapConstants.ts`    |
| Directories     | kebab-case or camelCase | `core/actions/`      |

### Identifiers

```ts
// ✅
const laneCount = 12; // camelCase variable
function createLane() {} // camelCase function
class LaneRenderer {} // PascalCase class
const DEFAULT_LANE_HALF_WIDTH = 1.75; // SCREAMING_SNAKE constant
type LaneEntity = {/* ... */}; // PascalCase type

// ❌
const lane_count = 12;
function CreateLane() {}
const default_lane_half_width = 1.75;
```

### React component props

```tsx
// ✅ Explicit interface
interface LaneInspectorProps {
  laneId: string;
  readonly?: boolean;
  onSave?: (lane: LaneEntity) => void;
}

export function LaneInspector({ laneId, readonly, onSave }: LaneInspectorProps) {}

// ❌ Inline
export function LaneInspector(props: { laneId: string; readonly?: boolean }) {}
```

### Boolean naming

```ts
// ✅ Prefix with is/has/can/should
const isDirty = true;
const hasErrors = errors.length > 0;
const canEdit = !readonly && hasPermission;

// ❌
const dirty = true;
const errors = errors.length > 0;
```

## React patterns

### Component size

- File < 200 lines.
- Component < 80 lines of JSX (hooks included).

Beyond that, split by responsibility:

```
LaneInspector/
  LaneInspector.tsx        # Main, < 60 lines
  LaneInspectorHeader.tsx
  LaneInspectorFields.tsx
  LaneInspectorActions.tsx
  index.ts                 # re-export
```

### Side effects

- One `useEffect` per responsibility. Five `if/else` inside one effect =
  five hooks.
- Always return a cleanup function (`return () => unsub();`).
- Trust `react-hooks/exhaustive-deps`. Do not `// eslint-disable` it.

### Don't prop-drill 5 levels

At 3+ levels switch to a zustand store or React context. See
[State Management](../architecture/state-management).

## TypeScript patterns

### Strict unions + discriminated union

```ts
// ✅
type DrawState =
  { kind: 'idle' } | { kind: 'drawing'; points: LngLat[] } | { kind: 'editing'; entityId: string };

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

### No bare `any`

`any` disables type checking. Use `unknown` + type guards or precise
types.

### Default to `readonly`

```ts
// readonly on params
function sumWidths(samples: readonly LaneSample[]): number {
  /* ... */
}

// frozen array literal
const DRAW_STATES = ['drawPolyline', 'drawArc'] as const;
```

## Comments

- **Why** in comments (`// R1: cancel before undo because ...`).
- **What** is told by the code (variable, function names).
- No "this is the lane" filler.

::: tip Reference git history
Major design decisions: append a commit hash so future readers can
trace:

```ts
// R1: send CANCEL before temporal.undo() (commit 6a83d9d)
```

:::

## CSS

- Use [`ams-*` tokens](../recipes/theming-with-ams-tokens), no hex.
- Avoid empty React `style` objects for static styles (use Tailwind utilities).
- Reserve `style` for dynamic values (`transform: rotate(${a}deg)`).

## Module organization

- `core/` cannot import `lib/`, `store/`, `hooks/`, `components/`.
- `lib/` cannot import `store/`, `hooks/`, `components/`.
- `store/` cannot import `hooks/`, `components/`.
- `hooks/` cannot import `components/`.

See [Architecture: Layering](../architecture/layering).

## Good vs bad

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

## Tooling commands

```bash
pnpm format         # fix
pnpm format:check   # verify
pnpm lint           # ESLint
pnpm lint:fix       # ESLint --fix
pnpm typecheck      # tsc --noEmit
```

CI runs them all. Run locally before commit.

## Source links

- [`eslint.config.js`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/eslint.config.js)
- [`.prettierrc.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/.prettierrc.json)
- [`tsconfig.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/tsconfig.json)
- [Architecture: Layering](../architecture/layering)

::: warning Don't write bad code just to pass lint
ESLint rules are the floor, not the ceiling. "Short" ≠ "good", "passes
max-lines" ≠ "readable". Rules and taste are both required.
:::
