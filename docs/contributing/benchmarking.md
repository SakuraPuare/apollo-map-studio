# Benchmarking

Benchmarks use Vitest bench files and script-level budget checks.

## Commands

```bash
pnpm bench
node scripts/check-bench-budget.mjs
```

Budgets live in `scripts/bench-budgets.json`.

## Current Bench Areas

- lane junction derivation;
- offset polyline geometry;
- map-data import/export performance tests.
