import { describe, it, expect, beforeEach } from 'vitest';
import { snapEditingDragPoint } from '../mapEventRouter/eventHandlers';
import { applyDrag } from '@/components/map/entityMutations';
import { rectPolygonPoints } from '@/components/map/entityMutations/rect';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import type { ParkingSpaceEntity } from '@/types/apollo';
import type { MapEntity, RectEntity } from '@/types/entities';

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

function makeActor() {
  const snapshot = {
    value: 'editingPoint',
    context: {
      selectedEntityId: 'moving',
      dragPointType: 'center',
    },
  };
  return { getSnapshot: () => snapshot };
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
});
