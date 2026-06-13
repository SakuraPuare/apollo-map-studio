/**
 * R1 regression test — verify undo/redo flushes FSM state before time-traveling.
 *
 * Bug: zundo only partializes `mapStore.entities`. Ctrl+Z mid-draw rolls back
 * entities while FSM still holds stale drawPoints/dragPointIndex. Next
 * CONFIRM/DRAG_END writes corrupted data.
 *
 * Fix: dispatcher wraps undo/redo to send { type: 'CANCEL' } to the FSM
 * actor first. This unit test guards the ordering — CANCEL must be observed
 * strictly before temporal.undo/redo is invoked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the temporal/store singletons before importing the dispatcher so the
// module-level references resolve to our spies.
const temporalUndo = vi.fn();
const temporalRedo = vi.fn();

vi.mock('@/store/mapStore', () => ({
  useMapStore: Object.assign(
    vi.fn(() => ({ entities: new Map() })),
    {
      getState: vi.fn(() => ({ entities: new Map() })),
      temporal: {
        getState: vi.fn(() => ({
          undo: temporalUndo,
          redo: temporalRedo,
        })),
      },
    },
  ),
}));

vi.mock('@/store/uiStore', () => ({
  useUIStore: Object.assign(
    vi.fn(() => false),
    {
      getState: vi.fn(() => ({
        appMode: 'drawing',
        toggleGrid: vi.fn(),
        toggleSnap: vi.fn(),
        connectMode: { active: false },
        boundaryBrush: { active: false },
      })),
    },
  ),
}));

vi.mock('@/lib/editable-guard', () => ({
  assertEditable: vi.fn(() => true),
}));

describe('R1 undo/redo FSM closure', () => {
  beforeEach(() => {
    temporalUndo.mockClear();
    temporalRedo.mockClear();
  });

  it('sends CANCEL to the FSM actor before calling temporal.undo()', async () => {
    const callLog: string[] = [];

    const actorRef = {
      send: vi.fn((event: { type: string }) => {
        callLog.push(`send:${event.type}`);
      }),
      getSnapshot: vi.fn(() => ({ value: 'drawPolyline', context: {} })),
    };

    temporalUndo.mockImplementation(() => {
      callLog.push('temporal.undo');
    });
    temporalRedo.mockImplementation(() => {
      callLog.push('temporal.redo');
    });

    const { buildActionHandlers, createActionExecutor } = await import('../useActionDispatcher');
    const execute = createActionExecutor(
      buildActionHandlers({
        actorRef: actorRef as never,
        onOpenCommandPalette: vi.fn(),
        onOpenSettings: vi.fn(),
        onOpenAbout: vi.fn(),
        onResetLayout: vi.fn(),
        onToggleWorkspaceView: vi.fn(),
        getWorkspaceViewState: vi.fn(() => false),
      }),
    );

    execute('undo');
    expect(callLog).toEqual(['send:CANCEL', 'temporal.undo']);

    callLog.length = 0;
    execute('redo');
    expect(callLog).toEqual(['send:CANCEL', 'temporal.redo']);
  });

  it('idle-state undo still invokes temporal.undo (CANCEL is a no-op in idle)', async () => {
    const sendCalls: { type: string }[] = [];
    const actorRef = {
      send: vi.fn((e) => sendCalls.push(e)),
      getSnapshot: vi.fn(() => ({ value: 'idle', context: {} })),
    };

    const { buildActionHandlers, createActionExecutor } = await import('../useActionDispatcher');
    const execute = createActionExecutor(
      buildActionHandlers({
        actorRef: actorRef as never,
        onOpenCommandPalette: vi.fn(),
        onOpenSettings: vi.fn(),
        onOpenAbout: vi.fn(),
        onResetLayout: vi.fn(),
        onToggleWorkspaceView: vi.fn(),
        getWorkspaceViewState: vi.fn(() => false),
      }),
    );

    execute('undo');
    expect(sendCalls).toEqual([{ type: 'CANCEL' }]);
    expect(temporalUndo).toHaveBeenCalledTimes(1);
  });
});
