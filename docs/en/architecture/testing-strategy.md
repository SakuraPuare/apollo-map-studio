---
title: Testing Strategy
description: Vitest unit tests; what is tested at lib / core / hook layers; fixtures (src/io/__fixtures__/); undoCancel.test.ts as the canonical regression
---

# Testing Strategy

> Test runner: Vitest 4.1.4
> Commands: `pnpm test` (run), `pnpm bench` (benchmarks)
> Config: vitest config inherits the Vite resolver. **No jsdom /
> happy-dom** — by design, to avoid DOM-mock drift.

## 1. Pyramid

```
    ┌────────────────────────────────────┐
    │  Integration / round-trip          │  src/io/__tests__/endToEnd.test.ts
    │  few, real Apollo fixtures         │
    ├────────────────────────────────────┤
    │  Hooks (closures and ordering)     │  src/hooks/__tests__/*.test.ts
    │  assert "call order" + side effects │  e.g. undoCancel.test.ts
    ├────────────────────────────────────┤
    │  Pure-function units (the bulk)    │  src/lib/__tests__/*.test.ts
    │  geometry / adapter / schema / derive │  e.g. entityOps.test.ts
    └────────────────────────────────────┘
```

The base is the heaviest layer — cheapest to write, most stable.

## 2. Three layers, three intents

### 2.1 lib layer (pure)

**What we test**:

- adapter / anti-corruption layer: `entityOps` type guards, setters,
  coords shape;
- schema: `formValuesFromEntity` / `applyFormValuesToEntity` inverse;
- geometry: bezier / polyline / arc hit testing, length integrals;
- enums / labels: full coverage of `getEnumLabel`.

**How**:

- No mocks; real dependencies all the way down.
- Hand-written object-literal fixtures so assertions are not laundered
  through helpers.

Example (`src/lib/__tests__/entityOps.test.ts`):

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

it('isDrawingEntity discriminates lane vs polyline', () => {
  expect(isDrawingEntity(polyline())).toBe(true);
  // ...
});
```

### 2.2 core layer

**What we test**:

- FSM transition order and guards;
- worker request handling (no real Worker — call
  `handleRequest(state, req, respond)`);
- topology / overlap reconciler local-patch correctness;
- spatial-index R-tree invariants.

**How**:

- core has no React; it runs straight in Vitest.
- worker tests stub the Worker — instead of `new Worker(...)`, call
  `handleRequest` directly with an in-memory respond callback.

Example (`src/core/workers/__tests__/spatialRequests.test.ts`):

```ts
const responses: WorkerResponse[] = [];
handleRequest(state, { type: 'SYNC', requestId: 'r1', entities: [...] },
  (msg) => responses.push(msg));
expect(responses[0].type).toBe('COLD_READY');
```

### 2.3 hooks layer

**What we test**:

- closure ordering: e.g. the R1 / R2 ordering contracts;
- store + action dispatcher cooperation;
- input dedupe (`isDuplicateInput`, dblclick);

**How**:

- No jsdom; lift the hook's pure-logic core into a separate ts file
  and test that.
- Mock zustand stores via `vi.mock('@/store/...')`.
- Re-implement the hook's "minimum contract" inline and assert
  against it (see undoCancel.test.ts).

## 3. Canonical regression: `undoCancel.test.ts`

`src/hooks/__tests__/undoCancel.test.ts` is the template. The bug:

> zundo only partializes `mapStore.entities`. Ctrl+Z mid-draw rolls
> back entities while FSM still holds stale `drawPoints`. The next
> CONFIRM / DRAG_END corrupts state.
>
> Fix: dispatcher wraps undo/redo to send `{ type: 'CANCEL' }` to the
> FSM actor before invoking `temporal.undo()`.

The test:

1. **Mock singletons**:

   ```ts
   vi.mock('@/store/mapStore', () => ({
     useMapStore: Object.assign(vi.fn(...), {
       getState: vi.fn(...),
       temporal: { getState: vi.fn(...) },
     }),
   }));
   ```

2. **Re-implement the contract** (jsdom not available):

   ```ts
   const historyWithCancel = (op: 'undo' | 'redo') => {
     actorRef.send({ type: 'CANCEL' });
     if (op === 'undo') temporalUndo();
     else temporalRedo();
   };
   ```

3. **Assert call log**:

   ```ts
   expect(callLog).toEqual(['send:CANCEL', 'temporal.undo']);
   ```

4. **Edge case**: idle-state undo also fires CANCEL (always-fire keeps
   the dispatcher simple).

Why it works:

- No jsdom is needed because the contract is pure logic.
- Making the contract **explicit** doubles as documentation.
- The same template applies to any future hook that has an ordering
  invariant.

## 4. Fixtures

`src/io/__fixtures__/apollo/`:

| Fixture        | Source                 | Size / purpose                        |
| -------------- | ---------------------- | ------------------------------------- |
| `borregas_ave` | Apollo demo            | small city map, end-to-end round trip |
| `demo`         | Apollo `map_data/demo` | starter fixture                       |
| `dreamview`    | Apollo Dreamview       | medium, broader entity coverage       |

Notes:

- Fixtures are real Apollo `.bin` files committed to git, not
  hand-rolled JSON, so schema evolution still touches realistic data.
- Sizes stay in KB-MB range; performance-class fixtures live elsewhere
  (or are generated at runtime).

Loading sketch (`endToEnd.test.ts`):

```ts
const bytes = await fs.readFile(path.join(FIXTURE_DIR, 'borregas_ave/base_map.bin'));
const result = await runImport(bytes);
const reExported = await runExport(result.entities, result.info.projString);
const second = await runImport(reExported);
expect(second.lanes.length).toBe(result.lanes.length);
```

Round trip is the gold-standard assertion: import → edit → export →
re-import preserves every invariant we care about.

## 5. Benchmarks and perf budget

`pnpm bench` runs `vitest bench --run` and emits
`bench-results.json`. `scripts/check-bench-budget.mjs` compares it to
`scripts/bench-budgets.json` and fails CI on regressions.

```json
// scripts/bench-budgets.json (illustrative)
{
  "buildFeatureCollection": { "max_ms": 50 },
  "reconcileOverlaps_full": { "max_ms": 600 },
  ...
}
```

Adding a bench requires adding a budget — otherwise CI cannot detect
regression.

## 6. Why no jsdom

Reasons:

- jsdom diverges from real browsers, especially around maplibre-gl
  GL context, rAF timing, and ResizeObserver.
- Mocking the DOM tends to test the mock, not the product.

Cost:

- We cannot `render(<Form />)` directly.
- We must lift hook cores into testable pure functions
  (`formValuesFromEntity`, etc.).

Result: tests stay fast (~1 s total) and stable. UI rendering
behaviour is verified through Playwright (planned) and manual smoke
tests.

## 7. CI integration

`.github/workflows/ci.yml` runs on push / PR:

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

Failure in any of `pnpm test` or `bench-budget` blocks merge.

## 8. Naming conventions

- Tests live in `__tests__/` next to the subject (Vitest auto-discovery).
- Filename `<subject>.test.ts`; regressions use semantic names like
  `<symbol>Cancel.test.ts`, `<topic>Migration.test.ts`.
- Top-level `describe` matches the filename.
- The first sentence inside `it` should be readable as a PR
  description line.

## 9. Mock vs real code

| Scenario                     | Choice                                          |
| ---------------------------- | ----------------------------------------------- |
| Pure functions (lib / core)  | real code, no mocks                             |
| Cross-layer closures (hooks) | mock zustand singletons + re-implement contract |
| Web Worker                   | call `handleRequest` directly                   |
| MapLibre GL                  | not tested; Playwright (planned) for E2E        |
| Electron IPC                 | not tested; verify web fallback path            |
| FileReader / Blob            | Node Buffer substitute                          |

## 10. Coverage (planned)

`@vitest/coverage-v8` is in devDeps; thresholds not yet enforced.
Targets:

- lib layer → 80%+
- core layer → 70%+
- hooks layer → key closures at 100% (undoCancel already pinned)

## 11. Pitfalls

1. **Bringing in jsdom for one test** destabilises the whole suite —
   don't; lift to a pure function.
2. **`vi.mock` after import** does not mock — `vi.mock` must run
   before the import. `undoCancel.test.ts` dynamically imports the
   dispatcher after mocks are set up.
3. **Fixture drift** — entity type changes can break fixture loading;
   either regenerate fixtures or keep IO compatible with old fields.
4. **Flaky benches** — leave a 1.5× margin in budgets to absorb CI
   runner jitter.
5. **`vi.useFakeTimers()` + RAF** — RAF callbacks need
   `vi.advanceTimersByTime` or `vi.runAllTimers`; otherwise tests
   hang.

## 12. Adding a new test (SOP)

1. Create `__tests__/` next to the subject.
2. Lift testable parts into `lib/` first; let tests fall out
   naturally.
3. For closures: mock + re-implement minimum contract.
4. For round trip: use fixtures, assert invariants.
5. In the PR, write one sentence on why this case is worth pinning.

## 13. Public test surface

| Helper / Fixture                    | File                                          |
| ----------------------------------- | --------------------------------------------- |
| `polyline / bezier / arc` factories | `src/lib/__tests__/entityOps.test.ts`         |
| Apollo fixtures                     | `src/io/__fixtures__/apollo/*`                |
| FSM stub                            | reused inside `src/hooks/__tests__/*.test.ts` |
| WorkerResponse collector pattern    | `src/core/workers/__tests__/*.test.ts`        |

## 14. Source map

```
src/lib/__tests__/                    ← pure-function units
src/core/__tests__/                   ← geometry / fsm / overlap units
src/core/workers/__tests__/           ← worker handlers
src/hooks/__tests__/                  ← hook closure regression
src/components/layout/panels/__tests__/  ← Inspector R1
src/io/__tests__/                     ← end-to-end round trip
src/io/__fixtures__/apollo/           ← Apollo .bin fixtures
scripts/check-bench-budget.mjs        ← perf gate
scripts/bench-budgets.json            ← per-bench thresholds
.github/workflows/ci.yml              ← CI entry point
```

## 15. See also

- [Build & Bundle](./build-and-bundle.md)
- [Worker Protocol](./worker-protocol.md)
- [Anti-corruption Layer](./anti-corruption-layer.md)
- [State Management](./state-management.md)
- ARCHITECTURE.md → "Quality gates"
