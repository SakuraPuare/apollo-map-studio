import type { ScenarioDoc } from '@/types/scenario';
import { isRecord } from './detect';

function asRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return isRecord(parent[key]) ? (parent[key] as Record<string, unknown>) : null;
}

export function patchMetaOpenScenario(scenario: Record<string, unknown>, doc: ScenarioDoc): void {
  const rn = asRecord(scenario, 'roadNetwork');
  const lf = rn && asRecord(rn, 'logicFile');
  if (lf && 'filepath' in lf && doc.meta.mapDir !== undefined) lf.filepath = doc.meta.mapDir;

  const simTime = doc.meta.simulatorTime;
  if (simTime === undefined) return;
  const sb = asRecord(scenario, 'storyboard');
  const stop = sb && asRecord(sb, 'stopTrigger');
  const groups = stop && Array.isArray(stop.conditionGroups) ? stop.conditionGroups : [];
  for (const group of groups) {
    if (patchSimulationTimeCondition(group, simTime)) return;
  }
}

export function patchMetaClassic(scenario: Record<string, unknown>, doc: ScenarioDoc): void {
  if ('mapDir' in scenario && doc.meta.mapDir !== undefined) scenario.mapDir = doc.meta.mapDir;
  if ('simulatorTime' in scenario && doc.meta.simulatorTime !== undefined) {
    scenario.simulatorTime = doc.meta.simulatorTime;
  }
}

function patchSimulationTimeCondition(group: unknown, simTime: number): boolean {
  if (!isRecord(group) || !Array.isArray(group.conditions)) return false;
  for (const condition of group.conditions) {
    const bvc = isRecord(condition) && asRecord(condition, 'byValueCondition');
    const stc = bvc && asRecord(bvc, 'simulationTimeCondition');
    if (!stc || !('value' in stc)) continue;
    stc.value = simTime;
    return true;
  }
  return false;
}
