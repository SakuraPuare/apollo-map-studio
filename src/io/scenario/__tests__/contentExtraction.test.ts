import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseScenario } from '../parse';
import { detectScenarioFormat, isRecord } from '../detect';

/**
 * 内容提取测试（与 fidelity.test.ts 互补）。
 *
 * `fidelity.test.ts` 证明的是 **无损 round-trip**：parse→serialize 与原文逐字节相同。
 * 但因为 serialize 走 preserve-and-patch（从 `raw` 打补丁），即便 parse **一个障碍物
 * 都没提取出来**，round-trip 仍会通过。所以那个测试覆盖不到「内容是否被正确解析」。
 *
 * 本测试直接对真实语料 (~/.apollo/resources/scenario_sets) 做提取断言：
 * 解析出的障碍物/红绿灯数量必须与原始 JSON 里的源数量逐文件吻合，ego 必须填充。
 */

const SCENARIO_ROOT = join(homedir(), '.apollo', 'resources', 'scenario_sets');

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

/** 直接从原始 scenario JSON 数出「源障碍物」数量（不经解析器）。 */
function countSourceObstacles(raw: Record<string, unknown>): number {
  const scenario = isRecord(raw.scenario) ? raw.scenario : {};
  if ('agent' in scenario) {
    return Array.isArray(scenario.agent) ? scenario.agent.length : 0;
  }
  const entities = isRecord(scenario.entities) ? scenario.entities : {};
  return Array.isArray(entities.scenarioObjects) ? entities.scenarioObjects.length : 0;
}

/** 数源红绿灯数量（openscenario: roadNetwork.trafficLights / classic: scenario.trafficLights）。 */
function countSourceTrafficLights(raw: Record<string, unknown>): number {
  const scenario = isRecord(raw.scenario) ? raw.scenario : {};
  if (Array.isArray(scenario.trafficLights)) return scenario.trafficLights.length;
  const rn = isRecord(scenario.roadNetwork) ? scenario.roadNetwork : {};
  if (Array.isArray(rn.trafficLights)) return rn.trafficLights.length;
  return 0;
}

const hasFixtures = existsSync(SCENARIO_ROOT);
const describeIfFixtures = hasFixtures ? describe : describe.skip;

describeIfFixtures('scenario content extraction (real ~/.apollo files)', () => {
  const files = hasFixtures ? collectScenarioFiles(SCENARIO_ROOT) : [];

  type Parsed = {
    file: string;
    format: string;
    obParsed: number;
    obSource: number;
    tlParsed: number;
    tlSource: number;
    egoEmpty: boolean;
  };

  const parsedAll: Parsed[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      continue;
    }
    if (!isRecord(raw) || detectScenarioFormat(raw) === null) continue;
    const doc = parseScenario(raw);
    const e = doc.ego;
    parsedAll.push({
      file: file.replace(SCENARIO_ROOT, ''),
      format: doc.format,
      obParsed: doc.obstacles.length,
      obSource: countSourceObstacles(raw),
      tlParsed: doc.trafficLights.length,
      tlSource: countSourceTrafficLights(raw),
      egoEmpty: e.start.x === 0 && e.start.y === 0 && e.end.x === 0 && e.end.y === 0,
    });
  }

  it('finds a meaningful corpus of both formats', () => {
    expect(parsedAll.length).toBeGreaterThan(100);
    expect(parsedAll.some((p) => p.format === 'openscenario')).toBe(true);
    expect(parsedAll.some((p) => p.format === 'classic')).toBe(true);
  });

  it('extracts every source obstacle (no drops, no phantoms)', () => {
    const mismatches = parsedAll
      .filter((p) => p.obParsed !== p.obSource)
      .map((p) => `  ${p.file}: parsed ${p.obParsed} vs source ${p.obSource}`);
    if (mismatches.length > 0) {
      throw new Error(
        `${mismatches.length} scenarios mis-extracted obstacles:\n${mismatches.slice(0, 15).join('\n')}`,
      );
    }
    const totalOb = parsedAll.reduce((s, p) => s + p.obParsed, 0);
    expect(totalOb).toBeGreaterThan(1000);
  });

  it('extracts every source traffic light', () => {
    const mismatches = parsedAll
      .filter((p) => p.tlParsed !== p.tlSource)
      .map((p) => `  ${p.file}: parsed ${p.tlParsed} vs source ${p.tlSource}`);
    if (mismatches.length > 0) {
      throw new Error(
        `${mismatches.length} scenarios mis-extracted traffic lights:\n${mismatches.slice(0, 15).join('\n')}`,
      );
    }
  });

  it('populates ego start/end for every scenario', () => {
    const empties = parsedAll.filter((p) => p.egoEmpty).map((p) => `  ${p.file} [${p.format}]`);
    if (empties.length > 0) {
      throw new Error(
        `${empties.length} scenarios have all-zero ego:\n${empties.slice(0, 15).join('\n')}`,
      );
    }
  });

  it('produces obstacles whose coordinates are real UTM-like meters (not origin garbage)', () => {
    // 至少一份场景的障碍物坐标应落在合理 UTM 量级（|x|,|y| > 1000），
    // 证明 teleportAction/worldPosition 真被解出来了，而非默认 {0,0}。
    let sawRealCoord = false;
    for (const file of files) {
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, 'utf-8'));
      } catch {
        continue;
      }
      if (!isRecord(raw) || detectScenarioFormat(raw) === null) continue;
      const doc = parseScenario(raw);
      for (const ob of doc.obstacles) {
        if (Math.abs(ob.position.x) > 1000 && Math.abs(ob.position.y) > 1000) {
          sawRealCoord = true;
          break;
        }
      }
      if (sawRealCoord) break;
    }
    expect(sawRealCoord).toBe(true);
  });
});
