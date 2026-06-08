import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, type ActorRefFrom } from 'xstate';
import { editorMachine } from '@/core/fsm/editorMachine';
import { resetSharedSpatialIndex } from '@/core/elements/overlap';
import { clearSelectionClipboard, hasSelectionClipboard } from '@/lib/selectionClipboard';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { LicenseState } from '@/lib/license-bridge';
import type { MapEntity, PolylineEntity } from '@/types/entities';
import {
  buildActionHandlers,
  createActionExecutor,
  installClipboardEvents,
  installKeyboardShortcuts,
  type ActionDispatcherOptions,
} from '../useActionDispatcher';
import { installDrawCommitSubscription } from '../useDrawCommit';
import { handleMapKeyDown } from '../mapEventRouter/keyboard';

const initialUIState = useUIStore.getState();

const editableLicenseState: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};

type EditorActor = ActorRefFrom<typeof editorMachine>;

const activeActors: EditorActor[] = [];
const cleanupCallbacks: Array<() => void> = [];

function createStartedActor(): EditorActor {
  const actor = createActor(editorMachine).start();
  activeActors.push(actor);
  return actor;
}

function trackCleanup(cleanup: () => void) {
  cleanupCallbacks.push(cleanup);
}

function dispatcherOptions(
  actorRef: EditorActor,
  overrides: Partial<ActionDispatcherOptions> = {},
): ActionDispatcherOptions {
  return {
    actorRef,
    onOpenCommandPalette: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAbout: vi.fn(),
    onResetLayout: vi.fn(),
    onToggleWorkspaceView: vi.fn(),
    getWorkspaceViewState: vi.fn(() => false),
    ...overrides,
  };
}

function createExecute(actorRef: EditorActor) {
  return createActionExecutor(buildActionHandlers(dispatcherOptions(actorRef)));
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

function keyboardEvent(
  key: string,
  overrides: Partial<KeyboardEvent> = {},
): KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  } as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function clipboardEvent(
  overrides: Partial<ClipboardEvent> = {},
): ClipboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  } as ClipboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function dispatchKey(
  target: ReturnType<typeof eventTargetStub>,
  key: string,
  overrides: Partial<KeyboardEvent> = {},
) {
  const event = keyboardEvent(key, overrides);
  target.dispatch('keydown', event);
  return event;
}

function polyline(
  id: string,
  points: PolylineEntity['points'] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points,
  };
}

function seedEntities(...entities: MapEntity[]) {
  useMapStore.setState({ entities: new Map(entities.map((entity) => [entity.id, entity])) });
}

function entityIds() {
  return [...useMapStore.getState().entities.keys()];
}

function expectUniqueEntityIds() {
  const entities = useMapStore.getState().entities;
  const ids = [...entities.values()].map((entity) => entity.id);
  expect(new Set(ids).size).toBe(entities.size);
  for (const [key, entity] of entities) {
    expect(key).toBe(entity.id);
  }
}

function selectedEntityId(actor: EditorActor) {
  return actor.getSnapshot().context.selectedEntityId;
}

beforeEach(() => {
  clearSelectionClipboard();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  resetSharedSpatialIndex();
  useUIStore.setState(initialUIState, true);
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: vi.fn(),
  });
});

afterEach(() => {
  const callbacks = cleanupCallbacks.splice(0).reverse();
  const actors = activeActors.splice(0).reverse();
  const errors: unknown[] = [];

  for (const cleanup of callbacks) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  for (const actor of actors) {
    try {
      actor.stop();
    } catch (error) {
      errors.push(error);
    }
  }
  clearSelectionClipboard();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  resetSharedSpatialIndex();
  useUIStore.setState(initialUIState, true);
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: () => {},
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (errors.length > 0) throw errors[0];
});

describe('History and Clipboard E2E', () => {
  it('draws a polyline and supports Ctrl/Meta undo and redo shortcuts', () => {
    const actor = createStartedActor();
    trackCleanup(installDrawCommitSubscription(actor));
    const keyboardTarget = eventTargetStub();
    installKeyboardShortcuts(createExecute(actor), keyboardTarget as never);

    createExecute(actor)('tool:drawPolyline');
    actor.send({ type: 'MOUSE_DOWN', point: [0, 0] });
    actor.send({ type: 'MOUSE_DOWN', point: [0.001, 0] });
    actor.send({ type: 'CONFIRM' });

    expect(entityIds()).toEqual(['polyline_1']);

    dispatchKey(keyboardTarget, 'z', { ctrlKey: true });
    expect(entityIds()).toEqual([]);

    dispatchKey(keyboardTarget, 'z', { ctrlKey: true, shiftKey: true });
    expect(entityIds()).toEqual(['polyline_1']);

    dispatchKey(keyboardTarget, 'z', { metaKey: true });
    expect(entityIds()).toEqual([]);

    dispatchKey(keyboardTarget, 'z', { metaKey: true, shiftKey: true });
    expect(entityIds()).toEqual(['polyline_1']);
  });

  it('copies the selected entity and pastes a conflict-free id', () => {
    const source = polyline('polyline_1');
    const existing = polyline('polyline_2', [
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
    seedEntities(source, existing);

    const actor = createStartedActor();
    actor.send({ type: 'SELECT_ENTITY', id: source.id });
    const keyboardTarget = eventTargetStub();
    installKeyboardShortcuts(createExecute(actor), keyboardTarget as never);

    dispatchKey(keyboardTarget, 'c', { ctrlKey: true });
    dispatchKey(keyboardTarget, 'v', { ctrlKey: true });

    const entities = useMapStore.getState().entities;
    expect(entityIds()).toEqual(['polyline_1', 'polyline_2', 'polyline_3']);
    expect(entities.get(source.id)).toBe(source);
    expect(entities.get(existing.id)).toBe(existing);
    expect(entities.get(source.id)).toEqual(source);
    expect(entities.get(existing.id)).toEqual(existing);
    expect(entities.get('polyline_3')).toMatchObject({
      id: 'polyline_3',
      entityType: 'polyline',
    });
    expect((entities.get('polyline_3') as PolylineEntity | undefined)?.points).toHaveLength(
      source.points.length,
    );
    expect(
      (entities.get('polyline_3') as PolylineEntity | undefined)?.points[0]?.x,
    ).toBeGreaterThan(source.points[0]!.x);
    expect(selectedEntityId(actor)).toBe('polyline_3');
    expectUniqueEntityIds();

    const firstPasted = useMapStore.getState().entities.get('polyline_3');
    dispatchKey(keyboardTarget, 'v', { metaKey: true });
    expect(entityIds()).toEqual(['polyline_1', 'polyline_2', 'polyline_3', 'polyline_4']);
    expect(useMapStore.getState().entities.get(source.id)).toBe(source);
    expect(useMapStore.getState().entities.get(existing.id)).toBe(existing);
    expect(useMapStore.getState().entities.get('polyline_3')).toBe(firstPasted);
    expect(
      (useMapStore.getState().entities.get('polyline_4') as PolylineEntity | undefined)?.points,
    ).toHaveLength(source.points.length);
    expect(
      (useMapStore.getState().entities.get('polyline_4') as PolylineEntity | undefined)?.points[0]
        ?.x,
    ).toBeGreaterThan(
      (useMapStore.getState().entities.get('polyline_3') as PolylineEntity).points[0]!.x,
    );
    expect(selectedEntityId(actor)).toBe('polyline_4');
    expectUniqueEntityIds();

    actor.send({ type: 'SELECT_ENTITY', id: source.id });
    dispatchKey(keyboardTarget, 'c', { metaKey: true });
    dispatchKey(keyboardTarget, 'v', { metaKey: true });
    expect(entityIds()).toEqual([
      'polyline_1',
      'polyline_2',
      'polyline_3',
      'polyline_4',
      'polyline_5',
    ]);
    expect(
      (useMapStore.getState().entities.get('polyline_5') as PolylineEntity | undefined)?.points[0]
        ?.x,
    ).toBeCloseTo(
      (useMapStore.getState().entities.get('polyline_3') as PolylineEntity).points[0]!.x,
    );
    expect(selectedEntityId(actor)).toBe('polyline_5');
    expectUniqueEntityIds();
  });

  it('copies and pastes the selected entity through clipboard events', () => {
    const source = polyline('polyline_1');
    useMapStore.getState().addEntity(source);

    const actor = createStartedActor();
    actor.send({ type: 'SELECT_ENTITY', id: source.id });
    const eventTarget = eventTargetStub();
    installClipboardEvents(createExecute(actor), actor, eventTarget as never);

    const copy = clipboardEvent();
    eventTarget.dispatch('copy', copy);
    expect(copy.preventDefault).toHaveBeenCalledTimes(1);

    const paste = clipboardEvent();
    eventTarget.dispatch('paste', paste);
    expect(paste.preventDefault).toHaveBeenCalledTimes(1);

    expect(entityIds()).toEqual(['polyline_1', 'polyline_2']);
    expect(selectedEntityId(actor)).toBe('polyline_2');
    expectUniqueEntityIds();
  });

  it('restores a deleted selected entity with undo', () => {
    const source = polyline('polyline_1');
    useMapStore.getState().addEntity(source);

    const actor = createStartedActor();
    actor.send({ type: 'SELECT_ENTITY', id: source.id });
    const keyboardTarget = eventTargetStub();
    installKeyboardShortcuts(createExecute(actor), keyboardTarget as never);

    dispatchKey(keyboardTarget, 'Delete');
    expect(useMapStore.getState().entities.has(source.id)).toBe(false);
    expect(selectedEntityId(actor)).toBeNull();

    dispatchKey(keyboardTarget, 'z', { ctrlKey: true });
    expect(useMapStore.getState().entities.get(source.id)).toEqual(source);
    expect(selectedEntityId(actor)).toBeNull();
  });

  it.each(['Delete', 'Backspace'] as const)(
    'restores a router-deleted selected entity with undo after %s',
    (key) => {
      const source = polyline('polyline_1');
      useMapStore.getState().addEntity(source);

      const actor = createStartedActor();
      actor.send({ type: 'SELECT_ENTITY', id: source.id });
      const keyboardTarget = eventTargetStub();
      installKeyboardShortcuts(createExecute(actor), keyboardTarget as never);

      const deleteEvent = keyboardEvent(key);
      handleMapKeyDown(actor, deleteEvent, vi.fn());
      expect(deleteEvent.preventDefault).not.toHaveBeenCalled();
      expect(useMapStore.getState().entities.has(source.id)).toBe(false);
      expect(selectedEntityId(actor)).toBeNull();

      dispatchKey(keyboardTarget, 'z', { metaKey: true });
      expect(useMapStore.getState().entities.get(source.id)).toEqual(source);
      expect(selectedEntityId(actor)).toBeNull();
    },
  );

  it('does not run copy, paste, or delete while a text input is focused', () => {
    class FakeInput {}
    vi.stubGlobal('HTMLInputElement', FakeInput);

    const input = new FakeInput() as EventTarget;
    const source = polyline('polyline_1');
    useMapStore.getState().addEntity(source);

    const actor = createStartedActor();
    actor.send({ type: 'SELECT_ENTITY', id: source.id });
    const execute = createExecute(actor);
    const eventTarget = eventTargetStub();
    installKeyboardShortcuts(execute, eventTarget as never);
    installClipboardEvents(execute, actor as never, eventTarget as never);

    const blockedCopyKey = dispatchKey(eventTarget, 'c', { ctrlKey: true, target: input });
    const blockedCopyEvent = clipboardEvent({ target: input });
    eventTarget.dispatch('copy', blockedCopyEvent);
    const pasteAfterBlockedCopy = dispatchKey(eventTarget, 'v', { ctrlKey: true });
    expect(blockedCopyKey.preventDefault).not.toHaveBeenCalled();
    expect(blockedCopyEvent.preventDefault).not.toHaveBeenCalled();
    expect(pasteAfterBlockedCopy.preventDefault).toHaveBeenCalledTimes(1);
    expect(entityIds()).toEqual(['polyline_1']);

    const blockedMetaCopyKey = dispatchKey(eventTarget, 'c', { metaKey: true, target: input });
    expect(blockedMetaCopyKey.preventDefault).not.toHaveBeenCalled();
    expect(entityIds()).toEqual(['polyline_1']);

    dispatchKey(eventTarget, 'c', { metaKey: true });
    expect(hasSelectionClipboard()).toBe(true);
    const blockedPasteKey = dispatchKey(eventTarget, 'v', { ctrlKey: true, target: input });
    const blockedMetaPasteKey = dispatchKey(eventTarget, 'v', { metaKey: true, target: input });
    const blockedPasteEvent = clipboardEvent({ target: input });
    eventTarget.dispatch('paste', blockedPasteEvent);
    expect(blockedPasteKey.preventDefault).not.toHaveBeenCalled();
    expect(blockedMetaPasteKey.preventDefault).not.toHaveBeenCalled();
    expect(blockedPasteEvent.preventDefault).not.toHaveBeenCalled();
    expect(entityIds()).toEqual(['polyline_1']);

    const blockedDeleteKey = dispatchKey(eventTarget, 'Delete', { target: input });
    expect(blockedDeleteKey.preventDefault).not.toHaveBeenCalled();
    expect(entityIds()).toEqual(['polyline_1']);
    expect(selectedEntityId(actor)).toBe(source.id);

    const blockedRouterDelete = keyboardEvent('Delete', { target: input });
    const blockedRouterBackspace = keyboardEvent('Backspace', { target: input });
    handleMapKeyDown(actor, blockedRouterDelete, vi.fn());
    handleMapKeyDown(actor, blockedRouterBackspace, vi.fn());
    expect(blockedRouterDelete.preventDefault).not.toHaveBeenCalled();
    expect(blockedRouterBackspace.preventDefault).not.toHaveBeenCalled();
    expect(entityIds()).toEqual(['polyline_1']);
    expect(selectedEntityId(actor)).toBe(source.id);
  });

  it('does not run undo or redo while a text input is focused', () => {
    class FakeInput {}
    vi.stubGlobal('HTMLInputElement', FakeInput);

    const input = new FakeInput() as EventTarget;
    const actor = createStartedActor();
    const keyboardTarget = eventTargetStub();
    installKeyboardShortcuts(createExecute(actor), keyboardTarget as never);

    useMapStore.getState().addEntity(polyline('polyline_1'));
    const blockedCtrlUndo = dispatchKey(keyboardTarget, 'z', { ctrlKey: true, target: input });
    const blockedMetaUndo = dispatchKey(keyboardTarget, 'z', { metaKey: true, target: input });
    expect(blockedCtrlUndo.preventDefault).not.toHaveBeenCalled();
    expect(blockedMetaUndo.preventDefault).not.toHaveBeenCalled();
    expect(entityIds()).toEqual(['polyline_1']);

    useMapStore.temporal.getState().undo();
    expect(entityIds()).toEqual([]);

    const blockedCtrlRedo = dispatchKey(keyboardTarget, 'z', {
      ctrlKey: true,
      shiftKey: true,
      target: input,
    });
    const blockedMetaRedo = dispatchKey(keyboardTarget, 'z', {
      metaKey: true,
      shiftKey: true,
      target: input,
    });
    expect(blockedCtrlRedo.preventDefault).not.toHaveBeenCalled();
    expect(blockedMetaRedo.preventDefault).not.toHaveBeenCalled();
    expect(entityIds()).toEqual([]);
  });
});
