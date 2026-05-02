# Testing Strategy

Apollo Map Studio uses Vitest for unit tests, integration-style IO tests and
benchmarks.

## Commands

```bash
pnpm test
pnpm bench
pnpm typecheck
pnpm lint
pnpm docs:build
```

Bench budgets are checked by `scripts/check-bench-budget.mjs` against
`scripts/bench-budgets.json`.

## Test Areas

- `src/core/geometry/__tests__`: lane geometry, topology, snapping, validation
  and Apollo compile helpers.
- `src/core/workers/__tests__`: spatial worker and lane junction graph.
- `src/hooks/__tests__`: map event routing, cold/hot/overlay layers, cursor,
  drag pan and undo cancellation.
- `src/store/__tests__`: map store, UI store and settings store.
- `src/io/proto/__tests__`: projection, bin/text round trip, entity bridge,
  fidelity and performance.
- `src/io/__tests__/endToEnd.test.ts`: full Apollo IO pipeline.

## Documentation Gate

`pnpm docs:build` is the source of truth for VitePress link validity. Dead
links fail the build and should be fixed rather than hidden with
`ignoreDeadLinks`.
