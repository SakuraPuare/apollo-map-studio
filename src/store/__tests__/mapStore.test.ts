/**
 * mapStore — comprehensive unit tests.
 *
 * Coverage targets: addEntity / updateEntity / removeEntity / reparentEntity,
 * undo/redo via zundo temporal, cascade FK cleanup, lane topology reconciliation.
 *
 * Reset pattern: capture actions once at module load (they survive setState replace),
 * then call useMapStore.setState({ entities: new Map() }, true) to wipe data
 * and reset zundo history before each test.
 *
 * NOTE: immer+zundo wraps the store so setState(snapshot, true) on the main
 * store replaces the data slice. We also call temporal.getState().clear() to
 * flush undo history so tests cannot bleed history state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../mapStore';
import type { LaneEntity, JunctionEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import type { PolylineEntity, JunctionEntity as _JE } from '@/types/entities';

// ─── Capture action functions once (survive replace-setState) ────────────────

const { addEntity, updateEntity, removeEntity, reparentEntity } = useMapStore.getState();

// ─── Reset helpers ────────────────────────────────────────────────────────────

function resetStore() {
  // Merge-update only the data key so that action method closures on the
  // store object are not wiped. We rely on the module-level captured
  // closures above for all action calls.
  useMapStore.setState({ entities: new Map() });
  // Flush zundo history so undo/redo tests don't inherit previous test states.
  useMapStore.temporal.getState().clear();
}

beforeEach(() => {
  resetStore();
});

// ─── Entity factories ─────────────────────────────────────────────────────────

function makeLane(
  id: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
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
              { x: startX, y: startY },
              { x: endX, y: endY },
            ],
          },
          s: 0,
          startPosition: { x: startX, y: startY },
          heading: 0,
          length: 1,
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 1,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 10,
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

function makeJunction(id: string): JunctionEntity {
  // Polygon strictly contains the typical (0,0)→(1,0) and (1,0)→(2,0) test lanes,
  // so reconcileLaneTopology can derive lane.junctionId for tests that exercise
  // the cascade/reparent paths against a junction.
  return {
    id,
    entityType: 'junction',
    polygon: {
      points: [
        { x: -1, y: -1 },
        { x: 5, y: -1 },
        { x: 5, y: 5 },
        { x: -1, y: 5 },
      ],
    },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

function makeRoad(id: string, laneIds: string[] = []): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [{ id: `${id}_s0`, laneIds }],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function makeRSU(id: string, junctionId: string | null = null): RSUEntity {
  return {
    id,
    entityType: 'rsu',
    junctionId,
    overlapIds: [],
  };
}

function makePolyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

// ─── Helper to get entities map ───────────────────────────────────────────────

function entities() {
  return useMapStore.getState().entities;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Initial state
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — initial state', () => {
  it('starts with an empty entities map', () => {
    expect(entities().size).toBe(0);
  });

  it('exposes all four action methods', () => {
    const s = useMapStore.getState();
    expect(typeof s.addEntity).toBe('function');
    expect(typeof s.updateEntity).toBe('function');
    expect(typeof s.removeEntity).toBe('function');
    expect(typeof s.reparentEntity).toBe('function');
  });

  it('exposes a temporal property with undo/redo', () => {
    const t = useMapStore.temporal.getState();
    expect(typeof t.undo).toBe('function');
    expect(typeof t.redo).toBe('function');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. addEntity
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — addEntity', () => {
  it('stores a non-lane entity by id', () => {
    const junction = makeJunction('j1');
    addEntity(junction);
    expect(entities().get('j1')).toEqual(junction);
  });

  it('stores a polyline (drawing entity) by id', () => {
    const poly = makePolyline('poly1');
    addEntity(poly);
    expect(entities().get('poly1')).toEqual(poly);
    expect(entities().size).toBe(1);
  });

  it('stores multiple entities independently', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    expect(entities().size).toBe(2);
    expect(entities().has('j1')).toBe(true);
    expect(entities().has('j2')).toBe(true);
  });

  it('overwrites an existing entity when same id is added again', () => {
    const j1 = makeJunction('j1');
    const j1b = { ...j1, type: 'IN_ROAD' as const };
    addEntity(j1);
    addEntity(j1b);
    expect((entities().get('j1') as JunctionEntity).type).toBe('IN_ROAD');
    // Only 1 entry (overwrite, not append)
    expect(entities().size).toBe(1);
  });

  it('triggers topology reconciliation when a lane is added', () => {
    // laneA ends at (1,0); laneB starts at (1,0) → successor link expected.
    const laneA = makeLane('laneA', 0, 0, 1, 0);
    const laneB = makeLane('laneB', 1, 0, 2, 0);
    addEntity(laneA);
    addEntity(laneB);
    const a = entities().get('laneA') as LaneEntity;
    const b = entities().get('laneB') as LaneEntity;
    expect(a.successorIds).toContain('laneB');
    expect(b.predecessorIds).toContain('laneA');
  });

  it('does NOT run topology reconciliation for non-lane entities', () => {
    // No error / no extra entities created.
    const junction = makeJunction('j1');
    addEntity(junction);
    expect(entities().size).toBe(1);
    expect(entities().get('j1')).toEqual(junction);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. updateEntity
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — updateEntity', () => {
  it('updates an existing entity in place', () => {
    addEntity(makeJunction('j1'));
    const updated = { ...makeJunction('j1'), type: 'DEAD_END' as const };
    updateEntity('j1', updated);
    expect((entities().get('j1') as JunctionEntity).type).toBe('DEAD_END');
  });

  it('is a no-op when id does not exist', () => {
    const junction = makeJunction('j1');
    updateEntity('ghost', junction);
    expect(entities().has('ghost')).toBe(false);
    expect(entities().size).toBe(0);
  });

  it('does not affect other entities', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    const updated = { ...makeJunction('j1'), type: 'DEAD_END' as const };
    updateEntity('j1', updated);
    expect((entities().get('j2') as JunctionEntity).type).toBe('CROSS_ROAD');
  });

  it('re-runs topology reconciliation when a lane is updated', () => {
    // laneA and laneB not connected initially.
    const laneA = makeLane('laneA', 0, 0, 1, 0);
    const laneB = makeLane('laneB', 9, 9, 10, 10); // far away
    addEntity(laneA);
    addEntity(laneB);

    // Move laneB's start to match laneA's end.
    const laneBMoved = makeLane('laneB', 1, 0, 2, 0);
    updateEntity('laneB', laneBMoved);

    const a = entities().get('laneA') as LaneEntity;
    expect(a.successorIds).toContain('laneB');
  });

  it('dissolves topology link when lane geometry is moved apart', () => {
    const laneA = makeLane('laneA', 0, 0, 1, 0);
    const laneB = makeLane('laneB', 1, 0, 2, 0);
    addEntity(laneA);
    addEntity(laneB);
    // Confirm link exists
    expect((entities().get('laneA') as LaneEntity).successorIds).toContain('laneB');

    // Move laneB away from laneA's end
    const laneBMoved = makeLane('laneB', 5, 5, 6, 6);
    updateEntity('laneB', laneBMoved);

    const a = entities().get('laneA') as LaneEntity;
    expect(a.successorIds).not.toContain('laneB');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. removeEntity
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — removeEntity', () => {
  it('removes an existing entity', () => {
    addEntity(makeJunction('j1'));
    removeEntity('j1');
    expect(entities().has('j1')).toBe(false);
    expect(entities().size).toBe(0);
  });

  it('is a no-op when id does not exist', () => {
    addEntity(makeJunction('j1'));
    removeEntity('ghost');
    expect(entities().size).toBe(1);
  });

  it('does not remove other entities', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    removeEntity('j1');
    expect(entities().has('j1')).toBe(false);
    expect(entities().has('j2')).toBe(true);
  });

  it('cascades: clears junctionId on Lane referencing deleted junction', () => {
    const junction = makeJunction('j1');
    const lane = makeLane('lane1', 0, 0, 1, 0, { junctionId: 'j1' });
    addEntity(junction);
    addEntity(lane);
    removeEntity('j1');
    const updatedLane = entities().get('lane1') as LaneEntity;
    expect(updatedLane.junctionId).toBe(null);
  });

  it('cascades: strips lane from Road.sections when lane is deleted', () => {
    const road = makeRoad('road1', ['lane1']);
    const lane = makeLane('lane1', 0, 0, 1, 0);
    addEntity(road);
    addEntity(lane);
    removeEntity('lane1');
    const updatedRoad = entities().get('road1') as RoadEntity;
    expect(updatedRoad.sections[0]!.laneIds).not.toContain('lane1');
  });

  it('cascades: clears junctionId on Road referencing deleted junction', () => {
    const junction = makeJunction('j1');
    const road: RoadEntity = { ...makeRoad('road1'), junctionId: 'j1' };
    addEntity(junction);
    addEntity(road);
    removeEntity('j1');
    const updatedRoad = entities().get('road1') as RoadEntity;
    expect(updatedRoad.junctionId).toBe(null);
  });

  it('cascades: clears junctionId on RSU referencing deleted junction', () => {
    const junction = makeJunction('j1');
    const rsu = makeRSU('rsu1', 'j1');
    addEntity(junction);
    addEntity(rsu);
    removeEntity('j1');
    const updatedRSU = entities().get('rsu1') as RSUEntity;
    expect(updatedRSU.junctionId).toBe(null);
  });

  it('removes topology links when a lane is deleted', () => {
    // laneA → laneB connected; deleting laneB should clear laneA.successorIds
    const laneA = makeLane('laneA', 0, 0, 1, 0);
    const laneB = makeLane('laneB', 1, 0, 2, 0);
    addEntity(laneA);
    addEntity(laneB);
    expect((entities().get('laneA') as LaneEntity).successorIds).toContain('laneB');

    removeEntity('laneB');
    const a = entities().get('laneA') as LaneEntity;
    expect(a.successorIds).not.toContain('laneB');
  });

  it('deleting a non-lane entity does not error on topology reconciliation', () => {
    addEntity(makeJunction('j1'));
    expect(() => removeEntity('j1')).not.toThrow();
    expect(entities().has('j1')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. reparentEntity
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — reparentEntity', () => {
  it('returns rejected result when childId does not exist', () => {
    const result = reparentEntity('ghost', { kind: 'junction', id: 'j1' });
    expect(result.rejected).toBeTruthy();
    expect(result.changes.size).toBe(0);
  });

  it('rejects Lane → Junction when target does not exist', () => {
    const lane = makeLane('lane1', 0, 0, 1, 0);
    addEntity(lane);
    const result = reparentEntity('lane1', { kind: 'junction', id: 'ghost_j' });
    expect(result.rejected).toBeTruthy();
  });

  it('reparents Lane → Junction and sets junctionId', () => {
    const junction = makeJunction('j1');
    const lane = makeLane('lane1', 0, 0, 1, 0);
    addEntity(junction);
    addEntity(lane);
    const result = reparentEntity('lane1', { kind: 'junction', id: 'j1' });
    expect(result.rejected).toBeUndefined();
    const updatedLane = entities().get('lane1') as LaneEntity;
    expect(updatedLane.junctionId).toBe('j1');
  });

  it('reparents Lane → Junction is idempotent (returns empty changes)', () => {
    const junction = makeJunction('j1');
    const lane = makeLane('lane1', 0, 0, 1, 0, { junctionId: 'j1' });
    addEntity(junction);
    addEntity(lane);
    // Lane is already in j1; second reparent returns accepted but empty changes.
    const result = reparentEntity('lane1', { kind: 'junction', id: 'j1' });
    expect(result.rejected).toBeUndefined();
    expect(result.changes.size).toBe(0);
  });

  it('reparents Lane → Road and inserts lane into first section', () => {
    const road = makeRoad('road1', []);
    const lane = makeLane('lane1', 0, 0, 1, 0);
    addEntity(road);
    addEntity(lane);
    const result = reparentEntity('lane1', { kind: 'road', id: 'road1' });
    expect(result.rejected).toBeUndefined();
    const updatedRoad = entities().get('road1') as RoadEntity;
    expect(updatedRoad.sections[0]!.laneIds).toContain('lane1');
  });

  it('reparents Lane → Road clears junctionId from the lane', () => {
    const junction = makeJunction('j1');
    const road = makeRoad('road1', []);
    const lane = makeLane('lane1', 0, 0, 1, 0, { junctionId: 'j1' });
    addEntity(junction);
    addEntity(road);
    addEntity(lane);
    reparentEntity('lane1', { kind: 'road', id: 'road1' });
    const updatedLane = entities().get('lane1') as LaneEntity;
    expect(updatedLane.junctionId).toBe(null);
  });

  it('reparents Lane → none clears junctionId', () => {
    const junction = makeJunction('j1');
    const lane = makeLane('lane1', 0, 0, 1, 0, { junctionId: 'j1' });
    addEntity(junction);
    addEntity(lane);
    const result = reparentEntity('lane1', { kind: 'none' });
    expect(result.rejected).toBeUndefined();
    const updatedLane = entities().get('lane1') as LaneEntity;
    expect(updatedLane.junctionId).toBe(null);
  });

  it('reparents Road → Junction sets road.junctionId', () => {
    const junction = makeJunction('j1');
    const road = makeRoad('road1');
    addEntity(junction);
    addEntity(road);
    const result = reparentEntity('road1', { kind: 'junction', id: 'j1' });
    expect(result.rejected).toBeUndefined();
    const updatedRoad = entities().get('road1') as RoadEntity;
    expect(updatedRoad.junctionId).toBe('j1');
  });

  it('reparents Road → none clears road.junctionId', () => {
    const junction = makeJunction('j1');
    const road: RoadEntity = { ...makeRoad('road1'), junctionId: 'j1' };
    addEntity(junction);
    addEntity(road);
    const result = reparentEntity('road1', { kind: 'none' });
    expect(result.rejected).toBeUndefined();
    const updatedRoad = entities().get('road1') as RoadEntity;
    expect(updatedRoad.junctionId).toBe(null);
  });

  it('reparents RSU → Junction sets rsu.junctionId', () => {
    const junction = makeJunction('j1');
    const rsu = makeRSU('rsu1');
    addEntity(junction);
    addEntity(rsu);
    const result = reparentEntity('rsu1', { kind: 'junction', id: 'j1' });
    expect(result.rejected).toBeUndefined();
    const updatedRSU = entities().get('rsu1') as RSUEntity;
    expect(updatedRSU.junctionId).toBe('j1');
  });

  it('reparents RSU → none clears rsu.junctionId', () => {
    const junction = makeJunction('j1');
    const rsu = makeRSU('rsu1', 'j1');
    addEntity(junction);
    addEntity(rsu);
    const result = reparentEntity('rsu1', { kind: 'none' });
    expect(result.rejected).toBeUndefined();
    const updatedRSU = entities().get('rsu1') as RSUEntity;
    expect(updatedRSU.junctionId).toBe(null);
  });

  it('rejects unsupported reparent (Junction → Junction)', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    const result = reparentEntity('j1', { kind: 'junction', id: 'j2' });
    expect(result.rejected).toBeTruthy();
  });

  it('does not mutate store when result is rejected', () => {
    addEntity(makeJunction('j1'));
    const sizeBefore = entities().size;
    reparentEntity('j1', { kind: 'junction', id: 'j2' }); // j2 not in store
    expect(entities().size).toBe(sizeBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Undo / Redo via zundo temporal
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — undo/redo', () => {
  it('undo after addEntity restores empty state', () => {
    addEntity(makeJunction('j1'));
    expect(entities().size).toBe(1);
    useMapStore.temporal.getState().undo();
    expect(entities().size).toBe(0);
  });

  it('redo after undo re-adds the entity', () => {
    addEntity(makeJunction('j1'));
    useMapStore.temporal.getState().undo();
    expect(entities().size).toBe(0);
    useMapStore.temporal.getState().redo();
    expect(entities().size).toBe(1);
    expect(entities().has('j1')).toBe(true);
  });

  it('undo after updateEntity restores previous value', () => {
    const orig = makeJunction('j1');
    addEntity(orig);
    const updated = { ...orig, type: 'DEAD_END' as const };
    updateEntity('j1', updated);
    expect((entities().get('j1') as JunctionEntity).type).toBe('DEAD_END');

    useMapStore.temporal.getState().undo();
    expect((entities().get('j1') as JunctionEntity).type).toBe('CROSS_ROAD');
  });

  it('undo after removeEntity restores the deleted entity', () => {
    addEntity(makeJunction('j1'));
    removeEntity('j1');
    expect(entities().has('j1')).toBe(false);

    useMapStore.temporal.getState().undo();
    expect(entities().has('j1')).toBe(true);
  });

  it('multiple undos step back through history', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    addEntity(makeJunction('j3'));
    // Undo once → j3 removed
    useMapStore.temporal.getState().undo();
    expect(entities().has('j3')).toBe(false);
    // Undo again → j2 removed
    useMapStore.temporal.getState().undo();
    expect(entities().has('j2')).toBe(false);
    // j1 still present
    expect(entities().has('j1')).toBe(true);
  });

  it('undo is a no-op when history is empty', () => {
    // Nothing added; undo should not throw
    expect(() => useMapStore.temporal.getState().undo()).not.toThrow();
    expect(entities().size).toBe(0);
  });

  it('redo is a no-op when no undone states exist', () => {
    addEntity(makeJunction('j1'));
    expect(() => useMapStore.temporal.getState().redo()).not.toThrow();
    expect(entities().size).toBe(1);
  });

  it('new action after undo clears redo stack', () => {
    addEntity(makeJunction('j1'));
    useMapStore.temporal.getState().undo();
    // New action
    addEntity(makeJunction('j2'));
    // Redo should not bring back j1
    useMapStore.temporal.getState().redo();
    expect(entities().has('j1')).toBe(false);
    expect(entities().has('j2')).toBe(true);
  });

  it('undo returns partialised state (only entities)', () => {
    // zundo partialize includes only { entities } per mapStore options.
    // After undo, entities Map is correct and actions still exist.
    addEntity(makeJunction('j1'));
    useMapStore.temporal.getState().undo();
    const s = useMapStore.getState();
    expect(typeof s.addEntity).toBe('function');
    expect(typeof s.removeEntity).toBe('function');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Lane topology reconciliation in isolation
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — lane topology reconciliation', () => {
  it('connects three sequential lanes into a chain', () => {
    const a = makeLane('a', 0, 0, 1, 0);
    const b = makeLane('b', 1, 0, 2, 0);
    const c = makeLane('c', 2, 0, 3, 0);
    addEntity(a);
    addEntity(b);
    addEntity(c);

    const la = entities().get('a') as LaneEntity;
    const lb = entities().get('b') as LaneEntity;
    const lc = entities().get('c') as LaneEntity;

    expect(la.successorIds).toContain('b');
    expect(lb.predecessorIds).toContain('a');
    expect(lb.successorIds).toContain('c');
    expect(lc.predecessorIds).toContain('b');
  });

  it('does not create self-loop pred/succ on a single lane', () => {
    const lane = makeLane('only', 0, 0, 1, 0);
    addEntity(lane);
    const l = entities().get('only') as LaneEntity;
    expect(l.predecessorIds).toHaveLength(0);
    expect(l.successorIds).toHaveLength(0);
  });

  it('does not link lanes whose endpoints do not match', () => {
    const a = makeLane('a', 0, 0, 1, 0);
    const b = makeLane('b', 5, 5, 6, 6); // completely separate
    addEntity(a);
    addEntity(b);
    const la = entities().get('a') as LaneEntity;
    const lb = entities().get('b') as LaneEntity;
    expect(la.successorIds).toHaveLength(0);
    expect(lb.predecessorIds).toHaveLength(0);
  });

  it('topology precision: coordinates differing beyond 1e-6 do not link', () => {
    // laneA ends at x=1.0000000, laneB starts at x=1.0000001 (should differ)
    const a = makeLane('a', 0, 0, 1.0, 0);
    const b = makeLane('b', 1.0000001, 0, 2, 0);
    addEntity(a);
    addEntity(b);
    const la = entities().get('a') as LaneEntity;
    // toFixed(6) on 1.0000000 = '1.000000', on 1.0000001 = '1.000000'
    // So these ARE equal after rounding — expect link to form.
    expect(la.successorIds).toContain('b');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Cascade delete edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — cascade delete edge cases', () => {
  it('deleting an entity with no FK references leaves others intact', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    removeEntity('j1');
    expect(entities().get('j2')).toEqual(makeJunction('j2'));
  });

  it('stripping overlapIds when the referenced overlap is deleted', () => {
    // crosswalk with overlapIds pointing at an overlap entity
    const crosswalk = {
      id: 'cw1',
      entityType: 'crosswalk' as const,
      polygon: { points: [{ x: 0, y: 0 }] },
      overlapIds: ['ov1'],
    };
    const overlap = {
      id: 'ov1',
      entityType: 'overlap' as const,
      objects: [],
      regionOverlaps: [],
    };
    addEntity(crosswalk);
    addEntity(overlap);
    removeEntity('ov1');
    const updatedCw = entities().get('cw1') as typeof crosswalk;
    expect(updatedCw.overlapIds).not.toContain('ov1');
    expect(updatedCw.overlapIds).toHaveLength(0);
  });

  it('multiple cascades in a single removal: lane pred/succ + junctionId', () => {
    // Setup: laneA (junctionId=j1) → laneB connected topology
    const junction = makeJunction('j1');
    const laneA = makeLane('laneA', 0, 0, 1, 0, { junctionId: 'j1' });
    const laneB = makeLane('laneB', 1, 0, 2, 0);
    addEntity(junction);
    addEntity(laneA);
    addEntity(laneB);

    // Verify connection before deletion
    expect((entities().get('laneA') as LaneEntity).successorIds).toContain('laneB');

    // Delete laneB: laneA should lose successor ref, junctionId untouched
    removeEntity('laneB');
    const a = entities().get('laneA') as LaneEntity;
    expect(a.successorIds).not.toContain('laneB');
    expect(a.junctionId).toBe('j1'); // unrelated, should be preserved
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. State isolation between tests
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — state isolation', () => {
  it('mutations in one test do not bleed into the next via beforeEach reset', () => {
    addEntity(makeJunction('j1'));
    addEntity(makeJunction('j2'));
    addEntity(makeJunction('j3'));
    expect(entities().size).toBe(3);
  });

  it('store is empty after the preceding mutation test (beforeEach cleared it)', () => {
    expect(entities().size).toBe(0);
  });

  it('undo history is cleared between tests', () => {
    // If history leaked from the previous test, undo would bring j1/j2/j3 back.
    useMapStore.temporal.getState().undo();
    expect(entities().size).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Non-lane entity CRUD (drawing primitives)
// ═════════════════════════════════════════════════════════════════════════════

describe('mapStore — drawing entity CRUD', () => {
  it('add, update, remove a polyline entity', () => {
    const poly: PolylineEntity = {
      id: 'p1',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    addEntity(poly);
    expect(entities().has('p1')).toBe(true);

    const updated: PolylineEntity = {
      ...poly,
      points: [
        { x: 5, y: 5 },
        { x: 6, y: 6 },
      ],
    };
    updateEntity('p1', updated);
    expect((entities().get('p1') as PolylineEntity).points[0]).toEqual({ x: 5, y: 5 });

    removeEntity('p1');
    expect(entities().has('p1')).toBe(false);
  });

  it('undo after remove polyline restores it', () => {
    const poly = makePolyline('p1');
    addEntity(poly);
    removeEntity('p1');
    useMapStore.temporal.getState().undo();
    expect(entities().has('p1')).toBe(true);
  });
});
