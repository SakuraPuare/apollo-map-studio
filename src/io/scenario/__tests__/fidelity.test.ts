import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';
import { detectScenarioFormat } from '../detect';

const SCENARIO_ROOT = join(homedir(), '.apollo', 'resources', 'scenario_sets');

/** 递归收集所有真实场景 JSON（排除 emacs 备份 .~N~ 与 schema/空文件）。 */
function collectScenarioFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (
        name.endsWith('.json') &&
        !name.includes('~') &&
        name !== 'CombinedSchema.json' &&
        st.size > 0
      ) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

const hasFixtures = existsSync(SCENARIO_ROOT);
const describeIfFixtures = hasFixtures ? describe : describe.skip;

describeIfFixtures('scenario codec round-trip fidelity (real ~/.apollo files)', () => {
  const files = hasFixtures ? collectScenarioFiles(SCENARIO_ROOT) : [];

  it('finds a meaningful corpus', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('parses + serializes every scenario byte-for-byte identically', () => {
    const failures: { file: string; reason: string }[] = [];
    let parsed = 0;

    for (const file of files) {
      let original: unknown;
      try {
        original = JSON.parse(readFileSync(file, 'utf-8'));
      } catch {
        continue; // not valid JSON — skip (schema files etc.)
      }
      // skip scenario_set.json (set manifest, not a scenario) and schema docs
      if (detectScenarioFormat(original) === null) continue;
      parsed++;

      try {
        const doc = parseScenario(original);
        const out = serializeScenario(doc);
        expect(out).toEqual(original);
      } catch (err) {
        failures.push({
          file: file.replace(SCENARIO_ROOT, ''),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 10).map((f) => `  ${f.file}: ${f.reason}`);
      throw new Error(
        `${failures.length}/${parsed} scenarios failed round-trip:\n${sample.join('\n')}`,
      );
    }
    expect(parsed).toBeGreaterThan(100);
  });
});
