import type { DrawTool } from '@/core/fsm/editorMachine';
import { ACTION_DEFS } from './definitions';
import type { ActionCategory, ActionDef, KeyBinding, ToolStripSlot } from './types';

export type KeyBindingEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

export const ACTION_MAP = new Map(ACTION_DEFS.map((a) => [a.id, a]));

export function getActionsByCategory(category: ActionCategory): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.category === category);
}

export function getMenuActions(menu: string): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.menu === menu).sort(
    (a, b) => (a.menuOrder ?? 99) - (b.menuOrder ?? 99),
  );
}

export function getMenuNames(): string[] {
  const menus = new Set<string>();
  ACTION_DEFS.forEach((a) => {
    if (a.menu) menus.add(a.menu);
  });
  return Array.from(menus);
}

export function getCommandPaletteActions(): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.inCommandPalette);
}

export function getKeyBindingActions(): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.keybinding);
}

export function getToolAction(drawTool: DrawTool): ActionDef | undefined {
  return ACTION_DEFS.find((a) => a.drawTool === drawTool);
}

export function getToolStripSlotActions(slot: ToolStripSlot): ActionDef[] {
  return ACTION_DEFS.filter((a) => a.uiSlot === slot).sort(
    (a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99),
  );
}

export function matchesKeybinding(e: KeyBindingEvent, kb: KeyBinding): boolean {
  if (e.key.toLowerCase() !== kb.key.toLowerCase()) return false;
  if (!!kb.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (!!kb.shift !== e.shiftKey) return false;
  if (!!kb.alt !== e.altKey) return false;
  return true;
}
