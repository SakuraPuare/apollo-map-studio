# Testing

Tests use [Vitest](https://vitest.dev). The runner is configured by
the project's `vite.config.ts` (Vitest reads Vite config) — no
separate `vitest.config.ts`. Tests live next to the module they cover
under a sibling `__tests__/` directory.

## Running

```sh
pnpm test                     # vitest run (CI mode, no watch)
pnpm test --watch             # interactive watch
pnpm test path/to/file        # filter by path
pnpm test -t "undo"           # filter by test name
```

`pnpm test` is the canonical command — CI uses it verbatim
(`.github/workflows/ci.yml` → `pnpm test`).

## Test layout

```text
src/
  core/
    fsm/
      editorMachine.ts
      __tests__/
        editorMachine.test.ts
    actions/
      registry.ts
      __tests__/
        registry.test.ts
    workers/
      laneJunctionGraph.ts
      __tests__/
        laneJunctionGraph.test.ts
        laneJunctionGraph.bench.ts
  hooks/
    useActionDispatcher.ts
    __tests__/
      undoCancel.test.ts
  lib/
    entityOps/
      cascadeDeleteRefs.ts
      __tests__/
        cascadeDeleteRefs.test.ts
  components/
    layout/
      panels/
        __tests__/
          InspectorForms.test.tsx
  io/
    __fixtures__/
      apollo/
    __tests__/
      apolloIO.test.ts
```

Two conventions:

1. Tests live in a `__tests__/` folder next to the module they cover.
2. Fixtures (binary files, sample inputs) live in `__fixtures__/`.

## Unit vs integration

| Kind        | Location                                   | What it covers                                                                   |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Unit        | `core/**/__tests__/`, `lib/**/__tests__/`  | One module, no DOM, no React.                                                    |
| Hook        | `hooks/**/__tests__/`                      | Hook in isolation; mock store / actor.                                           |
| Component   | `components/**/__tests__/`                 | Render with `@testing-library/react` (when added) or via direct prop assertions. |
| Integration | `io/__tests__/`, `core/workers/__tests__/` | Round-trip fixtures, multi-module flows.                                         |
| Bench       | `**/__tests__/*.bench.ts`                  | Vitest benchmarks; budget-checked in CI.                                         |

Keep unit tests fast (< 5ms each). Integration tests with fixtures
can be slower; tag heavy ones with descriptive names so they're easy
to filter when iterating.

## Writing a unit test

Pattern from `src/lib/entityOps/__tests__/cascadeDeleteRefs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cascadeDeleteRefsFull } from '../cascadeDeleteRefs';
import type { LaneEntity } from '@/types/apollo';

describe('cascadeDeleteRefs', () => {
  it('strips the deleted junction from a lane', () => {
    const lane: LaneEntity = makeLane({ id: 'l1', junctionId: 'j1' });
    const junction = makeJunction({ id: 'j1' });
    const entities = new Map([
      ['l1', lane],
      ['j1', junction],
    ]);

    const { changes } = cascadeDeleteRefsFull(new Set(['j1']), entities);

    expect(changes.get('l1')).toEqual({ ...lane, junctionId: null });
  });
});
```

Three rules:

- **Build minimal fixtures inline** unless a shared helper already
  exists. Fixture sprawl is the leading cause of brittle tests.
- **Test the public surface, not implementation details.** Cascade
  delete is tested by what's in `changes`, not by which internal
  helper was called.
- **Use `expect(...).toEqual(...)`** for structural equality;
  reserve `toBe` for primitives and reference identity.

## Worked example — the R1 undo regression

`src/hooks/__tests__/undoCancel.test.ts` is the canonical "guard a
fragile invariant" test. Context:

The `mapStore` is partialised with `partialize: { entities }`. A
mid-draw `Ctrl+Z` rolled back entities while the FSM still held stale
`drawPoints` / `dragPointIndex`. The next CONFIRM wrote against a
corrupted draft. Fix: dispatcher sends `{ type: 'CANCEL' }` to the FSM
**before** calling `temporal.undo()`.

```ts
// Mock module-level singletons before importing the dispatcher.
vi.mock('@/store/mapStore', () => ({
  useMapStore: Object.assign(
    vi.fn(() => ({ entities: new Map() })),
    {
      getState: vi.fn(() => ({ entities: new Map() })),
      temporal: {
        getState: vi.fn(() => ({ undo: temporalUndo, redo: temporalRedo })),
      },
    },
  ),
}));

it('sends CANCEL to the FSM actor before calling temporal.undo()', () => {
  const callLog: string[] = [];
  const actorRef = {
    send: vi.fn((event) => callLog.push(`send:${event.type}`)),
  };
  temporalUndo.mockImplementation(() => callLog.push('temporal.undo'));

  // Re-implement the dispatcher's exact ordering contract.
  const historyWithCancel = (op: 'undo' | 'redo') => {
    actorRef.send({ type: 'CANCEL' });
    if (op === 'undo') temporalUndo();
    else temporalRedo();
  };

  historyWithCancel('undo');
  expect(callLog).toEqual(['send:CANCEL', 'temporal.undo']);
});
```

Lessons from this test pattern:

- **Module mocks must be set up before the import.** `vi.mock` is
  hoisted automatically, but module-level state (like the dispatcher's
  closure over `useMapStore.temporal`) needs the mock in place at
  import time. Use dynamic `await import(...)` after `vi.mock` calls
  to make this explicit.
- **Reproduce the contract, not the framework.** This test doesn't
  spin up React; it asserts the **ordering** between
  `actorRef.send('CANCEL')` and `temporal.undo()`. That's the
  invariant that matters.
- **One ordering = one assertion.** A single `expect(callLog)
.toEqual([...])` reads cleaner than three `toHaveBeenCalledTimes`
  checks.

## Component tests

When a form's behaviour can be reduced to "value typed → updateEntity
called", do that without rendering:

```ts
it('persists friction edits', () => {
  const updateEntity = vi.fn();
  // call form's diff helper directly
  const diff = diffLaneFormAgainstEntity({ friction: 0.8 /* … */ }, makeLane({ friction: 0.5 }));
  expect(diff).toMatchObject({ friction: 0.8 });
});
```

The `lane.tsx` form already exports
`diffLaneFormAgainstEntity` / `shouldPersistLaneForm` /
`laneFormValuesFromEntity` for exactly this purpose — let pure
functions carry the test surface.

For tests that genuinely require rendering, keep them small and
exercise one observable behaviour at a time.

## Fixtures

`src/io/__fixtures__/apollo/` holds Apollo binary and text-proto
samples used by the round-trip tests. Naming pattern:

```text
src/io/__fixtures__/apollo/
  minimal.bin            # smallest valid map
  minimal.txt            # text-proto equivalent
  sunnyvale-loop.bin     # mid-size real-world sample
  toll-gate-poc.bin      # exercises a specific entity
```

Add a fixture when:

1. You introduce a new entity type and need a round-trip test.
2. You fix a bug whose minimal reproducer is awkward to construct in
   code (real-world geometry, large junction graph).

Keep fixtures small. Anything over a few hundred KB belongs as a
generated test instead of checked-in binary.

## Worker tests

Workers are awkward to spin up in Vitest. Unit-test the helpers, not
the worker entry:

| Module                 | Test file                   |
| ---------------------- | --------------------------- |
| `spatialFeatures.ts`   | `spatialFeatures.test.ts`   |
| `spatialHitTest.ts`    | `spatialHitTest.test.ts`    |
| `laneJunctionGraph.ts` | `laneJunctionGraph.test.ts` |

The worker entry (`spatial.worker.ts`) is a thin dispatcher; its
correctness is enforced by integration tests in `useColdLayer`'s
test file (when present).

## Coverage

Coverage runs via `@vitest/coverage-v8`:

```sh
pnpm test --coverage
```

Coverage is informational — there's no enforced floor in CI. Use it
to spot untested branches in newly-added code, not as a gate.

## Test isolation

Vitest defaults to running test files in parallel. Don't rely on
shared global state between files:

- Reset module-level caches at the top of each test file
  (`beforeEach(() => _resetIsMacCache())`).
- Don't mutate fixture objects in tests; clone them via
  `structuredClone(fixture)` if a test needs to mutate.
- Mocks are file-scoped — you don't need to `vi.resetModules()` unless
  you're changing mock state mid-file.

## Common mistakes

- **Asserting on internal calls, not behaviour.** A test that asserts
  `expect(fn).toHaveBeenCalledTimes(3)` is fragile — refactoring the
  internal call pattern breaks the test even when behaviour is
  unchanged.
- **Testing private types.** If a test imports something from a
  module's `__tests__/` folder of another module, you've coupled
  tests across boundaries. Either expose a stable helper or duplicate
  the fixture.
- **Skipping with `it.skip` instead of fixing.** Skipped tests rot
  silently. Either fix or delete.
- **Missing `await` on async setup.** `await import(...)` after
  `vi.mock` is mandatory for module-level mock to take effect.

## Cross-references

- [benchmarking](./benchmarking.md) — bench files and the budget guard
- [development-setup](./development-setup.md) — `pnpm test` in context
- [code-style](./code-style.md) — test files get laxer ESLint rules
- [/api/hooks](../api/hooks/) — hook contracts under test
