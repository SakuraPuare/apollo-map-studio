/**
 * useActionDispatcher — connects Action Registry to actual handlers
 *
 * This hook:
 * 1. Registers all action handlers in one place
 * 2. Sets up keyboard shortcuts from the registry
 * 3. Provides execute(actionId) for any UI surface to call
 * 4. Provides getToggleState(actionId) for toggle actions
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import {
  getActionDefs,
  getActionMap,
  getKeyBindingActions,
  matchesKeybinding,
  type ActionDef,
  type ActionId,
  type WorkspaceViewActionId,
} from '@/core/actions/registry';
import { getWorkspaceViewDefs, isWorkspaceViewActionId } from '@/core/workspaceViews';
import { pickAndImportApollo, exportApolloBin, exportApolloText } from '@/io/mapIO';
import { appBridge } from '@/lib/app-bridge';
import { assertEditable } from '@/lib/editable-guard';
import {
  copySelectionToClipboard,
  hasSelectionClipboard,
  pasteSelectionFromClipboard,
} from '@/lib/selectionClipboard';

/**
 * Set of action ids that mutate map state — blocked when the license
 * is not in an editable state. Categories `edit`, `tool`, `selection`
 * are blocked wholesale; specific extras (`connectLanes`) blocked by id.
 */
function actionRequiresEdit(id: ActionId): boolean {
  if (id === 'copySelection') return false;
  if (id === 'connectLanes') return true;
  const def = getActionMap().get(id);
  if (!def) return false;
  return def.category === 'edit' || def.category === 'tool' || def.category === 'selection';
}

export interface ActionDispatcher {
  /**
   * Execute an action by ID. Typed as `ActionId` so `execute('tool:typo')`
   * is a compile-time error — every UI surface shares the same known-good
   * set of identifiers with the Action Registry.
   */
  execute: (actionId: ActionId) => void;
  /** Get toggle state for toggle actions */
  getToggleState: (actionId: ActionId) => boolean;
  /** All action definitions (for UI rendering) */
  actions: ActionDef[];
}

interface ActionDispatcherOptions {
  actorRef: ActorRefFrom<typeof editorMachine>;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onResetLayout: () => void;
  onToggleWorkspaceView?: (actionId: WorkspaceViewActionId) => void;
  getWorkspaceViewState?: (actionId: WorkspaceViewActionId) => boolean;
}

function importApollo() {
  void pickAndImportApollo();
}

function registerFileHandlers(map: Map<ActionId, () => void>, options: ActionDispatcherOptions) {
  map.set('importApollo', importApollo);
  map.set('exportApolloBin', () => void exportApolloBin());
  map.set('exportApolloText', () => void exportApolloText());
  map.set('settings', options.onOpenSettings);
}

function registerHistoryHandlers(map: Map<ActionId, () => void>, options: ActionDispatcherOptions) {
  const historyWithCancel = (op: 'undo' | 'redo') => {
    options.actorRef.send({ type: 'CANCEL' });
    if (op === 'undo') useMapStore.temporal.getState().undo();
    else useMapStore.temporal.getState().redo();
  };
  map.set('undo', () => historyWithCancel('undo'));
  map.set('redo', () => historyWithCancel('redo'));
  map.set('delete', () => options.actorRef.send({ type: 'DELETE_ENTITY' }));
}

function registerClipboardHandlers(
  map: Map<ActionId, () => void>,
  options: ActionDispatcherOptions,
) {
  map.set('copySelection', () => {
    copySelectionToClipboard(getSelectedClipboardEntity(options.actorRef));
  });

  map.set('pasteSelection', () => {
    const snap = options.actorRef.getSnapshot();
    if (snap.value !== 'idle' && snap.value !== 'selected') return;
    const store = useMapStore.getState();
    const pasted = pasteSelectionFromClipboard(store.entities);
    if (!pasted) return;
    store.addEntity(pasted);
    options.actorRef.send({ type: 'SELECT_ENTITY', id: pasted.id });
  });
}

function getSelectedClipboardEntity(actorRef: ActorRefFrom<typeof editorMachine>) {
  const snap = actorRef.getSnapshot();
  if (snap.value !== 'selected' || !snap.context.selectedEntityId) return null;
  return useMapStore.getState().entities.get(snap.context.selectedEntityId) ?? null;
}

function registerViewHandlers(map: Map<ActionId, () => void>, options: ActionDispatcherOptions) {
  map.set('toggleGrid', () => useUIStore.getState().toggleGrid());
  map.set('toggleSnap', () => useUIStore.getState().toggleSnap());
  map.set('resetLayout', options.onResetLayout);
  for (const view of getWorkspaceViewDefs()) {
    map.set(view.actionId, () => options.onToggleWorkspaceView?.(view.actionId));
  }
  map.set('commandPalette', options.onOpenCommandPalette);
}

function registerHelpHandlers(map: Map<ActionId, () => void>, options: ActionDispatcherOptions) {
  map.set('about', options.onOpenAbout);
  map.set('openHelp', () => void appBridge.openHelp());
}

function registerModeHandlers(map: Map<ActionId, () => void>, options: ActionDispatcherOptions) {
  map.set('defaultMode', () => {
    options.actorRef.send({ type: 'CANCEL' });
    options.actorRef.send({ type: 'RESET' });
    if (useUIStore.getState().connectMode.active) useUIStore.getState().exitConnectMode();
    if (useUIStore.getState().boundaryBrush.active) useUIStore.getState().exitBoundaryBrush();
  });

  map.set('connectLanes', () => {
    options.actorRef.send({ type: 'CANCEL' });
    useUIStore.getState().toggleConnectMode();
  });

  map.set('boundaryBrush', () => {
    options.actorRef.send({ type: 'CANCEL' });
    options.actorRef.send({ type: 'RESET' });
    useUIStore.getState().toggleBoundaryBrush();
  });
}

function registerToolHandlers(map: Map<ActionId, () => void>, options: ActionDispatcherOptions) {
  for (const action of getActionDefs()) {
    if (!action.drawTool) continue;
    const tool = action.drawTool;
    map.set(action.id, () => options.actorRef.send({ type: 'SELECT_TOOL', tool }));
  }
}

function buildActionHandlers(options: ActionDispatcherOptions): Map<ActionId, () => void> {
  const map = new Map<ActionId, () => void>();
  registerFileHandlers(map, options);
  registerHistoryHandlers(map, options);
  registerClipboardHandlers(map, options);
  registerViewHandlers(map, options);
  registerHelpHandlers(map, options);
  registerModeHandlers(map, options);
  registerToolHandlers(map, options);
  return map;
}

function useActionHandlers(options: ActionDispatcherOptions): Map<ActionId, () => void> {
  const {
    actorRef,
    onOpenAbout,
    onOpenCommandPalette,
    onOpenSettings,
    onResetLayout,
    onToggleWorkspaceView,
  } = options;
  return useMemo(
    () =>
      buildActionHandlers({
        actorRef,
        onOpenAbout,
        onOpenCommandPalette,
        onOpenSettings,
        onResetLayout,
        onToggleWorkspaceView,
      }),
    [
      actorRef,
      onOpenAbout,
      onOpenCommandPalette,
      onOpenSettings,
      onResetLayout,
      onToggleWorkspaceView,
    ],
  );
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement)
    return true;
  if (typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement) return true;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target.isContentEditable;
  }
  return false;
}

function useKeyboardShortcuts(execute: (actionId: ActionId) => void) {
  useEffect(() => {
    const kbActions = getKeyBindingActions();
    const handler = (e: KeyboardEvent) => {
      const inInput = isTextEditingTarget(e.target);

      for (const action of kbActions) {
        if (!action.keybinding) continue;
        if (inInput && !action.keybinding.global) continue;
        if (!matchesKeybinding(e, action.keybinding)) continue;
        e.preventDefault();
        execute(action.id);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [execute]);
}

function useClipboardEvents(
  execute: (actionId: ActionId) => void,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if (!getSelectedClipboardEntity(actorRef)) return;
      e.preventDefault();
      execute('copySelection');
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if (!hasSelectionClipboard()) return;
      e.preventDefault();
      execute('pasteSelection');
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [actorRef, execute]);
}

function useNativeMenuActions(execute: (actionId: ActionId) => void) {
  useEffect(() => {
    return appBridge.onNativeMenuAction((actionId) => execute(actionId as ActionId));
  }, [execute]);
}

function useActionToggleState(
  getWorkspaceViewState?: (actionId: WorkspaceViewActionId) => boolean,
) {
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const connectModeActive = useUIStore((s) => s.connectMode.active);
  const boundaryBrushActive = useUIStore((s) => s.boundaryBrush.active);
  const mapElementToolActive = !connectModeActive && !boundaryBrushActive;

  return useCallback(
    (actionId: ActionId): boolean => {
      switch (actionId) {
        case 'toggleGrid':
          return gridEnabled;
        case 'toggleSnap':
          return snapEnabled;
        case 'connectLanes':
          return connectModeActive;
        case 'boundaryBrush':
          return boundaryBrushActive;
        case 'defaultMode':
          return mapElementToolActive;
        default:
          if (isWorkspaceViewActionId(actionId)) {
            return getWorkspaceViewState?.(actionId) ?? false;
          }
          return false;
      }
    },
    [
      gridEnabled,
      snapEnabled,
      connectModeActive,
      boundaryBrushActive,
      mapElementToolActive,
      getWorkspaceViewState,
    ],
  );
}

function useActionExecute(handlers: Map<ActionId, () => void>) {
  return useCallback(
    (actionId: ActionId) => {
      if (actionRequiresEdit(actionId) && !assertEditable(actionId)) return;
      const handler = handlers.get(actionId);
      if (handler) handler();
      else console.warn(`[ActionRegistry] No handler for action: ${actionId}`);
    },
    [handlers],
  );
}

export function useActionDispatcher(options: ActionDispatcherOptions): ActionDispatcher {
  const handlers = useActionHandlers(options);
  const execute = useActionExecute(handlers);
  const getToggleState = useActionToggleState(options.getWorkspaceViewState);
  useKeyboardShortcuts(execute);
  useClipboardEvents(execute, options.actorRef);
  useNativeMenuActions(execute);

  return {
    execute,
    getToggleState,
    actions: getActionDefs(),
  };
}
