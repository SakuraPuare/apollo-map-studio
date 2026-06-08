---
title: Testing
description: Vitest patterns, fixtures, regression tests (undoCancel, clickDedup), and how to add a unit test.
---

# Testing

Testing = Vitest 4. We follow "test the deterministic, the previously
broken, and the public contracts." Where a bug fired, add a regression;
where coverage is zero, either delete or test.

::: tip Status

- Unit tests live in `__tests__/` next to the code they test.
- Benchmarks live in `*.bench.ts` next to the code.
- Web E2E lives in `tests/e2e/` and uses Playwright + Chromium for browser/renderer workflows.
- Electron E2E lives in `electron-e2e/` and uses Playwright Electron to launch the real desktop shell.
- `pnpm test:electron` is not E2E; it runs main/preload/license unit tests with `node --test`.

Regular CI runs `pnpm test` and `pnpm test:electron`; Web/Electron E2E are targeted or release-before checks unless the workflow explicitly adds them.
:::

## Command cheat-sheet

```bash
pnpm test                                    # full
pnpm test src/core/elements                  # subset
pnpm test --watch                            # watch
pnpm test --reporter=verbose                 # per-it output
pnpm test --coverage                         # v8 coverage
pnpm test --update                           # update snapshots (rare)
pnpm test:e2e                                # Web E2E: Chromium + Vite test server
pnpm test:e2e:ci                             # Install Chromium/deps, then run Web E2E
pnpm test:electron                           # Electron main/preload/license unit tests
pnpm test:electron:e2e                       # Electron desktop E2E
```

On Linux without `DISPLAY`, Electron E2E needs `xvfb-run`. The script uses it
automatically when available; otherwise install xvfb or run
`xvfb-run -a pnpm test:electron:e2e`.

## Layout convention

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
        ├── undoCancel.test.ts        # R1 regression
        └── clickDedup.test.ts        # double-click regression
```

## AAA structure

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

::: warning One `it` = one assertion topic
Don't pile seven expectations into one `it`. When it fails you can't
tell which slipped.
:::

## Fixtures

Shared fixtures live in `src/__fixtures__/`:

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

::: tip No global setup/teardown
Vitest is ESM + functional. Each `it` builds its own data, independent
and explicit.
:::

## Regression tests

When you fix a bug, **always** add a test. Test name references the
issue or commit.

### Example 1: `undoCancel.test.ts` (R1)

```ts
// src/hooks/__tests__/undoCancel.test.ts
it('cancels FSM before zundo undo to avoid stale drawPoints', () => {
  startDrawing();
  addPoint([0, 0]);
  addPoint([1, 0]);
  expect(actor.getSnapshot().context.drawPoints).toHaveLength(2);

  dispatch('edit.undo');

  // FSM must receive CANCEL first
  expect(actor.getSnapshot().value).toBe('idle');
  expect(actor.getSnapshot().context.drawPoints).toEqual([]);
});
```

### Example 2: `clickDedup.test.ts`

```ts
it('does not commit twice when MOUSE_DOWN coincides with DOUBLE_CLICK', () => {
  startDrawing();
  addPoint([0, 0]);

  // Simulate double-click: both events arrive
  fireMouseDown([1, 0]);
  fireDoubleClick([1, 0]);

  expect(mapStore.getState().entities.size).toBe(1);
});
```

::: warning Every bug gets a regression
"I fixed it but didn't add a test" = the bug returns. Reviewers MUST
block on this.
:::

## React component tests

Use sparingly. If you can test it in `lib/`, don't test it in
`components/`. Component tests target **user-visible behavior**:

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '@/components/CommandPalette';

it('filters actions by query', () => {
  render(<CommandPalette open onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'duplicate' } });
  expect(screen.getByText(/duplicate selection/i)).toBeVisible();
});
```

::: tip No snapshots
Snapshots hide intent. Use `getByText` / `getByRole`, or don't test
rendering at all.
:::

## FSM tests

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

## Worker tests (indirect)

Real workers don't run in jsdom. Extract the algorithm into a pure
function and test that:

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

The worker file then only routes messages.

## Import / export round-trip

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

Cover proto2 optional / required / repeated paths in one suite.

## Recording assumed-failures

```ts
it.fails('this assumption holds', () => {
  // expected to fail; documents a known limitation
});
```

Use sparingly to record "we know this is broken; here's the test".

## Mocking

Mock as little as possible. Use real implementations:

```ts
// ✅ real zustand store
import { mapStore } from '@/store/mapStore';
mapStore.setState({ entities: new Map() });

// ❌ mock zustand
vi.mock('@/store/mapStore', () => ({ mapStore: { getState: () => ({}) } }));
```

When a mock is unavoidable (worker, network):

```ts
import { vi } from 'vitest';
vi.mock('@/core/workers/spatialBridge', () => ({
  requestSync: vi.fn().mockResolvedValue({ groups: [] }),
}));
```

## Async tests

```ts
it('worker SYNC resolves within one frame', async () => {
  const result = await requestSyncDebounced(entities);
  expect(result.groups).toHaveLength(entities.length);
});
```

Don't `setTimeout(done, 100)`. For RAF, use fake timers:

```ts
it('coalesces multiple sync requests into one', () => {
  vi.useFakeTimers();
  for (let i = 0; i < 100; i++) requestSync(entities);
  vi.advanceTimersToNextFrame();
  expect(workerPostMessage).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

## Coverage

```bash
pnpm test --coverage
```

Targets:

- core/, lib/: ≥ 80%
- store/, hooks/: ≥ 60%
- components/: ≥ 40% (visual-heavy)

::: warning Don't chase coverage
80% high-quality beats 100% padded. `expect(true).toBe(true)` claims
coverage and adds zero value.
:::

## How to add one unit test

1. Create `src/.../__tests__/foo.test.ts` next to `foo.ts`.
2. `import { ... } from '../foo'`.
3. Wrap in `describe('functionName')`.
4. Write 1 happy-path `it`.
5. Write 1 edge-case `it` (empty, null, large input, negative).
6. `pnpm test src/.../foo` passes.
7. Commit: `test(<scope>): cover ...` (conventional).

## Common pitfalls

### "Works on my machine"

Run the full `pnpm test`. Cross-test pollution (shared store not reset)
only surfaces in the full run.

### Snapshot bombs

Don't `toMatchSnapshot()` large component trees. Diffs become
unreviewable. Use semantic assertions.

### `vi.useFakeTimers()` not restored

`afterEach(() => vi.useRealTimers())`, otherwise the next test sees fake
time.

### Cross-test store sharing

```ts
beforeEach(() => mapStore.setState({ entities: new Map() }));
```

Each test builds its own data.

### Testing implementation, not behavior

"I called internalFunction" is brittle. Refactor and the test breaks.
"Input X yields output Y" is durable.

## Source links

- [`src/hooks/__tests__/undoCancel.test.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/src/hooks/__tests__/undoCancel.test.ts)
- [`src/hooks/__tests__/clickDedup.test.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/src/hooks/__tests__/clickDedup.test.ts)
- [Vitest 4 docs](https://vitest.dev/)
- [`vite.config.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/vite.config.ts) — vitest config

## Advanced

### Fuzzing

Geometry functions can use [fast-check](https://fast-check.dev/):

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

Not yet wired in; recommended P3.

### Benchmarks vs unit tests

`*.bench.ts` uses `bench()`, `*.test.ts` uses `it()`. `pnpm test` does
not run benchmarks. See [Benchmarking](./benchmarking).

::: tip One sentence
Test the deterministic, test what once broke, test the public contract.
Leave private implementation to refactors.
:::
