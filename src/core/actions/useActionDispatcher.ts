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
import type { editorMachine, DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import {
  ACTION_DEFS,
  getKeyBindingActions,
  matchesKeybinding,
  type ActionDef,
} from './registry';

export interface ActionDispatcher {
  /** Execute an action by ID */
  execute: (actionId: string) => void;
  /** Get toggle state for toggle actions */
  getToggleState: (actionId: string) => boolean;
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

  // ── Handler map ────────────────────────────────────────

  const handlers = useMemo(() => {
    const map = new Map<string, () => void>();

    // File
    map.set('export', () => {
      const entities = useMapStore.getState().entities;
      const data = Array.from(entities.values());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apollo-map-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    map.set('settings', onOpenSettings);

    // Edit
    map.set('undo', () => useMapStore.temporal.getState().undo());
    map.set('redo', () => useMapStore.temporal.getState().redo());
    map.set('delete', () => actorRef.send({ type: 'DELETE_ENTITY' }));

    // View
    map.set('toggleGrid', () => useUIStore.getState().toggleGrid());
    map.set('toggleSnap', () => useUIStore.getState().toggleSnap());
    map.set('resetLayout', onResetLayout);
    map.set('commandPalette', onOpenCommandPalette);

    // Tools
    map.set('tool:select', () => actorRef.send({ type: 'CANCEL' }));
    map.set('tool:drawPolyline', () => actorRef.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' as DrawTool }));
    map.set('tool:drawBezier', () => actorRef.send({ type: 'SELECT_TOOL', tool: 'drawBezier' as DrawTool }));
    map.set('tool:drawArc', () => actorRef.send({ type: 'SELECT_TOOL', tool: 'drawArc' as DrawTool }));
    map.set('tool:drawRect', () => actorRef.send({ type: 'SELECT_TOOL', tool: 'drawRect' as DrawTool }));
    map.set('tool:drawPolygon', () => actorRef.send({ type: 'SELECT_TOOL', tool: 'drawPolygon' as DrawTool }));
    map.set('tool:drawCatmullRom', () => actorRef.send({ type: 'SELECT_TOOL', tool: 'drawCatmullRom' as DrawTool }));

    return map;
  }, [actorRef, onOpenCommandPalette, onOpenSettings, onResetLayout]);

  // ── Execute ────────────────────────────────────────────

  const execute = useCallback((actionId: string) => {
    const handler = handlers.get(actionId);
    if (handler) {
      handler();
    } else {
      console.warn(`[ActionRegistry] No handler for action: ${actionId}`);
    }
  }, [handlers]);

  // ── Toggle state ───────────────────────────────────────

  const getToggleState = useCallback((actionId: string): boolean => {
    switch (actionId) {
      case 'toggleGrid': return gridEnabled;
      case 'toggleSnap': return snapEnabled;
      default: return false;
    }
  }, [gridEnabled, snapEnabled]);

  // ── Keyboard shortcuts ─────────────────────────────────

  useEffect(() => {
    const kbActions = getKeyBindingActions();

    const handler = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const inInput = e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
        || e.target instanceof HTMLSelectElement;

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
