import type { DrawTool } from '@/core/fsm/editorMachine';
import type { WorkspaceMode } from '@/core/workspaceViews';
import { isWorkspaceViewActionId, getWorkspaceViewByActionId } from '@/core/workspaceViews';
import { getActionDefs } from './definitions';
import type { ActionCategory, ActionDef, KeyBinding, ToolStripSlot } from './types';

export type KeyBindingEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

export function getActionMap(): Map<ActionDef['id'], ActionDef> {
  return new Map(getActionDefs().map((a) => [a.id, a]));
}

export function getActionsByCategory(category: ActionCategory): ActionDef[] {
  return getActionDefs().filter((a) => a.category === category);
}

export function getMenuActions(menu: string): ActionDef[] {
  return getActionDefs()
    .filter((a) => a.menu === menu)
    .sort((a, b) => (a.menuOrder ?? 99) - (b.menuOrder ?? 99));
}

export function getMenuActionsForMode(menu: string, mode: WorkspaceMode): ActionDef[] {
  return getMenuActions(menu).filter((action) => isActionAvailableForMode(action, mode));
}

export function getMenuNames(): string[] {
  const menus = new Set<string>();
  getActionDefs().forEach((a) => {
    if (a.menu) menus.add(a.menu);
  });
  return Array.from(menus);
}

export function getCommandPaletteActions(): ActionDef[] {
  return getActionDefs().filter((a) => a.inCommandPalette);
}

export function getCommandPaletteActionsForMode(mode: WorkspaceMode): ActionDef[] {
  return getCommandPaletteActions().filter((action) => isActionAvailableForMode(action, mode));
}

export function getKeyBindingActions(): ActionDef[] {
  return getActionDefs().filter((a) => a.keybinding);
}

export function getToolAction(drawTool: DrawTool): ActionDef | undefined {
  return getActionDefs().find((a) => a.drawTool === drawTool);
}

export function getToolStripSlotActions(slot: ToolStripSlot): ActionDef[] {
  return getActionDefs()
    .filter((a) => a.uiSlot === slot)
    .sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99));
}

export function isActionAvailableForMode(action: ActionDef, mode: WorkspaceMode): boolean {
  if (!isWorkspaceViewActionId(action.id)) return true;
  return Boolean(getWorkspaceViewByActionId(action.id, mode));
}

export function matchesKeybinding(e: KeyBindingEvent, kb: KeyBinding): boolean {
  if (e.key.toLowerCase() !== kb.key.toLowerCase()) return false;
  if (!!kb.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (!!kb.shift !== e.shiftKey) return false;
  if (!!kb.alt !== e.altKey) return false;
  return true;
}

// ─── Platform-aware shortcut display ─────────────────────────────────
//
// Registry authors write the canonical Mac glyph form (⌘S, ⇧⌘Z, ⌥⌫…) once.
// At render time we map those glyphs to Ctrl+/Shift+/Alt+ on non-Mac. The
// keybinding matcher already treats ctrl+meta as the same modifier, so we
// only need to fix the *display*, not the dispatch path.

let cachedIsMac: boolean | null = null;

interface NavigatorUAData {
  platform?: string;
}

export function isMacPlatform(): boolean {
  if (cachedIsMac !== null) return cachedIsMac;
  if (typeof navigator === 'undefined') {
    cachedIsMac = false;
    return cachedIsMac;
  }
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  if (uaData?.platform) {
    cachedIsMac = /mac/i.test(uaData.platform);
    return cachedIsMac;
  }
  // navigator.platform is deprecated but still populated everywhere we ship.
  // userAgent fallback covers iPad masquerading as desktop Safari.
  const platform = navigator.platform ?? '';
  const ua = navigator.userAgent ?? '';
  cachedIsMac = /Mac|iPhone|iPad|iPod/.test(platform) || /Macintosh|iPhone|iPad|iPod/.test(ua);
  return cachedIsMac;
}

/** Test-only: reset the memoised platform check between tests. */
export function _resetIsMacCache(): void {
  cachedIsMac = null;
}

/**
 * Render a registry shortcut string for the current platform. Mac keeps the
 * compact glyph form (`⌘S`); other platforms get `Ctrl+S`-style spelling.
 * Non-modifier glyphs (`⌫` Backspace, `⏎` Return, etc.) pass through.
 */
export function formatShortcut(shortcut: string | undefined): string {
  if (!shortcut) return '';
  if (isMacPlatform()) return shortcut;
  // Order matters: split modifier prefix from the trailing key. The registry
  // always lists modifiers in canonical ⌃⌥⇧⌘ order, then the key glyph last.
  return shortcut
    .replace(/⌘/g, 'Ctrl+')
    .replace(/⌃/g, 'Ctrl+')
    .replace(/⇧/g, 'Shift+')
    .replace(/⌥/g, 'Alt+');
}
