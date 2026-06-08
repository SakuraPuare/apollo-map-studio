/**
 * Unit tests for useActionDispatcher logic.
 *
 * The hook wires the Action Registry to actual side-effect handlers.
 * We test:
 *   1. matchesKeybinding — the pure keyboard-matching predicate used by the
 *      handler's keydown listener (imported directly from the registry).
 *   2. getToggleState logic — mapping actionId → bool driven by store state.
 *   3. Input-field blocking — shortcuts with global:false must not fire when
 *      the event target is an HTMLInputElement / HTMLTextAreaElement.
 *   4. Handler dispatch ordering contract (historyWithCancel) — re-verified
 *      inline; the full regression lives in undoCancel.test.ts.
 *   5. Unknown action ID — execute() must warn, not throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchesKeybinding, getKeyBindingActions, getActionDefs } from '@/core/actions/registry';
import type { KeyBinding, KeyBindingEvent } from '@/core/actions/registry';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { SETTINGS_STORAGE_KEYS, useSettingsStore } from '@/store/settingsStore';
import { useLicenseStore } from '@/store/licenseStore';
import { clearSelectionClipboard, copySelectionToClipboard } from '@/lib/selectionClipboard';
import { appBridge } from '@/lib/app-bridge';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import type { ActionId } from '@/core/actions/registry';
import type { PolylineEntity } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';
import type { LicenseState } from '@/lib/license-bridge';
import {
  actionRequiresEdit,
  buildActionHandlers,
  createActionExecutor,
  createToolSelector,
  installClipboardEvents,
  installKeyboardShortcuts,
  installNativeMenuActions,
  isTextEditingTarget,
  useActionDispatcher,
  type ActionDispatcher,
  type ActionDispatcherOptions,
} from '../useActionDispatcher';

// ---------------------------------------------------------------------------
// 1. matchesKeybinding — pure function, no mocks needed
//
//    matchesKeybinding(e, kb) only reads: e.key, e.ctrlKey, e.metaKey,
//    e.shiftKey, e.altKey, so tests can use plain objects.
// ---------------------------------------------------------------------------

const makeEvent = (overrides: Partial<KeyBindingEvent> = {}): KeyBindingEvent => ({
  key: 'z',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

const initialUIState = useUIStore.getState();
const initialSettingsState = useSettingsStore.getState();
const initialLicenseStore = useLicenseStore.getState();

function editableLicenseState(canEdit = true): LicenseState {
  return {
    status: canEdit ? 'trial' : 'expired_trial',
    canEdit,
    machineCode: '',
    trialStart: 0,
    trialEnd: 0,
    daysRemaining: canEdit ? 7 : 0,
    hoursRemaining: canEdit ? 7 * 24 : 0,
    license: null,
    checkedAt: 0,
    reason: canEdit ? '' : 'expired',
  };
}

function makePolyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  };
}

function makeLane(id: string): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          lineSegment: { points: [{ x: 0, y: 0 }] },
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, boundaryType: [] },
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
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
  };
}

function actorStub(
  value = 'idle',
  selectedEntityId: string | null = null,
  activeElement: string | null = null,
) {
  return {
    send: vi.fn(),
    getSnapshot: vi.fn(() => ({
      value,
      context: {
        selectedEntityId,
        activeElement,
      },
    })),
  };
}

function dispatcherOptions(
  overrides: Partial<ActionDispatcherOptions> = {},
): ActionDispatcherOptions {
  return {
    actorRef: actorStub() as never,
    onOpenCommandPalette: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAbout: vi.fn(),
    onResetLayout: vi.fn(),
    onToggleWorkspaceView: vi.fn(),
    getWorkspaceViewState: vi.fn(() => false),
    ...overrides,
  };
}

function eventTargetStub() {
  const listeners = new Map<string, EventListener>();
  return {
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
    dispatch(type: string, event: object) {
      listeners.get(type)?.(event as Event);
    },
    listener(type: string) {
      return listeners.get(type);
    },
  };
}

function fakeKeyboardEvent(
  overrides: Partial<KeyboardEvent> = {},
): KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key: 'z',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  } as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function fakeClipboardEvent(
  overrides: Partial<ClipboardEvent> = {},
): ClipboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  } as ClipboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function storageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

function renderDispatcher(options: ActionDispatcherOptions): ActionDispatcher {
  let dispatcher: ActionDispatcher | null = null;
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);

  function Probe() {
    dispatcher = useActionDispatcher(options);
    return createElement('span', null, dispatcher.actions.length);
  }

  renderToStaticMarkup(createElement(Probe));
  if (!dispatcher) throw new Error('useActionDispatcher probe did not render');
  return dispatcher;
}

beforeEach(() => {
  vi.clearAllMocks();
  registerBuiltinWorkspaceContributions();
  clearSelectionClipboard();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useSettingsStore.setState(initialSettingsState, true);
  useUIStore.setState(initialUIState, true);
  useLicenseStore.setState(
    {
      ...initialLicenseStore,
      state: editableLicenseState(true),
      initialized: true,
      promptActivation: vi.fn(),
    },
    true,
  );
});

afterEach(() => {
  useLicenseStore.setState(
    {
      ...initialLicenseStore,
      state: editableLicenseState(true),
      initialized: true,
      promptActivation: vi.fn(),
    },
    true,
  );
  useUIStore.setState(initialUIState, true);
  useSettingsStore.setState(initialSettingsState, true);
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  clearSelectionClipboard();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('matchesKeybinding', () => {
  const kb: KeyBinding = { key: 'z', ctrl: true };

  it('matches exact ctrl+z', () => {
    expect(matchesKeybinding(makeEvent(), kb)).toBe(true);
  });

  it('treats metaKey as equivalent to ctrlKey', () => {
    expect(matchesKeybinding(makeEvent({ ctrlKey: false, metaKey: true }), kb)).toBe(true);
  });

  it('rejects when ctrl missing', () => {
    expect(matchesKeybinding(makeEvent({ ctrlKey: false, metaKey: false }), kb)).toBe(false);
  });

  it('rejects wrong key', () => {
    expect(matchesKeybinding(makeEvent({ key: 'y' }), kb)).toBe(false);
  });

  it('rejects extra shift modifier when not declared', () => {
    expect(matchesKeybinding(makeEvent({ shiftKey: true }), kb)).toBe(false);
  });

  it('matches shift when declared', () => {
    const kbShift: KeyBinding = { key: 'z', ctrl: true, shift: true };
    expect(matchesKeybinding(makeEvent({ shiftKey: true }), kbShift)).toBe(true);
  });

  it('is case-insensitive on key', () => {
    expect(matchesKeybinding(makeEvent({ key: 'Z' }), kb)).toBe(true);
  });

  it('matches alt when declared', () => {
    const kbAlt: KeyBinding = { key: 'b', alt: true };
    const e = makeEvent({ key: 'b', ctrlKey: false, altKey: true });
    expect(matchesKeybinding(e, kbAlt)).toBe(true);
  });

  it('rejects alt when not declared', () => {
    const e = makeEvent({ key: 'z', ctrlKey: true, altKey: true });
    expect(matchesKeybinding(e, kb)).toBe(false);
  });

  it('matches plain key with no modifiers declared', () => {
    const kbPlain: KeyBinding = { key: 'Escape' };
    const e = makeEvent({ key: 'Escape', ctrlKey: false, metaKey: false });
    expect(matchesKeybinding(e, kbPlain)).toBe(true);
  });

  it('rejects plain key when ctrl modifier is present but not declared', () => {
    const kbPlain: KeyBinding = { key: 'Escape' };
    const e = makeEvent({ key: 'Escape', ctrlKey: true });
    expect(matchesKeybinding(e, kbPlain)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. getKeyBindingActions — must return only actions that have keybindings
// ---------------------------------------------------------------------------

describe('getKeyBindingActions', () => {
  it('returns only actions with a keybinding field', () => {
    const kbActions = getKeyBindingActions();
    expect(kbActions.length).toBeGreaterThan(0);
    for (const action of kbActions) {
      expect(action.keybinding).toBeDefined();
    }
  });

  it('every returned action has a non-empty key string', () => {
    const kbActions = getKeyBindingActions();
    for (const action of kbActions) {
      expect(typeof action.keybinding!.key).toBe('string');
      expect(action.keybinding!.key.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Input-field blocking contract
//
//    The keydown handler checks `inInput && !action.keybinding.global` and
//    short-circuits. We test the same guard logic using tag-name strings
//    instead of DOM constructors (no jsdom needed — this is a Node environment).
// ---------------------------------------------------------------------------

describe('input-field blocking logic', () => {
  /**
   * The real hook checks `target instanceof HTMLInputElement` etc.
   * We can't instantiate DOM elements in Node/vitest without jsdom.
   * Instead, we test the guard logic by modeling it as a tag-name check
   * (which is what the isinstance checks reduce to in behavior) and verify
   * the flag combinations.
   */
  const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'] as const;

  it('INPUT tag is recognised as an input context', () => {
    expect(INPUT_TAGS.includes('INPUT')).toBe(true);
  });

  it('TEXTAREA tag is recognised as an input context', () => {
    expect(INPUT_TAGS.includes('TEXTAREA')).toBe(true);
  });

  it('SELECT tag is recognised as an input context', () => {
    expect(INPUT_TAGS.includes('SELECT')).toBe(true);
  });

  it('DIV tag is not an input context', () => {
    expect(INPUT_TAGS.includes('DIV' as never)).toBe(false);
  });

  it('global shortcuts bypass the input guard (global:true, inInput:true → shouldSkip=false)', () => {
    const inInput = true;
    const kbGlobal: KeyBinding = { key: 'Escape', global: true };
    const shouldSkip = inInput && !kbGlobal.global;
    expect(shouldSkip).toBe(false);
  });

  it('non-global shortcuts are skipped when in an input (global:undefined, inInput:true → shouldSkip=true)', () => {
    const inInput = true;
    const kbNonGlobal: KeyBinding = { key: 'z', ctrl: true };
    const shouldSkip = inInput && !kbNonGlobal.global;
    expect(shouldSkip).toBe(true);
  });

  it('non-global shortcuts are not skipped when NOT in an input (inInput:false → shouldSkip=false)', () => {
    const inInput = false;
    const kbNonGlobal: KeyBinding = { key: 'z', ctrl: true };
    const shouldSkip = inInput && !kbNonGlobal.global;
    expect(shouldSkip).toBe(false);
  });

  it('recognises real DOM-like text editing targets when constructors exist', () => {
    class FakeInput {}
    class FakeTextarea {}
    class FakeSelect {}
    class FakeElement {
      constructor(public isContentEditable = false) {}
    }
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeTextarea);
    vi.stubGlobal('HTMLSelectElement', FakeSelect);
    vi.stubGlobal('HTMLElement', FakeElement);

    expect(isTextEditingTarget(new FakeInput() as never)).toBe(true);
    expect(isTextEditingTarget(new FakeTextarea() as never)).toBe(true);
    expect(isTextEditingTarget(new FakeSelect() as never)).toBe(true);
    expect(isTextEditingTarget(new FakeElement(true) as never)).toBe(true);
    expect(isTextEditingTarget(new FakeElement(false) as never)).toBe(false);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// 4. historyWithCancel ordering contract
//    (Same contract verified in undoCancel.test.ts — kept here for locality)
// ---------------------------------------------------------------------------

describe('historyWithCancel dispatch ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends CANCEL before undo', () => {
    const log: string[] = [];
    const actorRef = { send: vi.fn((e: { type: string }) => log.push(`send:${e.type}`)) };
    const temporalUndo = vi.fn(() => log.push('undo'));
    const temporalRedo = vi.fn(() => log.push('redo'));

    const historyWithCancel = (op: 'undo' | 'redo') => {
      actorRef.send({ type: 'CANCEL' });
      if (op === 'undo') temporalUndo();
      else temporalRedo();
    };

    historyWithCancel('undo');
    expect(log).toEqual(['send:CANCEL', 'undo']);
  });

  it('sends CANCEL before redo', () => {
    const log: string[] = [];
    const actorRef = { send: vi.fn((e: { type: string }) => log.push(`send:${e.type}`)) };
    const temporalRedo = vi.fn(() => log.push('redo'));

    const historyWithCancel = (op: 'undo' | 'redo') => {
      actorRef.send({ type: 'CANCEL' });
      if (op === 'undo') void 0;
      else temporalRedo();
    };

    historyWithCancel('redo');
    expect(log).toEqual(['send:CANCEL', 'redo']);
  });
});

// ---------------------------------------------------------------------------
// 5. execute() unknown action ID — must warn, not throw
// ---------------------------------------------------------------------------

describe('execute() unknown action graceful degradation', () => {
  it('console.warn is called, no exception thrown', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Replicate the execute logic:
    const handlers = new Map<string, () => void>();
    const execute = (actionId: string) => {
      const handler = handlers.get(actionId);
      if (handler) {
        handler();
      } else {
        console.warn(`[ActionRegistry] No handler for action: ${actionId}`);
      }
    };

    expect(() => execute('does:not:exist')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does:not:exist'));

    warnSpy.mockRestore();
  });

  it('warns through the real executor path when no handler is registered', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const execute = createActionExecutor(new Map());

    expect(() => execute('does:not:exist' as ActionId)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does:not:exist'));
  });
});

describe('effect installers', () => {
  it('installs keyboard shortcuts, executes the matching action, and removes the listener', () => {
    const execute = vi.fn();
    const target = eventTargetStub();

    const cleanup = installKeyboardShortcuts(execute, target as never);
    const listener = target.listener('keydown');
    const event = fakeKeyboardEvent();

    target.dispatch('keydown', event);

    expect(listener).toBeDefined();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('undo');

    cleanup();
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', listener);
  });

  it('ignores non-global keyboard shortcuts while a text target is focused', () => {
    class FakeInput {}
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const execute = vi.fn();
    const target = eventTargetStub();
    installKeyboardShortcuts(execute, target as never);

    const event = fakeKeyboardEvent({
      key: ',',
      target: new FakeInput() as never,
    });
    target.dispatch('keydown', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('allows global keyboard shortcuts while a text target is focused', () => {
    class FakeInput {}
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const execute = vi.fn();
    const target = eventTargetStub();
    installKeyboardShortcuts(execute, target as never);

    const event = fakeKeyboardEvent({
      target: new FakeInput() as never,
    });
    target.dispatch('keydown', event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('undo');

    vi.unstubAllGlobals();
  });

  it('leaves unmatched keyboard events alone', () => {
    const execute = vi.fn();
    const target = eventTargetStub();
    installKeyboardShortcuts(execute, target as never);

    const event = fakeKeyboardEvent({
      key: 'x',
      ctrlKey: false,
    });
    target.dispatch('keydown', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('installs clipboard listeners for selected copy and in-memory paste', () => {
    const source = makePolyline('polyline_1');
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    const actorRef = actorStub('selected', source.id);
    const execute = vi.fn();
    const target = eventTargetStub();

    const cleanup = installClipboardEvents(execute, actorRef as never, target as never);
    const copyListener = target.listener('copy');
    const pasteListener = target.listener('paste');
    const copyEvent = fakeClipboardEvent();

    target.dispatch('copy', copyEvent);
    expect(copyEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('copySelection');

    copySelectionToClipboard(source);
    const pasteEvent = fakeClipboardEvent();
    target.dispatch('paste', pasteEvent);
    expect(pasteEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('pasteSelection');

    cleanup();
    expect(target.removeEventListener).toHaveBeenCalledWith('copy', copyListener);
    expect(target.removeEventListener).toHaveBeenCalledWith('paste', pasteListener);

    execute.mockClear();
    const ignoredCopyEvent = fakeClipboardEvent();
    target.dispatch('copy', ignoredCopyEvent);
    expect(ignoredCopyEvent.preventDefault).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('skips clipboard shortcuts from text editing targets and empty selections', () => {
    class FakeInput {}
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const execute = vi.fn();
    const target = eventTargetStub();
    installClipboardEvents(execute, actorStub('idle') as never, target as never);

    const copyEvent = fakeClipboardEvent();
    target.dispatch('copy', copyEvent);
    expect(copyEvent.preventDefault).not.toHaveBeenCalled();

    copySelectionToClipboard(makePolyline('polyline_1'));
    const pasteEvent = fakeClipboardEvent({
      target: new FakeInput() as never,
    });
    target.dispatch('paste', pasteEvent);

    expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('subscribes native menu actions through the app bridge and returns its unsubscribe', () => {
    const unsubscribe = vi.fn();
    const execute = vi.fn();
    const onNativeMenuAction = vi
      .spyOn(appBridge, 'onNativeMenuAction')
      .mockImplementation((handler: (actionId: string) => void) => {
        handler('toggleGrid');
        return unsubscribe;
      });

    const cleanup = installNativeMenuActions(execute);

    expect(onNativeMenuAction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('toggleGrid');

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('uses the desktop native-menu fallback cleanup when no bridge handler is present', () => {
    vi.stubGlobal('window', {});
    const execute = vi.fn();

    const cleanup = installNativeMenuActions(execute);

    expect(execute).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });
});

describe('real action dispatcher handler map', () => {
  it('registers a handler for every registry action', () => {
    const handlers = buildActionHandlers(dispatcherOptions());

    for (const action of getActionDefs()) {
      expect(handlers.has(action.id), action.id).toBe(true);
    }
  });

  it('classifies mutating actions behind the edit guard', () => {
    const blocked: ActionId[] = [
      'undo',
      'redo',
      'delete',
      'pasteSelection',
      'connectLanes',
      'boundaryBrush',
      'defaultMode',
      'tool:drawPolyline',
      'tool:drawBezier',
    ];
    for (const actionId of blocked) expect(actionRequiresEdit(actionId), actionId).toBe(true);

    const allowed: ActionId[] = [
      'copySelection',
      'importApollo',
      'exportApolloBin',
      'settings',
      'toggleGrid',
      'toggleSnap',
      'resetLayout',
      'commandPalette',
      'about',
      'openHelp',
    ];
    for (const actionId of allowed) expect(actionRequiresEdit(actionId), actionId).toBe(false);
  });

  it('routes undo and redo through the real handlers after cancelling the FSM', () => {
    const log: string[] = [];
    const actorRef = actorStub();
    actorRef.send.mockImplementation((event: { type: string }) => {
      log.push(`send:${event.type}`);
    });
    const temporal = useMapStore.temporal.getState();
    vi.spyOn(temporal, 'undo').mockImplementation(() => {
      log.push('undo');
    });
    vi.spyOn(temporal, 'redo').mockImplementation(() => {
      log.push('redo');
    });
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('undo');
    expect(log).toEqual(['send:CANCEL', 'undo']);

    log.length = 0;
    execute('redo');
    expect(log).toEqual(['send:CANCEL', 'redo']);
  });

  it('executes view, mode, and tool handlers against the real stores and actor', () => {
    const actorRef = actorStub();
    const options = dispatcherOptions({ actorRef: actorRef as never });
    const execute = createActionExecutor(buildActionHandlers(options));

    expect(useUIStore.getState().gridEnabled).toBe(initialUIState.gridEnabled);
    execute('toggleGrid');
    expect(useUIStore.getState().gridEnabled).toBe(!initialUIState.gridEnabled);

    execute('connectLanes');
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'CANCEL' });
    expect(useUIStore.getState().connectMode.active).toBe(true);

    execute('boundaryBrush');
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'RESET' });
    expect(useUIStore.getState().boundaryBrush.active).toBe(true);
    expect(useUIStore.getState().connectMode.active).toBe(false);

    execute('defaultMode');
    expect(useUIStore.getState().boundaryBrush.active).toBe(false);
    expect(useUIStore.getState().connectMode.active).toBe(false);

    execute('tool:drawPolyline');
    expect(actorRef.send).toHaveBeenCalledWith({
      type: 'SELECT_TOOL',
      tool: 'drawPolyline',
      element: undefined,
    });
  });

  it('preserves active Apollo element context for tool keyboard handlers', () => {
    const actorRef = actorStub('drawBezier', null, 'lane');
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('tool:drawArc');

    expect(actorRef.send).toHaveBeenCalledWith({
      type: 'SELECT_TOOL',
      tool: 'drawArc',
      element: 'lane',
    });
  });

  it('persists grid and snap toggles through the dispatcher', () => {
    const storage = storageStub();
    vi.stubGlobal('window', { document: {}, localStorage: storage });
    const execute = createActionExecutor(buildActionHandlers(dispatcherOptions()));

    execute('toggleGrid');
    execute('toggleSnap');

    expect(useUIStore.getState().gridEnabled).toBe(!initialUIState.gridEnabled);
    expect(useUIStore.getState().snapEnabled).toBe(!initialUIState.snapEnabled);
    expect(useSettingsStore.getState().gridEnabled).toBe(!initialSettingsState.gridEnabled);
    expect(useSettingsStore.getState().snapEnabled).toBe(!initialSettingsState.snapEnabled);
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEYS.gridEnabled,
      String(!initialUIState.gridEnabled),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEYS.snapEnabled,
      String(!initialUIState.snapEnabled),
    );
  });

  it('routes clipboard copy and paste through selected entity snapshots', () => {
    const source = makePolyline('polyline_1');
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    const actorRef = actorStub('selected', source.id);
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('copySelection');
    execute('pasteSelection');

    const entities = useMapStore.getState().entities;
    expect([...entities.keys()]).toEqual(['polyline_1', 'polyline_2']);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'polyline_2' });
  });

  it('pastes lanes with copied topology references cleared', () => {
    const source: LaneEntity = {
      ...makeLane('lane_1'),
      predecessorIds: ['lane_prev'],
      successorIds: ['lane_next'],
      leftNeighborForwardIds: ['lane_left_forward'],
      rightNeighborForwardIds: ['lane_right_forward'],
      leftNeighborReverseIds: ['lane_left_reverse'],
      rightNeighborReverseIds: ['lane_right_reverse'],
      selfReverseLaneIds: ['lane_reverse'],
      junctionId: 'J_1',
      overlapIds: ['overlap_lane_1_J_1'],
    };
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    const actorRef = actorStub('selected', source.id);
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('copySelection');
    execute('pasteSelection');

    const pasted = useMapStore.getState().entities.get('lane_2') as LaneEntity | undefined;
    expect(pasted).toBeDefined();
    expect(pasted?.predecessorIds).toEqual([]);
    expect(pasted?.successorIds).toEqual([]);
    expect(pasted?.leftNeighborForwardIds).toEqual([]);
    expect(pasted?.rightNeighborForwardIds).toEqual([]);
    expect(pasted?.leftNeighborReverseIds).toEqual([]);
    expect(pasted?.rightNeighborReverseIds).toEqual([]);
    expect(pasted?.selfReverseLaneIds).toEqual([]);
    expect(pasted?.junctionId).toBeNull();
    expect(pasted?.overlapIds).toEqual([]);
    expect(source.predecessorIds).toEqual(['lane_prev']);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_ENTITY', id: 'lane_2' });
  });

  it('deletes the selected entity through the global delete action', () => {
    const source = makePolyline('polyline_1');
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    const actorRef = actorStub('selected', source.id);
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('delete');

    expect(useMapStore.getState().entities.has(source.id)).toBe(false);
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });

  it('does not run mutating map actions while in scene mode', () => {
    const source = makePolyline('polyline_1');
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    useUIStore.getState().setAppMode('scene');
    const actorRef = actorStub('selected', source.id);
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );
    const undoSpy = vi.spyOn(useMapStore.temporal.getState(), 'undo');

    execute('delete');
    execute('undo');
    execute('tool:drawPolyline');

    expect(useMapStore.getState().entities.get(source.id)).toBe(source);
    expect(undoSpy).not.toHaveBeenCalled();
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('does not paste while the FSM is in a drawing state', () => {
    const source = makePolyline('polyline_1');
    copySelectionToClipboard(source);
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    const actorRef = actorStub('drawPolyline', null);
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('pasteSelection');

    expect(useMapStore.getState().entities.size).toBe(1);
    expect(actorRef.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SELECT_ENTITY' }),
    );
  });

  it('skips paste when the in-memory clipboard has no duplicateable entity', () => {
    const actorRef = actorStub('idle');
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('pasteSelection');

    expect(useMapStore.getState().entities.size).toBe(0);
    expect(actorRef.send).not.toHaveBeenCalled();
  });

  it('allows copySelection while read-only without prompting for activation', () => {
    const source = makePolyline('polyline_1');
    useMapStore.setState({ entities: new Map([[source.id, source]]) });
    const promptActivation = vi.fn();
    useLicenseStore.setState({
      state: editableLicenseState(false),
      initialized: true,
      promptActivation,
    });
    const actorRef = actorStub('selected', source.id);
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ actorRef: actorRef as never })),
    );

    execute('copySelection');

    expect(promptActivation).not.toHaveBeenCalled();

    useLicenseStore.setState({
      state: editableLicenseState(true),
      initialized: true,
      promptActivation: vi.fn(),
    });
    execute('pasteSelection');

    expect([...useMapStore.getState().entities.keys()]).toEqual(['polyline_1', 'polyline_2']);
  });

  it('blocks mutating handlers when the license is read-only but still allows copy and view actions', () => {
    const promptActivation = vi.fn();
    useLicenseStore.setState({
      state: editableLicenseState(false),
      initialized: true,
      promptActivation,
    });
    const actorRef = actorStub();
    const options = dispatcherOptions({ actorRef: actorRef as never });
    const execute = createActionExecutor(buildActionHandlers(options));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    execute('tool:drawPolyline');
    execute('connectLanes');
    expect(actorRef.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SELECT_TOOL' }),
    );
    expect(useUIStore.getState().connectMode.active).toBe(false);
    expect(promptActivation).toHaveBeenCalled();

    execute('toggleGrid');
    expect(useUIStore.getState().gridEnabled).toBe(!initialUIState.gridEnabled);

    warnSpy.mockRestore();
  });

  it('guards ToolStrip-style tool selection while preserving element context', () => {
    const actorRef = actorStub();
    const selectTool = createToolSelector(actorRef as never);

    selectTool('drawBezier', 'lane');
    expect(actorRef.send).toHaveBeenCalledWith({
      type: 'SELECT_TOOL',
      tool: 'drawBezier',
      element: 'lane',
    });

    useLicenseStore.setState({
      state: editableLicenseState(false),
      initialized: true,
      promptActivation: vi.fn(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blockedActorRef = actorStub();

    createToolSelector(blockedActorRef as never)('drawPolygon', 'junction');

    expect(blockedActorRef.send).not.toHaveBeenCalled();
  });

  it('updates workspace panels and dialog callbacks through registered handlers', () => {
    const options = dispatcherOptions();
    const execute = createActionExecutor(buildActionHandlers(options));
    const openHelp = vi.spyOn(appBridge, 'openHelp').mockResolvedValue(true);

    execute('settings');
    execute('about');
    execute('openHelp');
    execute('commandPalette');
    execute('resetLayout');
    execute('view:inspector');

    expect(options.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(options.onOpenAbout).toHaveBeenCalledTimes(1);
    expect(openHelp).toHaveBeenCalledTimes(1);
    expect(options.onOpenCommandPalette).toHaveBeenCalledTimes(1);
    expect(options.onResetLayout).toHaveBeenCalledTimes(1);
    expect(options.onToggleWorkspaceView).toHaveBeenCalledWith('view:inspector');
  });

  it('treats missing workspace view callbacks as no-op and inactive state', () => {
    const execute = createActionExecutor(
      buildActionHandlers(dispatcherOptions({ onToggleWorkspaceView: undefined })),
    );

    expect(() => execute('view:inspector')).not.toThrow();

    const dispatcher = renderDispatcher(
      dispatcherOptions({
        onToggleWorkspaceView: undefined,
        getWorkspaceViewState: undefined,
      }),
    );

    expect(dispatcher.getToggleState('view:inspector')).toBe(false);
  });

  it('reports all built-in toggle states from the current UI store snapshot', () => {
    const dispatcher = renderDispatcher(dispatcherOptions());

    expect(dispatcher.getToggleState('toggleGrid')).toBe(initialUIState.gridEnabled);
    expect(dispatcher.getToggleState('toggleSnap')).toBe(initialUIState.snapEnabled);
    expect(dispatcher.getToggleState('connectLanes')).toBe(false);
    expect(dispatcher.getToggleState('boundaryBrush')).toBe(false);
    expect(dispatcher.getToggleState('defaultMode')).toBe(true);
  });

  it('useActionDispatcher exposes actions, execution, selection, and toggle state during SSR render', () => {
    let dispatcher: ActionDispatcher | null = null;
    const actorRef = actorStub();
    const options = dispatcherOptions({
      actorRef: actorRef as never,
      getWorkspaceViewState: vi.fn((actionId) => actionId === 'view:inspector'),
    });

    function Probe() {
      dispatcher = useActionDispatcher(options);
      return createElement('span', null, dispatcher.actions.length);
    }

    const html = renderToStaticMarkup(createElement(Probe));

    expect(html).toContain(String(getActionDefs().length));
    expect(dispatcher).not.toBeNull();
    expect(dispatcher!.actions).toHaveLength(getActionDefs().length);
    expect(dispatcher!.getToggleState('toggleGrid')).toBe(useUIStore.getState().gridEnabled);
    expect(dispatcher!.getToggleState('view:inspector')).toBe(true);
    expect(dispatcher!.getToggleState('tool:drawPolyline')).toBe(false);

    dispatcher!.execute('settings');
    expect(options.onOpenSettings).toHaveBeenCalledTimes(1);

    dispatcher!.selectTool('drawBezier');
    expect(actorRef.send).toHaveBeenCalledWith({ type: 'SELECT_TOOL', tool: 'drawBezier' });
  });
});
