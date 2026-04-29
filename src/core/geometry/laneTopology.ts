/**
 * Lane topology reconciliation — pure function.
 *
 * 底层逻辑：
 *   两条 lane 的端点共享同一坐标即视为相连（snap 后自然成立）。
 *   方向语义：
 *     - lane A 的 END 与 lane B 的 START 重合 →
 *         A.successorIds 包含 B; B.predecessorIds 包含 A
 *     - 端点 vs 端点 同向（START-START / END-END）→ 不构成 pred/succ 关系
 *       （一般是 fork / merge，需要 junction 表达，不在 pred/succ 范畴内）
 *
 * 颗粒度：
 *   每次写入 lane 后整体重算（O(N)）。1000 lane 量级 < 1ms，
 *   不构建持久索引以避开"陈旧索引"问题。
 *
 * 抓手对齐：
 *   坐标精度 1e-6（≈ 0.1m），与 applyLaneJunctions 渲染端 trim 用的精度一致，
 *   保证拓扑判定与几何 trim 不会出现"渲染粘了但拓扑没接上"的不闭环情况。
 */
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

/** 与 applyLaneJunctions 渲染端的 toFixed(6) 相同 → 1cm 量级。 */
const COORD_KEY_PRECISION = 6;

interface Endpoint {
  laneId: string;
  isStart: boolean;
  /** 投影前的原始 lng/lat（用于 hash key 一致性） */
  x: number;
  y: number;
}

function endpointKey(x: number, y: number): string {
  return `${x.toFixed(COORD_KEY_PRECISION)},${y.toFixed(COORD_KEY_PRECISION)}`;
}

function laneStart(lane: LaneEntity): { x: number; y: number } | null {
  const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
  return pts[0] ?? null;
}

function laneEnd(lane: LaneEntity): { x: number; y: number } | null {
  const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
  return pts[pts.length - 1] ?? null;
}

/** 数组相等（忽略顺序、去重比较），用于判定是否需要写回。 */
function setEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const id of b) if (!sa.has(id)) return false;
  return sa.size === b.length;
}

export interface LaneTopologyDiff {
  /** Map<laneId, updated lane>; 仅包含 pred/succ 实际变化的 lane。 */
  changes: Map<string, LaneEntity>;
}

/**
 * 扫描所有 lane，根据中心线起终点共享坐标重算 predecessor/successor。
 *
 * - 不修改 leftNeighborForwardIds / rightNeighborForwardIds / leftNeighborReverseIds
 *   / rightNeighborReverseIds / selfReverseLaneIds / junctionId / overlapIds
 *   — 它们语义不同（neighbor 是横向，pred/succ 是纵向；junction 是几何归属；
 *   overlap 是冲突区域），各自由自己的抓手维护。
 * - 输出仅包含真正发生变化的 lane（避免无意义 store churn）。
 */
export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff {
  // 1. 收集所有 lane endpoint。
  const lanes: LaneEntity[] = [];
  const startEndpoints: Endpoint[] = [];
  const endEndpoints: Endpoint[] = [];

  for (const e of entities.values()) {
    if (e.entityType !== 'lane') continue;
    const lane = e as LaneEntity;
    const s = laneStart(lane);
    const t = laneEnd(lane);
    if (!s || !t) continue;
    lanes.push(lane);
    startEndpoints.push({ laneId: lane.id, isStart: true, x: s.x, y: s.y });
    endEndpoints.push({ laneId: lane.id, isStart: false, x: t.x, y: t.y });
  }

  // 2. 建立坐标 → endpoint 倒排索引。
  const startsByKey = new Map<string, Endpoint[]>();
  const endsByKey = new Map<string, Endpoint[]>();
  for (const ep of startEndpoints) {
    const k = endpointKey(ep.x, ep.y);
    const list = startsByKey.get(k);
    if (list) list.push(ep);
    else startsByKey.set(k, [ep]);
  }
  for (const ep of endEndpoints) {
    const k = endpointKey(ep.x, ep.y);
    const list = endsByKey.get(k);
    if (list) list.push(ep);
    else endsByKey.set(k, [ep]);
  }

  // 3. 对每条 lane 推导 pred / succ。
  const changes = new Map<string, LaneEntity>();
  for (const lane of lanes) {
    const s = laneStart(lane)!;
    const t = laneEnd(lane)!;

    // predecessor: 任何 lane 的 END 落在我的 START 上，且不是我自己
    const predKey = endpointKey(s.x, s.y);
    const predHits = (endsByKey.get(predKey) ?? []).filter((ep) => ep.laneId !== lane.id);
    const newPredecessors = predHits.map((ep) => ep.laneId);

    // successor: 任何 lane 的 START 落在我的 END 上，且不是我自己
    const succKey = endpointKey(t.x, t.y);
    const succHits = (startsByKey.get(succKey) ?? []).filter((ep) => ep.laneId !== lane.id);
    const newSuccessors = succHits.map((ep) => ep.laneId);

    // 去重（一对 lane 多次共享端点不可能但防御一下）
    const dedupPred = Array.from(new Set(newPredecessors));
    const dedupSucc = Array.from(new Set(newSuccessors));

    if (!setEqual(lane.predecessorIds, dedupPred) || !setEqual(lane.successorIds, dedupSucc)) {
      changes.set(lane.id, {
        ...lane,
        predecessorIds: dedupPred,
        successorIds: dedupSucc,
      });
    }
  }

  return { changes };
}
