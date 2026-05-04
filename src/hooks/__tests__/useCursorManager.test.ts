/**
 * Unit tests for useCursorManager logic.
 *
 * The hook's sole responsibility is mapping FSM state → CSS cursor string on
 * the MapLibre canvas element. The mapping is:
 *
 *   editingPoint  → 'grabbing'
 *   drawPolyline  → 'crosshair'   (any isDrawingState)
 *   drawBezier    → 'crosshair'
 *   drawArc       → 'crosshair'
 *   drawRotatedRect → 'crosshair'
 *   drawPolygon   → 'crosshair'
 *   drawCatmullRom → 'crosshair'
 *   idle          → ''
 *   selected      → ''
 *
 * We test the mapping logic in isolation using `isDrawingState` from the FSM
 * module (same function used by the hook) and the exact same conditional
 * branches reproduced inline — no React renderer needed.
 */

import { describe, it, expect } from 'vitest';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { cursorForState as applyCursor } from '../useCursorManager';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyCursor (useCursorManager cursor mapping)', () => {
  describe('editingPoint state', () => {
    it('returns grabbing', () => {
      expect(applyCursor('editingPoint')).toBe('grabbing');
    });
  });

  describe('drawing states → crosshair', () => {
    const drawingStates = [
      'drawPolyline',
      'drawCatmullRom',
      'drawBezier',
      'drawArc',
      'drawRotatedRect',
      'drawPolygon',
    ] as const;

    for (const state of drawingStates) {
      it(`${state} returns crosshair`, () => {
        expect(applyCursor(state)).toBe('crosshair');
      });
    }
  });

  describe('non-drawing states → empty string (default MapLibre cursor)', () => {
    const passiveStates = ['idle', 'selected'];

    for (const state of passiveStates) {
      it(`${state} returns ''`, () => {
        expect(applyCursor(state)).toBe('');
      });
    }
  });

  it('unknown/custom state returns empty string', () => {
    expect(applyCursor('someUnknownState')).toBe('');
  });

  it('boundary brush mode returns crosshair in passive states', () => {
    expect(applyCursor('idle', false, true)).toBe('crosshair');
    expect(applyCursor('selected', false, true)).toBe('crosshair');
  });

  it('editingPoint takes priority over any isDrawingState check', () => {
    // editingPoint is NOT a drawing state — it's a separate branch.
    expect(isDrawingState('editingPoint')).toBe(false);
    // The hook checks editingPoint first, so the result is 'grabbing', not ''.
    expect(applyCursor('editingPoint')).toBe('grabbing');
  });
});

// ---------------------------------------------------------------------------
// isDrawingState guard — verify the 6 draw states are recognized
// ---------------------------------------------------------------------------

describe('isDrawingState (imported from editorMachine)', () => {
  const drawTools = [
    'drawPolyline',
    'drawCatmullRom',
    'drawBezier',
    'drawArc',
    'drawRotatedRect',
    'drawPolygon',
  ];

  for (const tool of drawTools) {
    it(`recognizes ${tool} as a drawing state`, () => {
      expect(isDrawingState(tool)).toBe(true);
    });
  }

  it('rejects idle', () => {
    expect(isDrawingState('idle')).toBe(false);
  });

  it('rejects selected', () => {
    expect(isDrawingState('selected')).toBe(false);
  });

  it('rejects editingPoint', () => {
    expect(isDrawingState('editingPoint')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isDrawingState('')).toBe(false);
  });

  it('rejects arbitrary string', () => {
    expect(isDrawingState('flying')).toBe(false);
  });
});
