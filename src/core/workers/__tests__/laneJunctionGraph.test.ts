import { describe, it, expect } from 'vitest';
import type { LaneEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { endpointKeyOf, laneEndpointKeys, LaneJunctionGraph } from '../laneJunctionGraph';

function makeLane(id: string, points: GeoPoint[]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: { points },
        },
      ],
    },
    leftSamples: [],
    rightSamples: [],
    leftBoundary: { boundaryType: [] },
    rightBoundary: { boundaryType: [] },
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 13.9,
    length: 0,
    predecessorIds: [],
    successorIds: [],
    junctionId: null,
  } as unknown as LaneEntity;
}

describe('endpointKeyOf', () => {
  it('quantizes to 6 decimal places', () => {
    expect(endpointKeyOf({ x: 116.123456789, y: 30.987654321 })).toBe('116.123457,30.987654');
  });

  it('treats coincident points as the same key after rounding', () => {
    const a = endpointKeyOf({ x: 116.0000001, y: 30.0000001 });
    const b = endpointKeyOf({ x: 116.0000003, y: 30.0000004 });
    expect(a).toBe(b);
  });

  it('separates points beyond the rounding tolerance', () => {
    const a = endpointKeyOf({ x: 116.0, y: 30.0 });
    const b = endpointKeyOf({ x: 116.000001, y: 30.0 });
    expect(a).not.toBe(b);
  });
});

describe('laneEndpointKeys', () => {
  it('returns start + end for a 2-point centerline', () => {
    const lane = makeLane('a', [
      { x: 116.0, y: 30.0 },
      { x: 116.001, y: 30.0 },
    ]);
    expect(laneEndpointKeys(lane)).toEqual(['116.000000,30.000000', '116.001000,30.000000']);
  });

  it('returns first and last point for a multi-point centerline', () => {
    const lane = makeLane('a', [
      { x: 116.0, y: 30.0 },
      { x: 116.0005, y: 30.0001 },
      { x: 116.001, y: 30.0 },
    ]);
    expect(laneEndpointKeys(lane)).toEqual(['116.000000,30.000000', '116.001000,30.000000']);
  });

  it('returns null for a degenerate (single-point) centerline', () => {
    const lane = makeLane('a', [{ x: 116.0, y: 30.0 }]);
    expect(laneEndpointKeys(lane)).toBeNull();
  });

  it('returns null for an empty centerline', () => {
    const lane = makeLane('a', []);
    expect(laneEndpointKeys(lane)).toBeNull();
  });
});

describe('LaneJunctionGraph', () => {
  it('starts empty', () => {
    const g = new LaneJunctionGraph();
    expect(g.size()).toBe(0);
    expect(g.getDependents('a').size).toBe(0);
    expect(g.has('a')).toBe(false);
  });

  it('addLane registers both endpoints', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['k1', 'k2']);
    expect(g.size()).toBe(1);
    expect(g.has('a')).toBe(true);
  });

  it('two lanes sharing an endpoint are mutual dependents', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('b', ['p2', 'p3']);
    expect(g.getDependents('a')).toEqual(new Set(['b']));
    expect(g.getDependents('b')).toEqual(new Set(['a']));
  });

  it('three lanes meeting at one endpoint form a 3-clique', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('b', ['p2', 'p3']);
    g.addLane('c', ['p2', 'p4']);
    expect(g.getDependents('a')).toEqual(new Set(['b', 'c']));
    expect(g.getDependents('b')).toEqual(new Set(['a', 'c']));
    expect(g.getDependents('c')).toEqual(new Set(['a', 'b']));
  });

  it('linear chain of 4 lanes — each lane sees only its immediate neighbors', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('b', ['p2', 'p3']);
    g.addLane('c', ['p3', 'p4']);
    g.addLane('d', ['p4', 'p5']);
    expect(g.getDependents('a')).toEqual(new Set(['b']));
    expect(g.getDependents('b')).toEqual(new Set(['a', 'c']));
    expect(g.getDependents('c')).toEqual(new Set(['b', 'd']));
    expect(g.getDependents('d')).toEqual(new Set(['c']));
  });

  it('removeLane drops both endpoint memberships', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('b', ['p2', 'p3']);
    g.removeLane('a');
    expect(g.has('a')).toBe(false);
    expect(g.size()).toBe(1);
    expect(g.getDependents('b').size).toBe(0);
  });

  it('removeLane is idempotent (removing a non-existent id is safe)', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.removeLane('nonexistent');
    expect(g.size()).toBe(1);
  });

  it('addLane is idempotent — re-adding overwrites endpoint memberships', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('a', ['p3', 'p4']);
    expect(g.size()).toBe(1);
    // a no longer participates at p1 or p2
    g.addLane('b', ['p1', 'p3']);
    expect(g.getDependents('b')).toEqual(new Set(['a']));
    expect(g.getDependents('a')).toEqual(new Set(['b']));
  });

  it('clear empties the graph', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('b', ['p2', 'p3']);
    g.clear();
    expect(g.size()).toBe(0);
    expect(g.getDependents('a').size).toBe(0);
    expect(g.has('a')).toBe(false);
  });

  it('getDependents excludes self even for self-loop endpoints', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p1']);
    expect(g.getDependents('a').has('a')).toBe(false);
    expect(g.getDependents('a').size).toBe(0);
  });

  it('multi-lane junction: removing one lane leaves the others connected', () => {
    const g = new LaneJunctionGraph();
    g.addLane('a', ['p1', 'p2']);
    g.addLane('b', ['p2', 'p3']);
    g.addLane('c', ['p2', 'p4']);
    g.removeLane('a');
    expect(g.getDependents('b')).toEqual(new Set(['c']));
    expect(g.getDependents('c')).toEqual(new Set(['b']));
  });
});
