import { describe, it, expect, beforeEach, vi } from 'vitest';
import { snapEditingDragPoint } from '../mapEventRouter/eventHandlers';
import { applyMoveSnap, applySnap } from '../mapEventRouter/snap';
import { applyDrag } from '@/components/map/entityMutations';
import { rectPolygonPoints } from '@/components/map/entityMutations/rect';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import type { ParkingSpaceEntity } from '@/types/apollo';
import type { BezierEntity, MapEntity, PolylineEntity, RectEntity } from '@/types/entities';

const METER = 1 / 111320;

const initialUISnapshot = useUIStore.getState();
const initialSettingsSnapshot = useSettingsStore.getState();

function rect(id: string, leftM: number, bottomM: number): RectEntity {
  return {
    id,
    entityType: 'rect',
    p1: { x: leftM * METER, y: bottomM * METER },
    p2: { x: (leftM + 10) * METER, y: (bottomM + 10) * METER },
    rotation: 0,
  };
}

function polyline(id: string, points: [number, number][]): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: points.map(([x, y]) => ({ x, y })),
  };
}

function bezier(id: string): BezierEntity {
  return {
    id,
    entityType: 'bezier',
    anchors: [
      { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
      { point: { x: 10 * METER, y: 0 }, handleIn: null, handleOut: null },
    ],
  };
}

function makeActor(
  value = 'editingPoint',
  context: Partial<{
    selectedEntityId: string | null;
    dragPointType: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
  }> = {},
) {
  const snapshot = {
    value,
    context: {
      selectedEntityId: 'moving',
      dragPointType: 'center',
      ...context,
    },
  };
  return { getSnapshot: vi.fn(() => snapshot) };
}

function makeMap(zoom = 18) {
  return { getZoom: vi.fn(() => zoom) };
}

function staleTarget() {
  return {
    kind: 'vertex',
    entityId: 'stale',
    entityType: 'rect',
    point: { x: 1, y: 2 },
  } as const;
}

function makeContext(actor: ReturnType<typeof makeActor>, centerGrabOffset: [number, number]) {
  return {
    map: { getZoom: () => 18 },
    actorRef: actor,
    bridgeRef: { current: null },
    mutable: {
      mouseDownScreenPos: null,
      centerGrabOffset,
      lastDrawInput: null,
      boundaryBrushDragging: false,
      lastBoundaryBrushHit: null,
    },
    cursorScheduler: { schedule: () => {}, dispose: () => {} },
  };
}

function parkingSpaceRect(
  id: string,
  leftM: number,
  bottomM: number,
  rotation: number,
): ParkingSpaceEntity {
  const sourceRect = {
    p1: { x: leftM * METER, y: bottomM * METER },
    p2: { x: (leftM + 10) * METER, y: (bottomM + 10) * METER },
    rotation,
  };
  return {
    id,
    entityType: 'parkingSpace',
    polygon: { points: rectPolygonPoints(sourceRect) },
    heading: rotation,
    overlapIds: [],
    _sourceRect: sourceRect,
  };
}

beforeEach(() => {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUISnapshot, true);
  useSettingsStore.setState(initialSettingsSnapshot, true);
});

describe('selected entity move snapping', () => {
  it('applies point snapping only in snap-enabled drawing or editing states', () => {
    const fixed = rect('fixed', 0, 0);
    useMapStore.setState({ entities: new Map<string, MapEntity>([[fixed.id, fixed]]) });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: null });
    useSettingsStore.setState({ snapRadius: 20 });

    const snapped = applySnap(makeMap() as never, makeActor('drawPolyline') as never, [
      0.4 * METER,
      0.4 * METER,
    ]);

    expect(snapped[0]).toBeCloseTo(0, 12);
    expect(snapped[1]).toBeCloseTo(0, 12);
    expect(useUIStore.getState().currentSnapTarget).toMatchObject({
      kind: 'vertex',
      entityId: 'fixed',
      entityType: 'rect',
      point: { x: 0, y: 0 },
    });

    useUIStore.setState({ snapEnabled: false, currentSnapTarget: staleTarget() });
    const disabled = applySnap(makeMap() as never, makeActor('drawPolyline') as never, [
      0.4 * METER,
      0.4 * METER,
    ]);
    expect(disabled).toEqual([0.4 * METER, 0.4 * METER]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.setState({ snapEnabled: true, currentSnapTarget: staleTarget() });
    const selected = applySnap(makeMap() as never, makeActor('selected') as never, [
      0.4 * METER,
      0.4 * METER,
    ]);
    expect(selected).toEqual([0.4 * METER, 0.4 * METER]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();
  });

  it('filters hidden snap sources, excludes the edited entity, and clears stale point targets on misses', () => {
    const fixed = rect('fixed', 0, 0);
    const self = rect('moving', 0, 0);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [fixed.id, fixed],
        [self.id, self],
      ]),
    });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: staleTarget() });
    useSettingsStore.setState({ snapRadius: 20 });

    const selfOnly = applySnap(
      makeMap() as never,
      makeActor('editingPoint') as never,
      [0.2 * METER, 0.2 * METER],
      'moving',
    );
    expect(selfOnly[0]).toBeCloseTo(0, 12);
    expect(selfOnly[1]).toBeCloseTo(0, 12);
    expect(useUIStore.getState().currentSnapTarget?.entityId).toBe('fixed');

    useUIStore.getState().setLayerVisible('rect', false);
    const hidden = applySnap(
      makeMap() as never,
      makeActor('editingPoint') as never,
      [0.2 * METER, 0.2 * METER],
      'moving',
    );
    expect(hidden).toEqual([0.2 * METER, 0.2 * METER]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.getState().setLayerVisible('rect', true);
    useUIStore.setState({ currentSnapTarget: staleTarget() });
    const miss = applySnap(
      makeMap() as never,
      makeActor('editingPoint') as never,
      [200 * METER, 200 * METER],
      null,
    );
    expect(miss).toEqual([200 * METER, 200 * METER]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();
  });

  it('uses edge snapping for drawing point placement when no vertex is close enough', () => {
    const line = polyline('line-1', [
      [0, 0],
      [100 * METER, 0],
    ]);
    useMapStore.setState({ entities: new Map<string, MapEntity>([[line.id, line]]) });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: null });
    useSettingsStore.setState({ snapRadius: 20 });

    const snapped = applySnap(makeMap() as never, makeActor('drawPolygon') as never, [
      50 * METER,
      0.5 * METER,
    ]);

    expect(snapped[0]).toBeCloseTo(50 * METER, 12);
    expect(snapped[1]).toBeCloseTo(0, 12);
    const target = useUIStore.getState().currentSnapTarget;
    expect(target).toMatchObject({
      kind: 'edge',
      entityId: 'line-1',
      entityType: 'polyline',
    });
    expect(target?.point.x).toBeCloseTo(50 * METER, 12);
    expect(target?.point.y).toBeCloseTo(0, 12);
  });

  it('snaps a dragged box by matching control points', () => {
    const fixed = rect('fixed', 0, 0);
    const moving = rect('moving', 30, 0);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [fixed.id, fixed],
        [moving.id, moving],
      ]),
    });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: null });
    useSettingsStore.setState({ snapRadius: 20 });

    const actor = makeActor();
    const grabOffset: [number, number] = [2 * METER, -1 * METER];
    const desiredCenter: [number, number] = [15.5 * METER, 15.5 * METER];
    const cursorPoint: [number, number] = [
      desiredCenter[0] + grabOffset[0],
      desiredCenter[1] + grabOffset[1],
    ];

    const snapped = snapEditingDragPoint(
      makeContext(actor, grabOffset) as never,
      actor.getSnapshot() as never,
      cursorPoint,
    );

    expect(snapped[0]).toBeCloseTo(15 * METER, 12);
    expect(snapped[1]).toBeCloseTo(15 * METER, 12);
    expect(useUIStore.getState().currentSnapTarget?.entityId).toBe('fixed');
    expect(useUIStore.getState().currentSnapTarget?.kind).toBe('vertex');
    expect(useUIStore.getState().currentSnapTarget?.point).toEqual({
      x: 10 * METER,
      y: 10 * METER,
    });
  });

  it('aligns the applied Apollo rotated-rectangle corner with the snap target', () => {
    const fixed = rect('fixed', 0, 0);
    const moving = parkingSpaceRect('moving', 30, 0, Math.PI / 4);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [fixed.id, fixed],
        [moving.id, moving],
      ]),
    });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: null });
    useSettingsStore.setState({ snapRadius: 20 });

    const actor = makeActor();
    const sourceCenter = [
      (moving._sourceRect!.p1.x + moving._sourceRect!.p2.x) / 2,
      (moving._sourceRect!.p1.y + moving._sourceRect!.p2.y) / 2,
    ] as [number, number];
    const controlPoint = rectPolygonPoints(moving._sourceRect!)[0]!;
    const targetPoint = { x: 10 * METER, y: 10 * METER };
    const desiredCenter: [number, number] = [
      sourceCenter[0] + (targetPoint.x - controlPoint.x) + 0.5 * METER,
      sourceCenter[1] + (targetPoint.y - controlPoint.y) + 0.5 * METER,
    ];
    const grabOffset: [number, number] = [1 * METER, -1 * METER];
    const cursorPoint: [number, number] = [
      desiredCenter[0] + grabOffset[0],
      desiredCenter[1] + grabOffset[1],
    ];

    const snappedCenter = snapEditingDragPoint(
      makeContext(actor, grabOffset) as never,
      actor.getSnapshot() as never,
      cursorPoint,
    );
    const moved = applyDrag(moving, -2, 'center', snappedCenter) as ParkingSpaceEntity;
    const movedControlPoint = rectPolygonPoints(moved._sourceRect!)[0]!;

    expect(useUIStore.getState().currentSnapTarget?.kind).toBe('vertex');
    expect(useUIStore.getState().currentSnapTarget?.point).toEqual(targetPoint);
    expect(movedControlPoint.x).toBeCloseTo(targetPoint.x, 12);
    expect(movedControlPoint.y).toBeCloseTo(targetPoint.y, 12);
  });

  it('clears stale move targets when move snapping is disabled, not editing, or missing a selected entity', () => {
    useUIStore.setState({ snapEnabled: false, currentSnapTarget: staleTarget() });

    expect(
      applyMoveSnap(makeMap() as never, makeActor('editingPoint') as never, [1, 2], 'moving'),
    ).toEqual([1, 2]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.setState({ snapEnabled: true, currentSnapTarget: staleTarget() });
    expect(
      applyMoveSnap(makeMap() as never, makeActor('selected') as never, [3, 4], 'moving'),
    ).toEqual([3, 4]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.setState({ currentSnapTarget: staleTarget() });
    expect(
      applyMoveSnap(makeMap() as never, makeActor('editingPoint') as never, [5, 6], null),
    ).toEqual([5, 6]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    useUIStore.setState({ currentSnapTarget: staleTarget() });
    expect(
      applyMoveSnap(makeMap() as never, makeActor('editingPoint') as never, [7, 8], 'missing'),
    ).toEqual([7, 8]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();
  });

  it('keeps the desired center when the selected entity has no movable center or no guide points', () => {
    const noCenter = bezier('moving');
    const fixed = rect('fixed', 0, 0);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [noCenter.id, noCenter],
        [fixed.id, fixed],
      ]),
    });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: staleTarget() });
    useSettingsStore.setState({ snapRadius: 20 });

    expect(
      applyMoveSnap(makeMap() as never, makeActor('editingPoint') as never, [0, 0], 'moving'),
    ).toEqual([0, 0]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();

    const emptyMoving = polyline('moving', []);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [emptyMoving.id, emptyMoving],
        [fixed.id, fixed],
      ]),
    });
    useUIStore.setState({ currentSnapTarget: staleTarget() });

    expect(
      applyMoveSnap(makeMap() as never, makeActor('editingPoint') as never, [0, 0], 'moving'),
    ).toEqual([0, 0]);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();
  });

  it('ignores edge candidates and hidden entities while move snapping selected entity guide points', () => {
    const moving = rect('moving', 30, 0);
    const edgeOnly = polyline('edge-line', [
      [15 * METER, 0],
      [15 * METER, 20 * METER],
    ]);
    const hiddenVertex = polyline('hidden-line', [
      [10 * METER, 10 * METER],
      [50 * METER, 50 * METER],
    ]);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [moving.id, moving],
        [edgeOnly.id, edgeOnly],
        [hiddenVertex.id, hiddenVertex],
      ]),
    });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: staleTarget() });
    useUIStore.getState().setLayerVisible('polyline', false);
    useSettingsStore.setState({ snapRadius: 20 });

    const desiredCenter: [number, number] = [10 * METER, 10 * METER];
    expect(
      applyMoveSnap(
        makeMap() as never,
        makeActor('editingPoint') as never,
        desiredCenter,
        'moving',
      ),
    ).toEqual(desiredCenter);
    expect(useUIStore.getState().currentSnapTarget).toBeNull();
  });

  it('routes non-center editing drags through point snapping with the selected entity excluded', () => {
    const moving = rect('moving', 0, 0);
    const fixed = rect('fixed', 20, 0);
    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        [moving.id, moving],
        [fixed.id, fixed],
      ]),
    });
    useUIStore.setState({ snapEnabled: true, currentSnapTarget: null });
    useSettingsStore.setState({ snapRadius: 20 });
    const actor = makeActor('editingPoint', { dragPointType: 'vertex' });

    const snapped = snapEditingDragPoint(
      makeContext(actor, [0, 0]) as never,
      actor.getSnapshot() as never,
      [20.2 * METER, 0.2 * METER],
    );

    expect(snapped[0]).toBeCloseTo(20 * METER, 12);
    expect(snapped[1]).toBeCloseTo(0, 12);
    expect(useUIStore.getState().currentSnapTarget?.entityId).toBe('fixed');
  });
});
