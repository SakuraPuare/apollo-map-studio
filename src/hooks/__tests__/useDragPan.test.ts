/**
 * Unit tests for useDragPan logic.
 *
 * The hook's only responsibility is managing map.dragPan.disable/enable
 * as a function of FSM snapshot. The decision:
 *
 *   shouldDisable = isDraggingHandle  ||  state === 'editingPoint'  ||  state === 'drawBezier'
 *
 * We test the `shouldDisable` predicate and the idempotency guard
 * (dragPanDisabledRef — avoid redundant enable/disable calls).
 */

import { describe, it, expect } from 'vitest';
import { shouldDisableDragPan as shouldDisable } from '../useDragPan';

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

    it('selected does not disable', () => {
      expect(shouldDisable('selected', false)).toBe(false);
    });
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
