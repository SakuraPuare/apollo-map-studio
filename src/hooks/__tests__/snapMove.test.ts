import { describe, it, expect, beforeEach } from 'vitest';
import { snapEditingDragPoint } from '../mapEventRouter/eventHandlers';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
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
});
