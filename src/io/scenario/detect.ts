import type { ScenarioFormat } from '@/types/scenario';

/**
 * 判别一份场景 JSON 的格式。
 *
 * - `openscenario`：`scenario` 含 `storyboard`（ASAM OpenSCENARIO 风格，
 *   590/612 真实文件）。
 * - `classic`：`scenario` 含 `agent[]` 或没有 storyboard 但有 start/end
 *   （旧 agent/trackedPoint 风格，17/612）。
 *
 * 4/612 是“最小”文件（既无 storyboard 也无 agent）——按 openscenario 处理，
 * 因为它们的 `scenario` 仍带 entities/autoCarInfo 等新结构骨架。
 */
export function detectScenarioFormat(doc: unknown): ScenarioFormat | null {
  if (!isRecord(doc)) return null;
  const scenario = doc.scenario;
  if (!isRecord(scenario)) return null;

  if ('storyboard' in scenario) return 'openscenario';
  if ('agent' in scenario) return 'classic';
  // 含 roadNetwork/entities/autoCarInfo 的新骨架（无 storyboard）也归 openscenario
  if ('roadNetwork' in scenario || 'entities' in scenario || 'autoCarInfo' in scenario) {
    return 'openscenario';
  }
  // 仅有 start/end/mapDir 的极简旧场景
  if ('start' in scenario && ('end' in scenario || 'mapDir' in scenario)) return 'classic';
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 结构化深拷贝（codec 基线）。优先用 structuredClone，回退 JSON。 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 安全取数字。 */
export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 安全取字符串。 */
export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
