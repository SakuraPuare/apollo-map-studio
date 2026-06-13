/**
 * Tests for `reconcileLaneTopology` — coordinate-derived predecessor /
 * successor reconciliation. Fixtures keep coordinates as round numbers
 * so `toFixed(6)` keys match exactly.
 */
import { describe, it, expect } from 'vitest';
import { reconcileLaneTopology, reconcileLaneTopologyIncremental } from '../laneTopology';
import type { JunctionEntity, LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

function junctionAt(id: string, ring: [number, number][]): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points: ring.map(([x, y]) => ({ x, y })) },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

function makeMapMixed(...entities: MapEntity[]): Map<string, MapEntity> {
  const m = new Map<string, MapEntity>();
  for (const e of entities) m.set(e.id, e);
  return m;
}

function laneAt(
  id: string,
  start: [number, number],
  end: [number, number],
  overrides: Partial<LaneEntity> = {},
): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: {
            points: [
              { x: start[0], y: start[1] },
              { x: end[0], y: end[1] },
            ],
          },
          s: 0,
          startPosition: { x: start[0], y: start[1] },
          heading: 0,
          length: 0,
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 0,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
    ...overrides,
  };
}

function makeMap(...lanes: LaneEntity[]): Map<string, MapEntity> {
  const m = new Map<string, MapEntity>();
  for (const l of lanes) m.set(l.id, l);
  return m;
}

describe('reconcileLaneTopology', () => {
  it('chains A→B when A.end == B.start', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1, 0], [2, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    expect(changes.size).toBe(2);
    const updatedA = changes.get('a') as LaneEntity;
    const updatedB = changes.get('b') as LaneEntity;
    expect(updatedA.successorIds).toEqual(['b']);
    expect(updatedA.predecessorIds).toEqual([]);
    expect(updatedB.predecessorIds).toEqual(['a']);
    expect(updatedB.successorIds).toEqual([]);
  });

  it('does not connect when only START-START shared (fork case)', () => {
    // Two lanes diverging from same point — handled by junctions, not pred/succ.
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [0, 0], [-1, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    // Both lanes start at empty pred/succ — already empty defaults — no diff.
    expect(changes.size).toBe(0);
  });

  it('does not connect when only END-END shared (merge case)', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [2, 0], [1, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    expect(changes.size).toBe(0);
  });

  it('handles multi-fan: A → {B, C}', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1, 0], [2, 0]);
    const c = laneAt('c', [1, 0], [1, 1]);
    const { changes } = reconcileLaneTopology(makeMap(a, b, c));

    const updatedA = changes.get('a') as LaneEntity;
    expect(updatedA.successorIds.sort()).toEqual(['b', 'c']);

    const updatedB = changes.get('b') as LaneEntity;
    const updatedC = changes.get('c') as LaneEntity;
    expect(updatedB.predecessorIds).toEqual(['a']);
    expect(updatedC.predecessorIds).toEqual(['a']);
  });

  it('returns no changes when topology is already correct', () => {
    const a = laneAt('a', [0, 0], [1, 0], { successorIds: ['b'] });
    const b = laneAt('b', [1, 0], [2, 0], { predecessorIds: ['a'] });
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    expect(changes.size).toBe(0);
  });

  it('strips stale predecessor/successor when geometry no longer matches', () => {
    // Lane B used to follow A; now B has been moved away — topology must drop.
    const a = laneAt('a', [0, 0], [1, 0], { successorIds: ['b'] });
    const b = laneAt('b', [5, 5], [6, 5], { predecessorIds: ['a'] });
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    const updatedA = changes.get('a') as LaneEntity;
    const updatedB = changes.get('b') as LaneEntity;
    expect(updatedA.successorIds).toEqual([]);
    expect(updatedB.predecessorIds).toEqual([]);
  });

  it('does not self-link a circular lane (END coincident with START)', () => {
    const a = laneAt('a', [0, 0], [0, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a));
    expect(changes.size).toBe(0);
  });

  it('preserves overlapIds (not derived) but rebuilds junctionId/neighbors from geometry', () => {
    // junction j-1 doesn't exist in the map → junctionId derived to null.
    // Stale neighbor pointer to 'x' (no such lane) → cleared by re-derivation.
    // overlapIds is not a derived field → preserved as-is.
    const a = laneAt('a', [0, 0], [1, 0], {
      junctionId: 'j-1',
      overlapIds: ['ov-9'],
      leftNeighborForwardIds: ['x'],
    });
    const b = laneAt('b', [1, 0], [2, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    const updatedA = changes.get('a') as LaneEntity;
    expect(updatedA.junctionId).toBeNull();
    expect(updatedA.leftNeighborForwardIds).toEqual([]);
    expect(updatedA.overlapIds).toEqual(['ov-9']);
  });

  // ── selfReverse ──

  it('detects self-reverse twins (B.start == A.end and B.end == A.start)', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1, 0], [0, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    expect((changes.get('a') as LaneEntity).selfReverseLaneIds).toEqual(['b']);
    expect((changes.get('b') as LaneEntity).selfReverseLaneIds).toEqual(['a']);
  });

  it('does not flag a fork as self-reverse (only START shared)', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [0, 0], [-1, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    // No changes expected: pred/succ stay empty, selfReverse stays empty.
    expect(changes.size).toBe(0);
  });

  // ── junctionId ──

  it('assigns junctionId when both endpoints lie inside the junction polygon', () => {
    const a = laneAt('a', [0.1, 0.1], [0.5, 0.5]);
    const j = junctionAt('j1', [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const { changes } = reconcileLaneTopology(makeMapMixed(a, j));
    expect((changes.get('a') as LaneEntity).junctionId).toBe('j1');
  });

  it('assigns junctionId when lane crosses the polygon boundary (centerline-intersect rule)', () => {
    // start inside (0.5, 0.5), end outside (2, 0.5). Apollo overlap pipeline
    // emits an Overlap{lane,junction}; junctionId must agree (centerline hits polygon).
    const a = laneAt('a', [0.5, 0.5], [2, 0.5]);
    const j = junctionAt('j1', [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const { changes } = reconcileLaneTopology(makeMapMixed(a, j));
    expect((changes.get('a') as LaneEntity).junctionId).toBe('j1');
  });

  it('assigns junctionId when lane fully traverses the polygon (both endpoints outside)', () => {
    // Through-lane: enters one edge and exits the other; both endpoints out.
    const a = laneAt('a', [-1, 0.5], [2, 0.5]);
    const j = junctionAt('j1', [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const { changes } = reconcileLaneTopology(makeMapMixed(a, j));
    expect((changes.get('a') as LaneEntity).junctionId).toBe('j1');
  });

  it('leaves junctionId null when lane is entirely outside the polygon', () => {
    // both endpoints outside, no segment crosses polygon edges.
    const a = laneAt('a', [2, 2], [3, 2]);
    const j = junctionAt('j1', [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const { changes } = reconcileLaneTopology(makeMapMixed(a, j));
    const updated = (changes.get('a') as LaneEntity | undefined) ?? a;
    expect(updated.junctionId).toBeNull();
  });

  it('drops stale junctionId when no junction polygon contains the lane', () => {
    const a = laneAt('a', [10, 10], [11, 10], { junctionId: 'j-stale' });
    const { changes } = reconcileLaneTopology(makeMap(a));
    expect((changes.get('a') as LaneEntity).junctionId).toBeNull();
  });

  // ── neighbors (forward) ──

  it('classifies a parallel lane offset to the left as leftNeighborForward (and the inverse as rightNeighborForward)', () => {
    // Lane direction is east; ~3.34 m apart laterally (3e-5° ≈ 3.34 m at equator).
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0, 0.00003], [0.001, 0.00003]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    const updatedA = changes.get('a') as LaneEntity;
    const updatedB = changes.get('b') as LaneEntity;
    expect(updatedA.leftNeighborForwardIds).toEqual(['b']);
    expect(updatedA.rightNeighborForwardIds).toEqual([]);
    expect(updatedB.rightNeighborForwardIds).toEqual(['a']);
    expect(updatedB.leftNeighborForwardIds).toEqual([]);
  });

  it('rejects neighbors that are too far apart laterally (> 8 m)', () => {
    // ~11 m apart (1e-4°) — outside [1, 8] m range.
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0, 0.0001], [0.001, 0.0001]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    // No topology field changes for either lane (defaults are all empty).
    expect(changes.size).toBe(0);
  });

  it('detects neighbors when endpoints do NOT align (hand-drawn case, ≥50% overlap)', () => {
    // A is 30 m east-bound. B is reverse, ~3.5 m south, and its endpoints
    // are intentionally offset ~3 m at start and ~2 m at end relative to A —
    // simulating freehand drawing without snap. Old strict-endpoint algo
    // rejected this; overlap-based algo must accept it.
    const m_per_lng = 111319.5 * Math.cos((39 * Math.PI) / 180);
    const aStart: [number, number] = [116.0, 39.0];
    const aEnd: [number, number] = [116.0 + 30 / m_per_lng, 39.0];
    const lateralLat = 3.5 / 111319.5;
    const bStart: [number, number] = [aEnd[0] - 3 / m_per_lng, 39.0 - lateralLat];
    const bEnd: [number, number] = [aStart[0] - 2 / m_per_lng, 39.0 - lateralLat];

    const a = laneAt('a', aStart, aEnd);
    const b = laneAt('b', bStart, bEnd);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    expect((changes.get('a') as LaneEntity).rightNeighborReverseIds).toEqual(['b']);
    expect((changes.get('b') as LaneEntity).rightNeighborReverseIds).toEqual(['a']);
  });

  it('rejects neighbors when longitudinal overlap < 50% (lanes barely touch)', () => {
    // A spans [0, 30]m, B parallel ~3.5 m south spans [25, 55]m → overlap 5 m
    // out of 30 m short-lane = 16.7% → under 50% → not neighbors.
    const m_per_lng = 111319.5 * Math.cos((39 * Math.PI) / 180);
    const aStart: [number, number] = [116.0, 39.0];
    const aEnd: [number, number] = [116.0 + 30 / m_per_lng, 39.0];
    const lateralLat = 3.5 / 111319.5;
    const bStart: [number, number] = [116.0 + 25 / m_per_lng, 39.0 + lateralLat];
    const bEnd: [number, number] = [116.0 + 55 / m_per_lng, 39.0 + lateralLat];

    const a = laneAt('a', aStart, aEnd);
    const b = laneAt('b', bStart, bEnd);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    expect(changes.size).toBe(0);
  });

  it('rejects neighbors that are too close laterally (< 1 m, treated as overlap)', () => {
    // ~0.55 m apart (5e-6°) — too close, not adjacent neighbors.
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0, 0.000005], [0.001, 0.000005]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    expect(changes.size).toBe(0);
  });

  it('does not classify non-parallel lanes as neighbors', () => {
    // 45° angle between A and B, B starts laterally adjacent to A.start.
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0, 0.00003], [0.001, 0.001]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    // B is not parallel; must not appear in any neighbor list.
    expect(changes.size).toBe(0);
  });

  // ── neighbors (reverse) ──

  it('classifies a counter-direction parallel lane as L/R reverse neighbor', () => {
    // A points east, B points west, B north of A → both see each other on the LEFT.
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.001, 0.00003], [0, 0.00003]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    const updatedA = changes.get('a') as LaneEntity;
    const updatedB = changes.get('b') as LaneEntity;
    expect(updatedA.leftNeighborReverseIds).toEqual(['b']);
    expect(updatedA.rightNeighborReverseIds).toEqual([]);
    expect(updatedB.leftNeighborReverseIds).toEqual(['a']);
    expect(updatedB.rightNeighborReverseIds).toEqual([]);
  });

  it('counter-direction lane south of A → both see each other on the RIGHT (reverse)', () => {
    const a = laneAt('a', [0, 0], [0.001, 0]);
    const b = laneAt('b', [0.001, -0.00003], [0, -0.00003]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    expect((changes.get('a') as LaneEntity).rightNeighborReverseIds).toEqual(['b']);
    expect((changes.get('b') as LaneEntity).rightNeighborReverseIds).toEqual(['a']);
  });

  it('chains 3 lanes A→B→C correctly', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1, 0], [2, 0]);
    const c = laneAt('c', [2, 0], [3, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b, c));

    expect((changes.get('a') as LaneEntity).successorIds).toEqual(['b']);
    expect((changes.get('b') as LaneEntity).predecessorIds).toEqual(['a']);
    expect((changes.get('b') as LaneEntity).successorIds).toEqual(['c']);
    expect((changes.get('c') as LaneEntity).predecessorIds).toEqual(['b']);
  });

  it('uses 1cm precision (toFixed(6)) — sub-cm drift snaps together', () => {
    // 0.0000001 ≈ 1mm in lng — rounds to same 6-decimal key.
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1.0000001, 0], [2, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    expect((changes.get('a') as LaneEntity).successorIds).toEqual(['b']);
  });

  it('does not connect when drift > 1cm (different keys)', () => {
    // 0.00001° ≈ 1.1m at equator — well past the 1cm key precision.
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1.00001, 0], [2, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));
    expect(changes.size).toBe(0);
  });

  it('incremental reconciliation returns no changes when no ids are dirty', () => {
    const a = laneAt('a', [0, 0], [1, 0]);
    const b = laneAt('b', [1, 0], [2, 0]);

    const { changes } = reconcileLaneTopologyIncremental(makeMap(a, b), {
      dirtyIds: new Set(),
    });

    expect(changes.size).toBe(0);
  });

  it('incremental reconciliation uses previous geometry to clear stale peers after a lane moves', () => {
    const previousA = laneAt('a', [0, 0], [1, 0], { successorIds: ['b'] });
    const previousB = laneAt('b', [1, 0], [2, 0], { predecessorIds: ['a'] });
    const movedA = laneAt('a', [5, 0], [6, 0], { successorIds: ['b'] });
    const staleB = laneAt('b', [1, 0], [2, 0], { predecessorIds: ['a'] });

    const { changes } = reconcileLaneTopologyIncremental(makeMap(movedA, staleB), {
      dirtyIds: new Set(['a']),
      previousEntities: makeMap(previousA, previousB),
    });

    expect((changes.get('a') as LaneEntity).successorIds).toEqual([]);
    expect((changes.get('b') as LaneEntity).predecessorIds).toEqual([]);
  });
});
