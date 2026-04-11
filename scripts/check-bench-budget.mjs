#!/usr/bin/env node
/**
 * check-bench-budget — CI perf regression guard.
 *
 * Reads vitest bench JSON output (file path arg) and compares each
 * benchmark's p99 against the ceilings in `bench-budgets.json`.
 * Exits 1 on any budget violation with a human-readable report.
 * Unknown bench names pass through (not-yet-budgeted).
 *
 * Usage:
 *   pnpm bench --reporter=json --outputFile=bench.json
 *   node scripts/check-bench-budget.mjs bench.json
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const budgetsPath = join(__dirname, 'bench-budgets.json');

function loadBudgets() {
  const raw = readFileSync(budgetsPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.budgets ?? {};
}

/**
 * Walk the vitest bench json tree and collect every { name, p99 } leaf.
 * Vitest 4's `--outputJson` shape:
 *   { files: [{ groups: [{ benchmarks: [{ name, p99, ... }] }] }] }
 * p99 is in milliseconds. We recurse generically so future nesting changes
 * still find leaves.
 */
function collectBenches(report) {
  const benches = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.name === 'string' && typeof node.p99 === 'number') {
      benches.push({ name: node.name, p99Ms: node.p99 });
    }
    for (const key of Object.keys(node)) visit(node[key]);
  };
  visit(report);
  return benches;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: check-bench-budget.mjs <bench-report.json>');
    process.exit(2);
  }

  const report = JSON.parse(readFileSync(filePath, 'utf8'));
  const budgets = loadBudgets();
  const benches = collectBenches(report);

  let hadViolations = false;
  const passed = [];
  const violations = [];
  const unbudgeted = [];

  for (const bench of benches) {
    const budget = budgets[bench.name];
    if (!budget) {
      unbudgeted.push(bench);
      continue;
    }
    const ceiling = budget.p99Ms;
    if (bench.p99Ms > ceiling) {
      violations.push({ ...bench, ceilingMs: ceiling });
      hadViolations = true;
    } else {
      passed.push({ ...bench, ceilingMs: ceiling });
    }
  }

  console.log('## Perf budget report');
  if (passed.length > 0) {
    console.log('\nPASS:');
    for (const p of passed) {
      console.log(`  ${p.name}: p99=${p.p99Ms.toFixed(3)}ms (ceiling ${p.ceilingMs}ms)`);
    }
  }
  if (unbudgeted.length > 0) {
    console.log('\nNo budget defined (passthrough):');
    for (const u of unbudgeted) {
      console.log(`  ${u.name}: p99=${u.p99Ms.toFixed(3)}ms`);
    }
  }
  if (violations.length > 0) {
    console.log('\nFAIL:');
    for (const v of violations) {
      console.log(`  ${v.name}: p99=${v.p99Ms.toFixed(3)}ms EXCEEDED ceiling ${v.ceilingMs}ms`);
    }
  }

  process.exit(hadViolations ? 1 : 0);
}

main();
