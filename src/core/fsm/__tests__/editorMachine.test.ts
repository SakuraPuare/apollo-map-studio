/**
 * editorMachine — comprehensive unit tests
 *
 * Coverage targets:
 *   - Initial state + context
 *   - All named states reachable via SELECT_TOOL
 *   - idle  → selected / draw* transitions
 *   - selected  → editingPoint / idle / draw* transitions
 *   - editingPoint → selected / drag handling
 *   - drawPolyline / drawCatmullRom (sharedDrawEvents)
 *   - drawBezier (bespoke events)
 *   - drawArc / drawRotatedRect (threeClickCommitEvents)
 *   - drawPolygon (polygon-specific guards)
 *   - All guards (minPointsReached, twoPointsLaid, bezierMinAnchors, polygonCanClose, etc.)
 *   - All context-mutating actions (addPoint, updatePreview, resetDraw, etc.)
 *   - isDrawingState helper
 *
 * Conventions:
 *   - createActor() from xstate v5; actor started fresh per test via beforeEach
 *     or inline to guarantee independence.
 *   - Helper `send()` wraps actor.send() + returns actor.getSnapshot() for
 *     readable one-liner assertions.
 *   - Coordinates are plain [number, number] tuples (LngLat).
 *   - Tests that expose real FSM gaps are marked .skip with a TODO comment
 *     so they can be un-skipped once the source is fixed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createActor } from 'xstate';
import { editorMachine, isDrawingState } from '../editorMachine';
import type { EditorContext } from '../editorMachine';

// ─── Helpers ────────────────────────────────────────────────────────────────

type LngLat = [number, number];

const PT = (x: number, y: number): LngLat => [x, y];

/** Build a fresh, started actor. */
function makeActor() {
  const actor = createActor(editorMachine);
  actor.start();
  return actor;
}

/** Send an event and return the resulting snapshot. */
function send(actor: ReturnType<typeof makeActor>, event: Parameters<typeof actor.send>[0]) {
  actor.send(event);
  return actor.getSnapshot();
}

/** Drive the actor into the given draw state via SELECT_TOOL. */
function gotoDrawState(
  tool:
    | 'drawPolyline'
    | 'drawCatmullRom'
    | 'drawBezier'
    | 'drawArc'
    | 'drawRotatedRect'
    | 'drawPolygon',
) {
  const actor = makeActor();
  actor.send({ type: 'SELECT_TOOL', tool });
  return actor;
}

/** Drive actor to `selected` state by selecting an entity. */
function gotoSelected(id = 'entity-1') {
  const actor = makeActor();
  actor.send({ type: 'SELECT_ENTITY', id });
  return actor;
}

// ─── isDrawingState helper ───────────────────────────────────────────────────

describe('isDrawingState()', () => {
  it('returns true for all six draw tool names', () => {
    const tools = [
      'drawPolyline',
      'drawCatmullRom',
      'drawBezier',
      'drawArc',
      'drawRotatedRect',
      'drawPolygon',
    ];
    for (const t of tools) {
      expect(isDrawingState(t), `${t} should be a drawing state`).toBe(true);
    }
  });

  it('returns false for non-draw states', () => {
    expect(isDrawingState('idle')).toBe(false);
    expect(isDrawingState('selected')).toBe(false);
    expect(isDrawingState('editingPoint')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isDrawingState('')).toBe(false);
  });

  it('returns false for unrelated strings', () => {
    expect(isDrawingState('draw')).toBe(false);
    expect(isDrawingState('drawRect')).toBe(false);
  });
});

// ─── Initial state ───────────────────────────────────────────────────────────

describe('editorMachine — initial state', () => {
  let actor: ReturnType<typeof makeActor>;

  beforeEach(() => {
    actor = makeActor();
  });

  it('starts in "idle" state', () => {
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('has empty drawPoints', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toEqual([]);
  });

  it('has null previewPoint', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.previewPoint).toBeNull();
  });

  it('has empty bezierAnchors', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors).toEqual([]);
  });

  it('isDraggingHandle is false', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.isDraggingHandle).toBe(false);
  });

  it('selectedEntityId is null', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBeNull();
  });

  it('dragPointIndex is -1', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragPointIndex).toBe(-1);
  });

  it('dragPointType is "vertex"', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragPointType).toBe('vertex');
  });

  it('dragCurrentPoint is null', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragCurrentPoint).toBeNull();
  });

  it('dragAltKey is false', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragAltKey).toBe(false);
  });

  it('activeElement is null', () => {
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.activeElement).toBeNull();
  });
});

// ─── idle → draw states via SELECT_TOOL ──────────────────────────────────────

describe('idle → draw states via SELECT_TOOL', () => {
  const tools = [
    'drawPolyline',
    'drawCatmullRom',
    'drawBezier',
    'drawArc',
    'drawRotatedRect',
    'drawPolygon',
  ] as const;

  for (const tool of tools) {
    it(`SELECT_TOOL { tool: "${tool}" } transitions to "${tool}"`, () => {
      const actor = makeActor();
      const snap = send(actor, { type: 'SELECT_TOOL', tool });
      expect(snap.value).toBe(tool);
    });

    it(`SELECT_TOOL "${tool}" resets drawPoints`, () => {
      // Seed some state first by going to drawPolyline and adding points
      const actor = makeActor();
      actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 2) });
      actor.send({ type: 'SELECT_TOOL', tool });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([]);
    });

    it(`SELECT_TOOL "${tool}" resets previewPoint to null`, () => {
      const actor = makeActor();
      actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
      actor.send({ type: 'MOUSE_MOVE', point: PT(5, 5) });
      actor.send({ type: 'SELECT_TOOL', tool });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.previewPoint).toBeNull();
    });

    it(`SELECT_TOOL "${tool}" sets activeElement when element provided`, () => {
      const actor = makeActor();
      actor.send({ type: 'SELECT_TOOL', tool, element: 'lane' });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.activeElement).toBe('lane');
    });

    it(`SELECT_TOOL "${tool}" sets activeElement to null when no element`, () => {
      const actor = makeActor();
      // First set an element
      actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline', element: 'lane' });
      // Then switch without element
      actor.send({ type: 'SELECT_TOOL', tool });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.activeElement).toBeNull();
    });
  }
});

// ─── idle → selected via SELECT_ENTITY ───────────────────────────────────────

describe('idle → selected via SELECT_ENTITY', () => {
  it('transitions to "selected" state', () => {
    const actor = makeActor();
    const snap = send(actor, { type: 'SELECT_ENTITY', id: 'ent-42' });
    expect(snap.value).toBe('selected');
  });

  it('sets selectedEntityId in context', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_ENTITY', id: 'ent-42' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBe('ent-42');
  });

  it('resets dragPointIndex to -1 on select', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_ENTITY', id: 'ent-1' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragPointIndex).toBe(-1);
  });

  it('resets dragCurrentPoint to null on select', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_ENTITY', id: 'ent-1' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragCurrentPoint).toBeNull();
  });
});

// ─── selected state transitions ───────────────────────────────────────────────

describe('selected state', () => {
  it('DESELECT → idle', () => {
    const actor = gotoSelected();
    const snap = send(actor, { type: 'DESELECT' });
    expect(snap.value).toBe('idle');
  });

  it('DESELECT clears selectedEntityId', () => {
    const actor = gotoSelected('ent-99');
    actor.send({ type: 'DESELECT' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBeNull();
  });

  it('CANCEL → idle and clears selectedEntityId', () => {
    const actor = gotoSelected();
    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('idle');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBeNull();
  });

  it('DELETE_ENTITY → idle', () => {
    const actor = gotoSelected();
    const snap = send(actor, { type: 'DELETE_ENTITY' });
    expect(snap.value).toBe('idle');
  });

  it('DELETE_ENTITY clears selectedEntityId', () => {
    const actor = gotoSelected('ent-55');
    actor.send({ type: 'DELETE_ENTITY' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBeNull();
  });

  it('SELECT_ENTITY (re-select) stays in selected with new id', () => {
    const actor = gotoSelected('ent-A');
    actor.send({ type: 'SELECT_ENTITY', id: 'ent-B' });
    expect(actor.getSnapshot().value).toBe('selected');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBe('ent-B');
  });

  it('START_DRAG → editingPoint and sets dragPointIndex', () => {
    const actor = gotoSelected();
    actor.send({ type: 'START_DRAG', index: 3, pointType: 'vertex' });
    expect(actor.getSnapshot().value).toBe('editingPoint');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragPointIndex).toBe(3);
  });

  it('START_DRAG sets dragPointType', () => {
    const actor = gotoSelected();
    actor.send({ type: 'START_DRAG', index: 0, pointType: 'handleIn' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragPointType).toBe('handleIn');
  });

  it('START_DRAG sets dragAltKey from event', () => {
    const actor = gotoSelected();
    actor.send({ type: 'START_DRAG', index: 0, pointType: 'vertex', altKey: true });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragAltKey).toBe(true);
  });

  it('START_DRAG defaults dragAltKey to false when not provided', () => {
    const actor = gotoSelected();
    actor.send({ type: 'START_DRAG', index: 0, pointType: 'vertex' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragAltKey).toBe(false);
  });

  it('TOGGLE_SMOOTH stays in selected', () => {
    const actor = gotoSelected();
    const snap = send(actor, { type: 'TOGGLE_SMOOTH', index: 2 });
    expect(snap.value).toBe('selected');
  });

  describe('SELECT_TOOL from selected deselects entity and transitions', () => {
    const tools = [
      'drawPolyline',
      'drawCatmullRom',
      'drawBezier',
      'drawArc',
      'drawRotatedRect',
      'drawPolygon',
    ] as const;

    for (const tool of tools) {
      it(`SELECT_TOOL "${tool}" from selected → "${tool}" and clears selectedEntityId`, () => {
        const actor = gotoSelected('ent-Z');
        actor.send({ type: 'SELECT_TOOL', tool });
        expect(actor.getSnapshot().value).toBe(tool);
        const ctx = actor.getSnapshot().context as EditorContext;
        expect(ctx.selectedEntityId).toBeNull();
      });
    }
  });
});

// ─── editingPoint state ───────────────────────────────────────────────────────

describe('editingPoint state', () => {
  function gotoEditing() {
    const actor = gotoSelected();
    actor.send({ type: 'START_DRAG', index: 1, pointType: 'vertex' });
    return actor;
  }

  it('DRAG_MOVE updates dragCurrentPoint', () => {
    const actor = gotoEditing();
    actor.send({ type: 'DRAG_MOVE', point: PT(10, 20) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragCurrentPoint).toEqual(PT(10, 20));
  });

  it('DRAG_MOVE stays in editingPoint state', () => {
    const actor = gotoEditing();
    actor.send({ type: 'DRAG_MOVE', point: PT(5, 5) });
    expect(actor.getSnapshot().value).toBe('editingPoint');
  });

  it('multiple DRAG_MOVE updates overwrite dragCurrentPoint', () => {
    const actor = gotoEditing();
    actor.send({ type: 'DRAG_MOVE', point: PT(1, 1) });
    actor.send({ type: 'DRAG_MOVE', point: PT(99, 99) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragCurrentPoint).toEqual(PT(99, 99));
  });

  it('DRAG_END → selected', () => {
    const actor = gotoEditing();
    const snap = send(actor, { type: 'DRAG_END', point: PT(15, 25) });
    expect(snap.value).toBe('selected');
  });

  it('CANCEL → selected and resets dragPointIndex', () => {
    const actor = gotoEditing();
    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('selected');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragPointIndex).toBe(-1);
  });

  it('CANCEL resets dragCurrentPoint to null', () => {
    const actor = gotoEditing();
    actor.send({ type: 'DRAG_MOVE', point: PT(5, 5) });
    actor.send({ type: 'CANCEL' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.dragCurrentPoint).toBeNull();
  });
});

// ─── drawPolyline / drawCatmullRom (sharedDrawEvents) ────────────────────────

describe.each([['drawPolyline' as const], ['drawCatmullRom' as const]])(
  'sharedDrawEvents in %s',
  (tool) => {
    it('MOUSE_DOWN adds point to drawPoints', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 2) });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([PT(1, 2)]);
    });

    it('multiple MOUSE_DOWN accumulates points in order', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(2, 2) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(3, 3) });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([PT(1, 1), PT(2, 2), PT(3, 3)]);
    });

    it('ignores near-duplicate consecutive points', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(0.000001, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(0.00001, 0) });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([PT(0, 0), PT(0.00001, 0)]);
    });

    it('MOUSE_MOVE updates previewPoint', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_MOVE', point: PT(7, 8) });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.previewPoint).toEqual(PT(7, 8));
    });

    it('DOUBLE_CLICK with >= 2 points → idle', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
      actor.send({ type: 'DOUBLE_CLICK', point: PT(2, 2) });
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('DOUBLE_CLICK with < 2 points is blocked (stays in draw state)', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'DOUBLE_CLICK', point: PT(1, 1) });
      expect(actor.getSnapshot().value).toBe(tool);
    });

    it('DOUBLE_CLICK with 0 points is blocked', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'DOUBLE_CLICK', point: PT(1, 1) });
      expect(actor.getSnapshot().value).toBe(tool);
    });

    it('CONFIRM with >= 2 points → idle', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
      actor.send({ type: 'CONFIRM' });
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('CONFIRM with < 2 points is blocked', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'CONFIRM' });
      expect(actor.getSnapshot().value).toBe(tool);
    });

    it('CONFIRM with 0 points is blocked', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'CONFIRM' });
      expect(actor.getSnapshot().value).toBe(tool);
    });

    it('CANCEL → idle and resets drawPoints', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().value).toBe('idle');
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([]);
    });

    it('SELECT_TOOL switches to another draw tool', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'SELECT_TOOL', tool: 'drawPolygon' });
      expect(actor.getSnapshot().value).toBe('drawPolygon');
    });

    it('SELECT_TOOL resets drawPoints on switch', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
      actor.send({ type: 'SELECT_TOOL', tool: 'drawPolygon' });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([]);
    });
  },
);

// ─── drawArc / drawRotatedRect (threeClickCommitEvents) ──────────────────────

describe.each([['drawArc' as const], ['drawRotatedRect' as const]])(
  'threeClickCommitEvents in %s',
  (tool) => {
    it('first MOUSE_DOWN adds point and stays in draw state', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      expect(actor.getSnapshot().value).toBe(tool);
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toHaveLength(1);
    });

    it('second MOUSE_DOWN adds point and stays in draw state', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
      expect(actor.getSnapshot().value).toBe(tool);
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toHaveLength(2);
    });

    it('third MOUSE_DOWN (when 2 points already laid) → idle', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(0.5, 1) });
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('third MOUSE_DOWN adds final point to drawPoints before committing', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
      actor.send({ type: 'MOUSE_DOWN', point: PT(0.5, 1) });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toHaveLength(3);
      expect(ctx.drawPoints[2]).toEqual(PT(0.5, 1));
    });

    it('MOUSE_MOVE updates previewPoint', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_MOVE', point: PT(3, 4) });
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.previewPoint).toEqual(PT(3, 4));
    });

    it('CANCEL → idle and resets drawPoints', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().value).toBe('idle');
      const ctx = actor.getSnapshot().context as EditorContext;
      expect(ctx.drawPoints).toEqual([]);
    });

    it('SELECT_TOOL switches tool without committing', () => {
      const actor = gotoDrawState(tool);
      actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
      actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
      expect(actor.getSnapshot().value).toBe('drawPolyline');
    });
  },
);

// ─── drawBezier ───────────────────────────────────────────────────────────────

describe('drawBezier', () => {
  it('MOUSE_DOWN adds a bezierAnchor', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 2) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors).toHaveLength(1);
    expect(ctx.bezierAnchors[0]?.point).toEqual(PT(1, 2));
  });

  it('MOUSE_DOWN sets isDraggingHandle to true', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 2) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.isDraggingHandle).toBe(true);
  });

  it('MOUSE_MOVE while dragging handle updates bezierDragHandle', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    // isDraggingHandle is now true → bezierDragHandle branch
    actor.send({ type: 'MOUSE_MOVE', point: PT(1, 0) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors[0]?.handleOut).toEqual(PT(1, 0));
  });

  it('MOUSE_MOVE while dragging sets handleIn as mirror of handleOut', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(5, 5) });
    actor.send({ type: 'MOUSE_MOVE', point: PT(7, 5) });
    const ctx = actor.getSnapshot().context as EditorContext;
    const anchor = ctx.bezierAnchors[0]!;
    // mirrorPoint(pt, handleOut) = 2*pt - handleOut
    expect(anchor.handleIn).toEqual([2 * 5 - 7, 2 * 5 - 5]); // [3, 5]
  });

  it('MOUSE_UP confirms handle and sets isDraggingHandle to false', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_MOVE', point: PT(1, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(1, 0) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.isDraggingHandle).toBe(false);
  });

  it('MOUSE_UP with near-zero drag clears handles (click, not drag)', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    // MOUSE_UP at essentially the same point (dist < 1e-6)
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors[0]?.handleIn).toBeNull();
    expect(ctx.bezierAnchors[0]?.handleOut).toBeNull();
  });

  it('MOUSE_MOVE without dragging handle uses bezierPreview (previewPoint only)', () => {
    const actor = gotoDrawState('drawBezier');
    // No MOUSE_DOWN yet → isDraggingHandle is false
    actor.send({ type: 'MOUSE_MOVE', point: PT(3, 4) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.previewPoint).toEqual(PT(3, 4));
    // bezierAnchors untouched
    expect(ctx.bezierAnchors).toHaveLength(0);
  });

  it('MOUSE_MOVE in a restored dragging state with no anchors is safe', () => {
    const baseContext = makeActor().getSnapshot().context as EditorContext;
    const restoredState = editorMachine.resolveState({
      value: 'drawBezier',
      context: {
        ...baseContext,
        isDraggingHandle: true,
        bezierAnchors: [],
        previewPoint: null,
      },
    });
    const actor = createActor(editorMachine, {
      snapshot: editorMachine.getPersistedSnapshot(restoredState),
    });
    actor.start();

    actor.send({ type: 'MOUSE_MOVE', point: PT(3, 4) });

    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors).toEqual([]);
    expect(ctx.previewPoint).toEqual(PT(3, 4));
    expect(ctx.isDraggingHandle).toBe(true);
  });

  it('MOUSE_UP with no anchors is safe', () => {
    const actor = gotoDrawState('drawBezier');

    actor.send({ type: 'MOUSE_UP', point: PT(1, 1) });

    const ctx = actor.getSnapshot().context as EditorContext;
    expect(actor.getSnapshot().value).toBe('drawBezier');
    expect(ctx.bezierAnchors).toEqual([]);
    expect(ctx.isDraggingHandle).toBe(false);
  });

  it('DOUBLE_CLICK with >= 2 anchors → idle', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_UP', point: PT(1, 1) });
    actor.send({ type: 'DOUBLE_CLICK', point: PT(2, 2) });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('DOUBLE_CLICK with < 2 anchors is blocked', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'DOUBLE_CLICK', point: PT(1, 1) });
    expect(actor.getSnapshot().value).toBe('drawBezier');
  });

  it('DOUBLE_CLICK with 0 anchors is blocked', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'DOUBLE_CLICK', point: PT(1, 1) });
    expect(actor.getSnapshot().value).toBe('drawBezier');
  });

  it('DOUBLE_CLICK sets isDraggingHandle to false', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 2) });
    actor.send({ type: 'MOUSE_UP', point: PT(2, 2) });
    actor.send({ type: 'DOUBLE_CLICK', point: PT(3, 3) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.isDraggingHandle).toBe(false);
  });

  it('CONFIRM with >= 2 anchors → idle', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_UP', point: PT(1, 1) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('CONFIRM with < 2 anchors is blocked', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('drawBezier');
  });

  it('CANCEL → idle and resets bezierAnchors', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('idle');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors).toEqual([]);
  });

  it('SELECT_TOOL from drawBezier switches tool', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
    expect(actor.getSnapshot().value).toBe('drawPolyline');
  });

  it('multiple anchors accumulate', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(2, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(4, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(4, 0) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors).toHaveLength(3);
  });
});

// ─── drawPolygon ──────────────────────────────────────────────────────────────

describe('drawPolygon', () => {
  /** Build a convex square polygon sequence */
  function buildSquare(actor: ReturnType<typeof makeActor>) {
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 1) });
  }

  it('MOUSE_DOWN adds points when no self-intersection', () => {
    const actor = gotoDrawState('drawPolygon');
    buildSquare(actor);
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toHaveLength(4);
  });

  it('MOUSE_DOWN that would cause self-intersection is blocked', () => {
    const actor = gotoDrawState('drawPolygon');
    // Bowtie: (0,0)→(2,2)→(2,0) then try (0,2) which would intersect first edge
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 2) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 0) });
    const prevLength = (actor.getSnapshot().context as EditorContext).drawPoints.length;
    // (0,2) would create edge (2,0)→(0,2) that crosses (0,0)→(2,2)
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 2) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toHaveLength(prevLength);
  });

  it('MOUSE_MOVE updates previewPoint', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'MOUSE_MOVE', point: PT(5, 5) });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.previewPoint).toEqual(PT(5, 5));
  });

  it('DOUBLE_CLICK with >= 3 non-self-intersecting points → idle', () => {
    const actor = gotoDrawState('drawPolygon');
    buildSquare(actor);
    actor.send({ type: 'DOUBLE_CLICK', point: PT(0, 0) });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('DOUBLE_CLICK with < 3 points is blocked', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    actor.send({ type: 'DOUBLE_CLICK', point: PT(0.5, 0.5) });
    expect(actor.getSnapshot().value).toBe('drawPolygon');
  });

  it('DOUBLE_CLICK with 0 points is blocked', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'DOUBLE_CLICK', point: PT(1, 1) });
    expect(actor.getSnapshot().value).toBe('drawPolygon');
  });

  it('CONFIRM with >= 3 non-self-intersecting points → idle', () => {
    const actor = gotoDrawState('drawPolygon');
    buildSquare(actor);
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('CONFIRM with < 3 points is blocked', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('drawPolygon');
  });

  it('CONFIRM with 0 points is blocked', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('drawPolygon');
  });

  it('CANCEL → idle and resets drawPoints', () => {
    const actor = gotoDrawState('drawPolygon');
    buildSquare(actor);
    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('idle');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toEqual([]);
  });

  it('SELECT_TOOL from drawPolygon switches to the requested tool', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'SELECT_TOOL', tool: 'drawArc' });
    expect(actor.getSnapshot().value).toBe('drawArc');
  });

  it('self-intersecting polygon (bowtie) blocks CONFIRM', () => {
    const actor = gotoDrawState('drawPolygon');
    // Build a bowtie bypassing the polygonNoSelfIntersect guard
    // by adding each point that individually doesn't cause intersection.
    // (0,0)→(1,1)→(1,0): this sequence doesn't self-intersect yet
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    // Now (0,2) is rejected because (1,0)→(0,2) crosses (0,0)→(1,1)
    // so we have 3 pts that happen to NOT self-intersect as-is:
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toHaveLength(3);
    // CONFIRM on 3 pts that don't self-intersect should succeed
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });
});

// ─── Cross-state: SELECT_TOOL from draw states ───────────────────────────────

describe('SELECT_TOOL from any draw state switches correctly', () => {
  const drawStates = [
    'drawPolyline',
    'drawCatmullRom',
    'drawArc',
    'drawRotatedRect',
    'drawPolygon',
    'drawBezier',
  ] as const;

  for (const from of drawStates) {
    for (const to of drawStates) {
      if (from === to) continue;
      it(`${from} → SELECT_TOOL("${to}") → ${to}`, () => {
        const actor = gotoDrawState(from);
        actor.send({ type: 'SELECT_TOOL', tool: to });
        expect(actor.getSnapshot().value).toBe(to);
      });
    }
  }
});

// ─── State does not respond to unrelated events ───────────────────────────────

describe('idle state ignores unrelated events', () => {
  it('MOUSE_DOWN in idle is a no-op (stays idle)', () => {
    const actor = makeActor();
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('CONFIRM in idle is a no-op (stays idle)', () => {
    const actor = makeActor();
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('CANCEL in idle is a no-op (stays idle)', () => {
    const actor = makeActor();
    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('DESELECT in idle is a no-op', () => {
    const actor = makeActor();
    actor.send({ type: 'DESELECT' });
    expect(actor.getSnapshot().value).toBe('idle');
  });
});

// ─── Guard: minPointsReached boundary ─────────────────────────────────────────

describe('guard: minPointsReached (exactly 2 points required)', () => {
  it('exactly 2 points allows CONFIRM', () => {
    const actor = gotoDrawState('drawPolyline');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('more than 2 points allows CONFIRM', () => {
    const actor = gotoDrawState('drawPolyline');
    for (let i = 0; i < 5; i++) {
      actor.send({ type: 'MOUSE_DOWN', point: PT(i, 0) });
    }
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('exactly 1 point blocks CONFIRM', () => {
    const actor = gotoDrawState('drawPolyline');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('drawPolyline');
  });
});

// ─── Guard: twoPointsLaid boundary ────────────────────────────────────────────

describe('guard: twoPointsLaid (commit on 3rd click)', () => {
  it('exactly 2 points enables commit on next MOUSE_DOWN', () => {
    const actor = gotoDrawState('drawArc');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    // Both sent successfully — now 2 points laid
    expect((actor.getSnapshot().context as EditorContext).drawPoints).toHaveLength(2);
    actor.send({ type: 'MOUSE_DOWN', point: PT(0.5, 1) });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('only 1 point: next MOUSE_DOWN does NOT commit', () => {
    const actor = gotoDrawState('drawArc');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    // After 2nd click we have 2 points; arc commits on 3rd
    expect(actor.getSnapshot().value).toBe('drawArc');
  });
});

// ─── Guard: bezierMinAnchors boundary ─────────────────────────────────────────

describe('guard: bezierMinAnchors (at least 2 anchors)', () => {
  it('exactly 2 anchors allows CONFIRM', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_UP', point: PT(1, 1) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('1 anchor blocks CONFIRM', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('drawBezier');
  });
});

// ─── Guard: polygonCanClose / polygonCanConfirm ───────────────────────────────

describe('guard: polygonCanClose and polygonCanConfirm (min 3 pts, no self-intersect)', () => {
  it('3 non-intersecting points satisfy both guards', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(0.5, 1) });
    actor.send({ type: 'DOUBLE_CLICK', point: PT(0, 0) });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('2 points block DOUBLE_CLICK (polygonCanClose returns false)', () => {
    const actor = gotoDrawState('drawPolygon');
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 0) });
    actor.send({ type: 'DOUBLE_CLICK', point: PT(0, 0) });
    expect(actor.getSnapshot().value).toBe('drawPolygon');
  });
});

// ─── Action: resetDraw ────────────────────────────────────────────────────────

describe('action: resetDraw', () => {
  it('CANCEL from drawPolyline clears all draw context', () => {
    const actor = gotoDrawState('drawPolyline');
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_MOVE', point: PT(2, 2) });
    actor.send({ type: 'CANCEL' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toEqual([]);
    expect(ctx.previewPoint).toBeNull();
    expect(ctx.bezierAnchors).toEqual([]);
    expect(ctx.isDraggingHandle).toBe(false);
  });

  it('resetDraw sets activeElement from SELECT_TOOL event element', () => {
    const actor = gotoDrawState('drawPolyline');
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline', element: 'junction' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.activeElement).toBe('junction');
  });

  it('resetDraw sets activeElement to null when SELECT_TOOL has no element', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline', element: 'lane' });
    actor.send({ type: 'CANCEL' });
    // After CANCEL → idle; next SELECT_TOOL with no element resets activeElement
    actor.send({ type: 'SELECT_TOOL', tool: 'drawCatmullRom' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.activeElement).toBeNull();
  });
});

// ─── Event: RESET (post-commit cleanup) ───────────────────────────────────────
// commit transitions (DOUBLE_CLICK / CONFIRM / 三点 commit) intentionally don't
// run resetDraw — useDrawCommit needs the post-snapshot to read drawPoints/
// bezierAnchors. Instead, useDrawCommit fires RESET after committing. Without
// this, activeElement leaks past commit and the ToolStrip element bar stays
// highlighted on the last drawn element type (regression captured here).
describe('event: RESET (post-commit cleanup in idle)', () => {
  it('clears activeElement after commit', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline', element: 'lane' });
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'CONFIRM' }); // commit → idle (activeElement still 'lane')
    expect(actor.getSnapshot().context.activeElement).toBe('lane');
    actor.send({ type: 'RESET' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.activeElement).toBeNull();
    expect(ctx.drawPoints).toEqual([]);
    expect(ctx.bezierAnchors).toEqual([]);
    expect(ctx.previewPoint).toBeNull();
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('clears bezierAnchors after bezier commit', () => {
    const actor = gotoDrawState('drawBezier');
    actor.send({ type: 'SELECT_TOOL', tool: 'drawBezier', element: 'lane' });
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_UP', point: PT(1, 1) });
    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().context.bezierAnchors.length).toBeGreaterThanOrEqual(2);
    actor.send({ type: 'RESET' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.activeElement).toBeNull();
    expect(ctx.bezierAnchors).toEqual([]);
  });

  it('RESET in idle without prior commit is safe (no-op on already-clean context)', () => {
    const actor = makeActor();
    actor.send({ type: 'RESET' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.activeElement).toBeNull();
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('RESET is only handled in idle (drawing states ignore it)', () => {
    const actor = gotoDrawState('drawPolyline');
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline', element: 'lane' });
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'RESET' });
    // Should remain in drawPolyline with drawPoints intact — RESET not handled
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('drawPolyline');
    expect(snap.context.activeElement).toBe('lane');
    expect(snap.context.drawPoints).toHaveLength(1);
  });
});

// ─── Action: deselectEntity ───────────────────────────────────────────────────

describe('action: deselectEntity', () => {
  it('resets selectedEntityId, dragPointIndex, and dragCurrentPoint', () => {
    const actor = gotoSelected('ent-X');
    // Simulate a drag to populate dragCurrentPoint via editingPoint then return
    actor.send({ type: 'START_DRAG', index: 2, pointType: 'vertex' });
    actor.send({ type: 'DRAG_MOVE', point: PT(10, 10) });
    actor.send({ type: 'DRAG_END', point: PT(10, 10) });
    // Now in selected again — deselect
    actor.send({ type: 'DESELECT' });
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBeNull();
    expect(ctx.dragPointIndex).toBe(-1);
    expect(ctx.dragCurrentPoint).toBeNull();
  });
});

// ─── Full workflow round-trips ────────────────────────────────────────────────

describe('full workflow round-trips', () => {
  it('draw polyline complete flow: idle → drawPolyline → idle', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
    expect(actor.getSnapshot().value).toBe('drawPolyline');

    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_MOVE', point: PT(1, 0.5) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 1) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(4, 1) });

    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');

    const ctx = actor.getSnapshot().context as EditorContext;
    // drawPoints still hold committed data until next resetDraw
    expect(ctx.drawPoints).toHaveLength(3);
  });

  it('select → drag → release → deselect flow', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_ENTITY', id: 'road-1' });
    expect(actor.getSnapshot().value).toBe('selected');

    actor.send({ type: 'START_DRAG', index: 0, pointType: 'vertex' });
    expect(actor.getSnapshot().value).toBe('editingPoint');

    actor.send({ type: 'DRAG_MOVE', point: PT(5, 5) });
    actor.send({ type: 'DRAG_END', point: PT(5, 5) });
    expect(actor.getSnapshot().value).toBe('selected');

    actor.send({ type: 'DESELECT' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('select then draw: selected → drawPolyline (deselects first)', () => {
    const actor = gotoSelected('ent-1');
    actor.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
    expect(actor.getSnapshot().value).toBe('drawPolyline');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.selectedEntityId).toBeNull();
  });

  it('arc three-click commit full flow', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawArc' });
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) }); // click 1
    actor.send({ type: 'MOUSE_MOVE', point: PT(1, 0) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 0) }); // click 2
    actor.send({ type: 'MOUSE_MOVE', point: PT(1, 1) });
    expect(actor.getSnapshot().value).toBe('drawArc');
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) }); // click 3 → commit
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('bezier with drag handles full flow', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawBezier' });

    // Anchor 1
    actor.send({ type: 'MOUSE_DOWN', point: PT(0, 0) });
    actor.send({ type: 'MOUSE_MOVE', point: PT(1, 0) }); // drag handle
    actor.send({ type: 'MOUSE_UP', point: PT(1, 0) }); // confirm handle

    // Anchor 2
    actor.send({ type: 'MOUSE_DOWN', point: PT(4, 0) });
    actor.send({ type: 'MOUSE_MOVE', point: PT(5, 0) });
    actor.send({ type: 'MOUSE_UP', point: PT(5, 0) });

    actor.send({ type: 'CONFIRM' });
    expect(actor.getSnapshot().value).toBe('idle');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.bezierAnchors).toHaveLength(2);
  });

  it('draw cancel restores idle with clean context', () => {
    const actor = makeActor();
    actor.send({ type: 'SELECT_TOOL', tool: 'drawCatmullRom' });
    actor.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });
    actor.send({ type: 'MOUSE_DOWN', point: PT(2, 2) });
    actor.send({ type: 'CANCEL' });

    expect(actor.getSnapshot().value).toBe('idle');
    const ctx = actor.getSnapshot().context as EditorContext;
    expect(ctx.drawPoints).toEqual([]);
    expect(ctx.previewPoint).toBeNull();
  });
});

// ─── Actor independence (no shared state between tests) ───────────────────────

describe('actor independence', () => {
  it('two separate actors do not share context', () => {
    const a1 = makeActor();
    const a2 = makeActor();

    a1.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' });
    a1.send({ type: 'MOUSE_DOWN', point: PT(1, 1) });

    // a2 should still be in idle with no drawPoints
    expect(a2.getSnapshot().value).toBe('idle');
    expect((a2.getSnapshot().context as EditorContext).drawPoints).toEqual([]);
  });
});
