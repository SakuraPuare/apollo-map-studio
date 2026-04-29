/**
 * Tests for `reconcileLaneTopology` — coordinate-derived predecessor /
 * successor reconciliation. Fixtures keep coordinates as round numbers
 * so `toFixed(6)` keys match exactly.
 */
import { describe, it, expect } from 'vitest';
import { reconcileLaneTopology } from '../laneTopology';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

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

  it('preserves unrelated topology fields (junction, overlaps, neighbors)', () => {
    const a = laneAt('a', [0, 0], [1, 0], {
      junctionId: 'j-1',
      overlapIds: ['ov-9'],
      leftNeighborForwardIds: ['x'],
    });
    const b = laneAt('b', [1, 0], [2, 0]);
    const { changes } = reconcileLaneTopology(makeMap(a, b));

    const updatedA = changes.get('a') as LaneEntity;
    expect(updatedA.junctionId).toBe('j-1');
    expect(updatedA.overlapIds).toEqual(['ov-9']);
    expect(updatedA.leftNeighborForwardIds).toEqual(['x']);
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
});
