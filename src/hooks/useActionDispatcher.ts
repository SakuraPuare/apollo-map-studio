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
import { useSelector } from '@xstate/react';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import {
  ACTION_DEFS,
  ACTION_MAP,
  getKeyBindingActions,
  matchesKeybinding,
  type ActionDef,
  type ActionId,
} from '@/core/actions/registry';
import { pickAndImportApollo, exportApolloBin, exportApolloText } from '@/io/mapIO';
import { assertEditable } from '@/lib/editable-guard';

/**
 * Set of action ids that mutate map state — blocked when the license
 * is not in an editable state. Categories `edit`, `tool`, `selection`
 * are blocked wholesale; specific extras (`connectLanes`) blocked by id.
 */
function actionRequiresEdit(id: ActionId): boolean {
  if (id === 'connectLanes') return true;
  const def = ACTION_MAP.get(id);
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
  onResetLayout: () => void;
}

export function useActionDispatcher(options: ActionDispatcherOptions): ActionDispatcher {
  const { actorRef, onOpenCommandPalette, onOpenSettings, onResetLayout } = options;

  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const connectModeActive = useUIStore((s) => s.connectMode.active);
  // Default-mode toggle indicator: idle FSM + no element armed + not connecting.
  const fsmStateValue = useSelector(actorRef, (s) => s.value);
  const fsmActiveElement = useSelector(actorRef, (s) => s.context.activeElement);
  const inDefaultMode = fsmStateValue === 'idle' && fsmActiveElement === null && !connectModeActive;

  // ── Handler map ────────────────────────────────────────

  const handlers = useMemo(() => {
    const map = new Map<ActionId, () => void>();

    // File
    map.set('importApollo', () => {
      void pickAndImportApollo().then((info) => {
        if (info) {
          // eslint-disable-next-line no-console
          console.info(
            `[Apollo IO] imported ${info.filename}:`,
            info.counts,
            `proj=${info.projString}`,
          );
        }
      });
    });
    map.set('exportApolloBin', () => {
      void exportApolloBin();
    });
    map.set('exportApolloText', () => {
      void exportApolloText();
    });
    map.set('settings', onOpenSettings);

    // Edit
    // R1 fix: flush any in-flight FSM draft/drag state *before* time-traveling
    // the entity store. Without this, undo leaves FSM holding stale drawPoints
    // or dragPointIndex pointing at an entity that just rolled back — the next
    // CONFIRM/DRAG_END writes corrupted data. CANCEL is safe in every state:
    // draw states → idle+resetDraw, selected → idle+deselect, editingPoint →
    // selected, idle has no handler (XState 5 no-ops).
    const historyWithCancel = (op: 'undo' | 'redo') => {
      actorRef.send({ type: 'CANCEL' });
      if (op === 'undo') useMapStore.temporal.getState().undo();
      else useMapStore.temporal.getState().redo();
    };
    map.set('undo', () => historyWithCancel('undo'));
    map.set('redo', () => historyWithCancel('redo'));
    map.set('delete', () => actorRef.send({ type: 'DELETE_ENTITY' }));

    // View
    map.set('toggleGrid', () => useUIStore.getState().toggleGrid());
    map.set('toggleSnap', () => useUIStore.getState().toggleSnap());
    map.set('resetLayout', onResetLayout);
    map.set('commandPalette', onOpenCommandPalette);

    // Default (pan/select) mode — escape hatch from any active draw,
    // selection, or connect flow back to plain idle. Mirrors Photoshop's
    // 'H' (Hand) tool: nothing armed, map pans freely.
    map.set('defaultMode', () => {
      actorRef.send({ type: 'CANCEL' });
      // CANCEL has no transition out of `idle` (XState 5 no-ops it), so
      // a residual activeElement from a finished draw would linger. RESET
      // clears the draw context (incl. activeElement) and is harmless in
      // any other state.
      actorRef.send({ type: 'RESET' });
      if (useUIStore.getState().connectMode.active) {
        useUIStore.getState().exitConnectMode();
      }
    });

    // Connect-lanes mode — non-FSM UI mode. Click a lane to record as
    // first selection; click another to commit the join. ESC cancels.
    map.set('connectLanes', () => {
      // If user is in any active edit/draw flow, bail out cleanly first.
      actorRef.send({ type: 'CANCEL' });
      useUIStore.getState().toggleConnectMode();
    });

    // Tools — Select/Pan are gone; ESC + maplibre's native drag handle exit/pan.
    // Registry-driven: every ACTION_DEF carrying a `drawTool` field becomes a
    // SELECT_TOOL dispatch. Adding a new tool is now a single registry record.
    for (const action of ACTION_DEFS) {
      if (action.drawTool) {
        const tool = action.drawTool;
        map.set(action.id, () => actorRef.send({ type: 'SELECT_TOOL', tool }));
      }
    }

    return map;
  }, [actorRef, onOpenCommandPalette, onOpenSettings, onResetLayout]);

  // ── Execute ────────────────────────────────────────────

  const execute = useCallback(
    (actionId: ActionId) => {
      if (actionRequiresEdit(actionId) && !assertEditable(actionId)) {
        return;
      }
      const handler = handlers.get(actionId);
      if (handler) {
        handler();
      } else {
        console.warn(`[ActionRegistry] No handler for action: ${actionId}`);
      }
    },
    [handlers],
  );

  // ── Toggle state ───────────────────────────────────────

  const getToggleState = useCallback(
    (actionId: ActionId): boolean => {
      switch (actionId) {
        case 'toggleGrid':
          return gridEnabled;
        case 'toggleSnap':
          return snapEnabled;
        case 'connectLanes':
          return connectModeActive;
        case 'defaultMode':
          return inDefaultMode;
        default:
          return false;
      }
    },
    [gridEnabled, snapEnabled, connectModeActive, inDefaultMode],
  );

  // ── Keyboard shortcuts ─────────────────────────────────

  useEffect(() => {
    const kbActions = getKeyBindingActions();

    const handler = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const inInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      for (const action of kbActions) {
        if (!action.keybinding) continue;

        // Skip non-global shortcuts when in input
        if (inInput && !action.keybinding.global) continue;

        if (matchesKeybinding(e, action.keybinding)) {
          e.preventDefault();
          execute(action.id);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [execute]);

  return {
    execute,
    getToggleState,
    actions: ACTION_DEFS,
  };
}
