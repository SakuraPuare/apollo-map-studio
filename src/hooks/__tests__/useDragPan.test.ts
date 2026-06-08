/**
 * Unit tests for useDragPan logic.
 *
 * The hook's only responsibility is managing map.dragPan.disable/enable
 * as a function of FSM snapshot. The decision:
 *
 *   shouldDisable = boundaryBrush || selectedLine || isDraggingHandle
 *                   || state === 'editingPoint' || state === 'drawBezier'
 *
 * We test the `shouldDisable` predicate and the idempotency guard
 * (dragPanDisabledRef — avoid redundant enable/disable calls).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  installDragPanSync,
  shouldDisableDragPan as shouldDisable,
  shouldDisableDragPanForSnapshot,
} from '../useDragPan';
import { createEntity } from '@/lib/entityOps';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { MapEntity, PolylineEntity, PolygonEntity } from '@/types/entities';

const initialUISnapshot = useUIStore.getState();

function selectedSnapshot(selectedEntityId: string) {
  return {
    value: 'selected',
    context: {
      selectedEntityId,
      isDraggingHandle: false,
    },
  };
}

beforeEach(() => {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUISnapshot, true);
});

// ---------------------------------------------------------------------------
// Tests for shouldDisable
// ---------------------------------------------------------------------------

describe('shouldDisable (useDragPan)', () => {
  describe('isDraggingHandle flag', () => {
    it('true when isDraggingHandle is true regardless of state', () => {
      expect(shouldDisable('idle', true)).toBe(true);
      expect(shouldDisable('selected', true)).toBe(true);
      expect(shouldDisable('drawPolyline', true)).toBe(true);
    });

    it('false when isDraggingHandle is false and state is idle', () => {
      expect(shouldDisable('idle', false)).toBe(false);
    });
  });

  describe('editingPoint state', () => {
    it('disables when state is editingPoint', () => {
      expect(shouldDisable('editingPoint', false)).toBe(true);
    });
  });

  describe('boundary brush mode', () => {
    it('disables pan while boundary brush is active', () => {
      expect(shouldDisable('idle', false, true)).toBe(true);
      expect(shouldDisable('selected', false, true)).toBe(true);
    });
  });

  describe('drawBezier state', () => {
    it('disables when state is drawBezier', () => {
      expect(shouldDisable('drawBezier', false)).toBe(true);
    });
  });

  describe('other draw states do NOT disable dragPan', () => {
    const otherDrawStates = [
      'drawPolyline',
      'drawCatmullRom',
      'drawArc',
      'drawRotatedRect',
      'drawPolygon',
    ];

    for (const state of otherDrawStates) {
      it(`${state} does not disable dragPan (user can pan between vertex placements)`, () => {
        expect(shouldDisable(state, false)).toBe(false);
      });
    }
  });

  describe('passive states', () => {
    it('idle does not disable', () => {
      expect(shouldDisable('idle', false)).toBe(false);
    });

    it('selected does not disable by itself', () => {
      expect(shouldDisable('selected', false)).toBe(false);
    });

    it('selected line drag guard disables pan before mousedown', () => {
      expect(shouldDisable('selected', false, false, true)).toBe(true);
    });
  });
});

describe('shouldDisableDragPanForSnapshot', () => {
  it('disables pan for a selected primitive polyline', () => {
    const entity: PolylineEntity = {
      id: 'polyline-1',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    };
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });

    expect(shouldDisableDragPanForSnapshot(selectedSnapshot(entity.id) as never)).toBe(true);
  });

  it('disables pan for a selected lane whose edit geometry is an open polyline', () => {
    const lane = createEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [1, 0],
      ],
      [],
    );
    useMapStore.setState({ entities: new Map<string, MapEntity>([[lane.id, lane]]) });

    expect(shouldDisableDragPanForSnapshot(selectedSnapshot(lane.id) as never)).toBe(true);
  });

  it('keeps pan enabled for a selected polygon because its fill hit is stable', () => {
    const entity: PolygonEntity = {
      id: 'polygon-1',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    useMapStore.setState({ entities: new Map<string, MapEntity>([[entity.id, entity]]) });

    expect(shouldDisableDragPanForSnapshot(selectedSnapshot(entity.id) as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Idempotency guard
//
// The hook uses a ref (`dragPanDisabledRef`) to track whether dragPan is
// currently disabled. Calling enable/disable is skipped when the desired
// state matches the current state. We test that guard in isolation.
// ---------------------------------------------------------------------------

describe('dragPan idempotency guard', () => {
  it('skips redundant disable call when already disabled', () => {
    let currentDisabled = false;
    let disableCount = 0;
    let enableCount = 0;

    // Replica of syncDragPan's guard logic:
    const syncDragPan = (newShouldDisable: boolean) => {
      if (newShouldDisable === currentDisabled) return;
      currentDisabled = newShouldDisable;
      if (newShouldDisable) disableCount++;
      else enableCount++;
    };

    syncDragPan(true); // first disable
    syncDragPan(true); // no-op
    syncDragPan(true); // no-op
    expect(disableCount).toBe(1);
    expect(enableCount).toBe(0);
  });

  it('skips redundant enable call when already enabled', () => {
    let currentDisabled = true; // start disabled
    let enableCount = 0;

    const syncDragPan = (newShouldDisable: boolean) => {
      if (newShouldDisable === currentDisabled) return;
      currentDisabled = newShouldDisable;
      if (!newShouldDisable) enableCount++;
    };

    syncDragPan(false); // first enable
    syncDragPan(false); // no-op
    expect(enableCount).toBe(1);
  });

  it('disable → enable → disable produces 2 disable and 1 enable call', () => {
    let currentDisabled = false;
    let disableCount = 0;
    let enableCount = 0;

    const syncDragPan = (newShouldDisable: boolean) => {
      if (newShouldDisable === currentDisabled) return;
      currentDisabled = newShouldDisable;
      if (newShouldDisable) disableCount++;
      else enableCount++;
    };

    syncDragPan(true); // disable
    syncDragPan(false); // enable
    syncDragPan(true); // disable again
    expect(disableCount).toBe(2);
    expect(enableCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// State transition scenarios
// ---------------------------------------------------------------------------

describe('state transition scenarios', () => {
  type Call = 'disable' | 'enable';

  function simulate(stateSequence: Array<{ state: string; isDraggingHandle: boolean }>): Call[] {
    let currentDisabled = false;
    const calls: Call[] = [];

    for (const { state, isDraggingHandle } of stateSequence) {
      const next = shouldDisable(state, isDraggingHandle);
      if (next === currentDisabled) continue;
      currentDisabled = next;
      calls.push(next ? 'disable' : 'enable');
    }
    return calls;
  }

  it('idle → editingPoint → idle produces disable then enable', () => {
    expect(
      simulate([
        { state: 'idle', isDraggingHandle: false },
        { state: 'editingPoint', isDraggingHandle: false },
        { state: 'idle', isDraggingHandle: false },
      ]),
    ).toEqual(['disable', 'enable']);
  });

  it('idle → drawBezier → idle produces disable then enable', () => {
    expect(
      simulate([
        { state: 'idle', isDraggingHandle: false },
        { state: 'drawBezier', isDraggingHandle: false },
        { state: 'idle', isDraggingHandle: false },
      ]),
    ).toEqual(['disable', 'enable']);
  });

  it('drawPolyline stays enabled throughout', () => {
    expect(
      simulate([
        { state: 'idle', isDraggingHandle: false },
        { state: 'drawPolyline', isDraggingHandle: false },
        { state: 'drawPolyline', isDraggingHandle: false },
        { state: 'idle', isDraggingHandle: false },
      ]),
    ).toEqual([]);
  });

  it('dragging handle mid-polyline disables, then re-enables', () => {
    expect(
      simulate([
        { state: 'drawPolyline', isDraggingHandle: false },
        { state: 'drawPolyline', isDraggingHandle: true },
        { state: 'drawPolyline', isDraggingHandle: false },
      ]),
    ).toEqual(['disable', 'enable']);
  });
});

describe('installDragPanSync', () => {
  function actorStub(initialState = 'idle') {
    let snapshot = {
      value: initialState,
      context: { selectedEntityId: null, isDraggingHandle: false },
    };
    let listener: (() => void) | null = null;
    const unsubscribe = vi.fn();
    return {
      getSnapshot: vi.fn(() => snapshot),
      subscribe: vi.fn((fn: () => void) => {
        listener = fn;
        return { unsubscribe };
      }),
      setSnapshot(next: typeof snapshot) {
        snapshot = next;
        listener?.();
      },
      unsubscribe,
    };
  }

  it('disables and enables map dragPan across actor transitions', () => {
    const actor = actorStub('idle');
    const map = { dragPan: { disable: vi.fn(), enable: vi.fn() } };
    const disabledRef = { current: false };

    const cleanup = installDragPanSync(map as never, actor as never, disabledRef);
    expect(map.dragPan.disable).not.toHaveBeenCalled();
    expect(map.dragPan.enable).not.toHaveBeenCalled();

    actor.setSnapshot({
      value: 'editingPoint',
      context: { selectedEntityId: null, isDraggingHandle: false },
    });
    expect(disabledRef.current).toBe(true);
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);

    actor.setSnapshot({
      value: 'idle',
      context: { selectedEntityId: null, isDraggingHandle: false },
    });
    expect(disabledRef.current).toBe(false);
    expect(map.dragPan.enable).toHaveBeenCalledTimes(1);

    cleanup();
    expect(actor.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reacts to boundary brush UI changes and skips redundant calls', () => {
    const actor = actorStub('idle');
    const map = { dragPan: { disable: vi.fn(), enable: vi.fn() } };
    const disabledRef = { current: false };

    const cleanup = installDragPanSync(map as never, actor as never, disabledRef);

    useUIStore.getState().toggleBoundaryBrush();
    expect(disabledRef.current).toBe(true);
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);

    actor.setSnapshot({
      value: 'drawBezier',
      context: { selectedEntityId: null, isDraggingHandle: false },
    });
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);

    useUIStore.getState().exitBoundaryBrush();
    expect(disabledRef.current).toBe(true);
    expect(map.dragPan.enable).not.toHaveBeenCalled();

    actor.setSnapshot({
      value: 'idle',
      context: { selectedEntityId: null, isDraggingHandle: false },
    });
    expect(disabledRef.current).toBe(false);
    expect(map.dragPan.enable).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
