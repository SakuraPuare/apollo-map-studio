# Benchmark Budgets

CI guards performance regressions in core geometry / spatial primitives
by comparing measured `p99` latencies against hardcoded ceilings in
`scripts/bench-budgets.json`. The check is the last step of the
[`check` job](/reference/ci-pipeline#typecheck-test) on every push and
pull request.

## How the gate runs

```bash
pnpm bench --outputJson bench-results.json
node scripts/check-bench-budget.mjs bench-results.json
```

Vitest 4 emits its bench report under `--outputJson`. The script
recurses the JSON tree, extracts every `{ name, p99 }` leaf, and
compares it against the matching key in `bench-budgets.json`. The
comparison is **`p99Ms > ceiling` ⇒ fail** with exit code 1; everything
else passes (including unbudgeted benches, which print a "passthrough"
notice).

> p99 is in milliseconds. Vitest's bench-name lookup is **exact**: the
> bench label must match the budget key character-for-character. Renaming
> a `bench(...)` call requires the matching key swap in
> `bench-budgets.json` in the same commit.

## Current budgets

Source: `scripts/bench-budgets.json`.

| Bench label                                       | `p99Ms` ceiling | Suite                                                 |
| ------------------------------------------------- | --------------- | ----------------------------------------------------- |
| `10-point polyline, 3.5m offset`                  | 1               | `src/core/geometry/__tests__/offsetPolyline.bench.ts` |
| `100-point polyline, 3.5m offset`                 | 3               | `src/core/geometry/__tests__/offsetPolyline.bench.ts` |
| `1000-point polyline, 3.5m offset`                | 40              | `src/core/geometry/__tests__/offsetPolyline.bench.ts` |
| `full stitch — 10-lane linear chain`              | 3               | `src/core/geometry/__tests__/laneJunctions.bench.ts`  |
| `full stitch — 100-lane linear chain`             | 6               | `src/core/geometry/__tests__/laneJunctions.bench.ts`  |
| `full stitch — 100 lanes / 50 isolated junctions` | 6               | `src/core/geometry/__tests__/laneJunctions.bench.ts`  |
| `incremental — 100-lane chain, 1 lane decorated`  | 5               | `src/core/geometry/__tests__/laneJunctions.bench.ts`  |
| `incremental — 100-lane chain, 3 lanes decorated` | 5               | `src/core/geometry/__tests__/laneJunctions.bench.ts`  |

> Quoting `bench-budgets.json`'s own header note:
> _"Hardcoded p99 ceilings for core geometry / spatial primitives.
> Generous vs local mean to absorb GitHub Actions runner jitter (~1.5x).
> Tighten after N green runs give baseline confidence."_

## Latest local snapshot

These are the numbers from the committed `bench-results.json` (run on
the maintainer's workstation, not CI). They are kept as a sanity check
against the ceilings — if local `p99` already approaches the budget,
CI almost certainly trips.

### Lane-junction stitching

| Bench                                           | mean (ms) | p99 (ms) | ceiling |
| ----------------------------------------------- | --------- | -------- | ------- |
| full stitch — 10-lane linear chain              | 0.179     | 0.659    | 3       |
| full stitch — 100-lane linear chain             | 1.023     | 1.882    | 6       |
| full stitch — 100 lanes / 50 isolated junctions | 0.850     | 2.073    | 6       |
| incremental — 100-lane chain, 1 lane decorated  | 0.496     | 0.905    | 5       |
| incremental — 100-lane chain, 3 lanes decorated | 0.462     | 0.872    | 5       |

### Polyline offset

| Bench                            | mean (ms) | p99 (ms) | ceiling |
| -------------------------------- | --------- | -------- | ------- |
| 10-point polyline, 3.5m offset   | 0.0037    | 0.0094   | 1       |
| 100-point polyline, 3.5m offset  | 0.048     | 0.167    | 3       |
| 1000-point polyline, 3.5m offset | 0.477     | 1.255    | 40      |

### Overlap reconcile (unbudgeted, passthrough)

These benches run but have no ceiling. They print a passthrough notice;
they exist to track trends until baselines are stable enough to budget.

| Suite                            | Bench                                  | mean (ms) | p99 (ms) |
| -------------------------------- | -------------------------------------- | --------- | -------- |
| reconcile @ 5k (6000 entities)   | full mode (cold)                       | 34.76     | 47.34    |
| reconcile @ 5k (6000 entities)   | incremental (1 dirty lane, warm index) | 0.479     | 1.235    |
| reconcile @ 5k (6000 entities)   | syncDirty (1 dirty)                    | 0.00066   | 0.00119  |
| reconcile @ 10k (12000 entities) | full mode (cold)                       | 75.09     | 79.39    |
| reconcile @ 10k (12000 entities) | incremental (1 dirty lane, warm index) | 0.855     | 1.657    |
| reconcile @ 10k (12000 entities) | syncDirty (1 dirty)                    | 0.00056   | 0.0012   |
| reconcile @ 25k (30000 entities) | full mode (cold)                       | 277.46    | 301.15   |
| reconcile @ 25k (30000 entities) | incremental (1 dirty lane, warm index) | 3.232     | 4.146    |
| reconcile @ 25k (30000 entities) | syncDirty (1 dirty)                    | 0.00069   | 0.00117  |

Headroom is comfortable across all budgeted benches — the tightest
ratio is `incremental — 100-lane chain, 1 lane decorated` at
~5.5× under ceiling. The CI safety factor is intentional: GitHub
Actions Linux runners commonly run ~1.5× slower than developer
hardware and exhibit additional p99 jitter from neighbour processes.

## How `check-bench-budget.mjs` works

```js
// scripts/check-bench-budget.mjs (algorithm)
const budgets = JSON.parse(readFileSync('scripts/bench-budgets.json')).budgets;
const benches = collectBenches(JSON.parse(readFileSync(reportPath)));

for (const bench of benches) {
  const budget = budgets[bench.name];
  if (!budget) {
    unbudgeted.push(bench); // pass with a passthrough notice
    continue;
  }
  if (bench.p99Ms > budget.p99Ms) {
    violations.push({ ...bench, ceilingMs: budget.p99Ms });
    hadViolations = true;
  } else {
    passed.push({ ...bench, ceilingMs: budget.p99Ms });
  }
}
process.exit(hadViolations ? 1 : 0);
```

Walking is generic — `collectBenches()` recurses the JSON tree and
collects every `{ name: string, p99: number }` leaf, so future Vitest
JSON shape changes still find the data.

### Output format

```
## Perf budget report

PASS:
  full stitch — 10-lane linear chain: p99=0.659ms (ceiling 3ms)
  ...

No budget defined (passthrough):
  full mode (cold): p99=47.337ms

FAIL:
  1000-point polyline, 3.5m offset: p99=42.108ms EXCEEDED ceiling 40ms
```

A non-zero exit on any FAIL row turns CI red.

## Updating budgets

1. **Tightening.** When a known optimisation lands, drop the ceiling
   for affected benches in the same PR. Aim for 1.5–2× over local p99
   so CI jitter doesn't false-fail.
2. **Loosening.** Avoid bumping ceilings to make red CI green — that
   defeats the gate. Instead, fix the regression. If a deliberate
   tradeoff justifies the looser budget (e.g. trading p99 for p50),
   document the decision in the PR description and update both the
   ceiling and any comments referencing the previous ratio.
3. **Adding a new bench.** Land the bench unbudgeted first; let the
   passthrough notice run on CI for a handful of commits to gather
   baseline data; then add the ceiling in a follow-up.
4. **Removing a bench.** Delete both the `bench(...)` call and the
   matching `bench-budgets.json` key in the same commit.

## See also

- CI pipeline overview: [CI Pipeline](/reference/ci-pipeline)
- Cold-layer pipeline (the bench subjects): [Architecture overview](/architecture/overview)
- Bench source files:
  - `src/core/geometry/__tests__/laneJunctions.bench.ts`
  - `src/core/geometry/__tests__/offsetPolyline.bench.ts`
  - `src/core/elements/overlap/__tests__/overlap.bench.ts`
