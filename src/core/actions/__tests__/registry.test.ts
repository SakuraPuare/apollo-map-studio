import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import {
  formatShortcut,
  getActionDefs,
  getActionMap,
  getMenuActions,
  getMenuActionsForMode,
  getCommandPaletteActions,
  getCommandPaletteActionsForMode,
  getKeyBindingActions,
  getToolStripSlotActions,
  matchesKeybinding,
} from '../registry';
import { _resetIsMacCache } from '../registry/helpers';
import { getSidebarViewsByPlacement, getWorkspaceViewDefs } from '@/core/workspaceViews';
import type { KeyBindingEvent } from '../registry';

registerBuiltinWorkspaceContributions();

describe('Action Registry', () => {
  // ── Structural integrity ────────────────────────────────

  it('every action has a unique ID', () => {
    const ids = getActionDefs().map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every action has a non-empty label', () => {
    for (const a of getActionDefs()) {
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it('every action has a valid category', () => {
    const validCategories = ['file', 'edit', 'view', 'tool', 'selection', 'help'];
    for (const a of getActionDefs()) {
      expect(validCategories).toContain(a.category);
    }
  });

  it('action map covers all definitions', () => {
    expect(getActionMap().size).toBe(getActionDefs().length);
  });

  it('selection ToolStrip slot exposes top-level mode actions', () => {
    expect(getToolStripSlotActions('selection').map((a) => a.id)).toEqual([
      'defaultMode',
      'connectLanes',
      'boundaryBrush',
    ]);
  });

  // ── Coverage checks ─────────────────────────────────────

  it('all tool actions define a drawTool', () => {
    const toolActions = getActionDefs().filter((a) => a.category === 'tool');
    for (const a of toolActions) {
      expect(a.drawTool, `${a.id} missing drawTool`).toBeDefined();
    }
  });

  it('all actions with shortcuts have keybindings defined', () => {
    const withShortcuts = getActionDefs().filter(
      (a) => a.shortcut && a.shortcut.length <= 3, // single-key shortcuts
    );
    for (const a of withShortcuts) {
      expect(a.keybinding, `${a.id} has shortcut "${a.shortcut}" but no keybinding`).toBeDefined();
    }
  });

  it('no duplicate keybindings', () => {
    const kbActions = getKeyBindingActions();
    const seen = new Map<string, string>();

    for (const a of kbActions) {
      const kb = a.keybinding!;
      const key = `${kb.ctrl ? 'C' : ''}${kb.shift ? 'S' : ''}${kb.alt ? 'A' : ''}+${kb.key}`;
      if (seen.has(key)) {
        // ctrl+g and 'g' alone are different, only flag exact duplicates
        throw new Error(`Duplicate keybinding "${key}": ${seen.get(key)} and ${a.id}`);
      }
      seen.set(key, a.id);
    }
  });

  // ── Menu coverage ───────────────────────────────────────

  it('File menu has Apollo import/export and settings', () => {
    const fileActions = getMenuActions('File');
    const ids = fileActions.map((a) => a.id);
    expect(ids).toContain('importApollo');
    expect(ids).toContain('exportApolloBin');
    expect(ids).toContain('exportApolloText');
    expect(ids).toContain('settings');
  });

  it('Edit menu has undo, redo, and delete', () => {
    const editActions = getMenuActions('Edit');
    const ids = editActions.map((a) => a.id);
    expect(ids).toContain('undo');
    expect(ids).toContain('redo');
    expect(ids).toContain('delete');
    expect(ids).toContain('boundaryBrush');
  });

  it('View menu has grid and snap toggles', () => {
    const viewActions = getMenuActions('View');
    const ids = viewActions.map((a) => a.id);
    expect(ids).toContain('toggleGrid');
    expect(ids).toContain('toggleSnap');
  });

  it('View menu exposes workspace panels', () => {
    const viewActions = getMenuActions('View');
    const ids = viewActions.map((a) => a.id);
    for (const view of getWorkspaceViewDefs()) {
      expect(ids).toContain(view.actionId);
    }
  });

  it('View menu filters mode-scoped workspace panels', () => {
    const drawingIds = getMenuActionsForMode('View', 'drawing').map((a) => a.id);
    const sceneIds = getMenuActionsForMode('View', 'scene').map((a) => a.id);
    expect(drawingIds).not.toContain('view:timeline');
    expect(sceneIds).toContain('view:timeline');
  });

  it('command palette filters mode-scoped workspace panels', () => {
    const drawingIds = getCommandPaletteActionsForMode('drawing').map((a) => a.id);
    const sceneIds = getCommandPaletteActionsForMode('scene').map((a) => a.id);
    expect(drawingIds).not.toContain('view:timeline');
    expect(sceneIds).toContain('view:timeline');
  });

  it('resolves workspace actions after contributions are bootstrapped', () => {
    const actionIds = getActionDefs().map((a) => a.id);
    for (const view of getWorkspaceViewDefs()) {
      expect(actionIds).toContain(view.actionId);
    }
  });

  it('sidebar activity views are contributed by mode', () => {
    const drawingIds = getSidebarViewsByPlacement('top', 'drawing').map((view) => view.id);
    const sceneIds = getSidebarViewsByPlacement('top', 'scene').map((view) => view.id);
    expect(drawingIds).toEqual(['outline', 'layers', 'search']);
    expect(sceneIds).toEqual(['outline', 'layers', 'search']);
  });

  it('About menu has version information and help documentation', () => {
    const aboutActions = getMenuActions('About');
    const ids = aboutActions.map((a) => a.id);
    expect(ids).toContain('about');
    expect(ids).toContain('openHelp');
  });

  it('menu actions are sorted by menuOrder', () => {
    for (const menu of ['File', 'Edit', 'View', 'About']) {
      const actions = getMenuActions(menu);
      for (let i = 1; i < actions.length; i++) {
        const prev = actions[i - 1]!;
        const curr = actions[i]!;
        expect(
          (prev.menuOrder ?? 99) <= (curr.menuOrder ?? 99),
          `${menu} menu: ${prev.id} should come before ${curr.id}`,
        ).toBe(true);
      }
    }
  });

  // ── Command palette coverage ────────────────────────────

  it('command palette includes all tool actions', () => {
    const cpActions = getCommandPaletteActions();
    const cpIds = new Set(cpActions.map((a) => a.id));
    const toolActions = getActionDefs().filter((a) => a.category === 'tool');

    for (const t of toolActions) {
      expect(cpIds.has(t.id), `Tool "${t.id}" not in command palette`).toBe(true);
    }
  });

  it('command palette includes undo/redo/delete', () => {
    const cpIds = new Set(getCommandPaletteActions().map((a) => a.id));
    expect(cpIds.has('undo')).toBe(true);
    expect(cpIds.has('redo')).toBe(true);
    expect(cpIds.has('delete')).toBe(true);
  });

  it('command palette does not include itself', () => {
    const cpIds = new Set(getCommandPaletteActions().map((a) => a.id));
    expect(cpIds.has('commandPalette')).toBe(false);
  });

  // ── Keybinding matching ─────────────────────────────────

  function fakeEvent(opts: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }): KeyBindingEvent {
    return {
      key: opts.key,
      ctrlKey: opts.ctrlKey ?? false,
      metaKey: opts.metaKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      altKey: opts.altKey ?? false,
    };
  }

  it('matchesKeybinding works for simple key', () => {
    expect(matchesKeybinding(fakeEvent({ key: 'v' }), { key: 'v' })).toBe(true);
    expect(matchesKeybinding(fakeEvent({ key: 'v' }), { key: 'b' })).toBe(false);
  });

  it('matchesKeybinding works for ctrl+key', () => {
    expect(
      matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true }), { key: 'z', ctrl: true }),
    ).toBe(true);
    expect(matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true }), { key: 'z' })).toBe(false);
  });

  it('matchesKeybinding works for ctrl+shift+key', () => {
    expect(
      matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true, shiftKey: true }), {
        key: 'z',
        ctrl: true,
        shift: true,
      }),
    ).toBe(true);
    expect(
      matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true, shiftKey: true }), {
        key: 'z',
        ctrl: true,
      }),
    ).toBe(false);
  });

  // ── All draw tools are registered ───────────────────────

  it('all DrawTool types have a corresponding action', () => {
    // drawRect was unified into drawRotatedRect (legacy project only had the
    // rotatable rect tool); the axis-aligned FSM state still exists but is
    // no longer user-reachable via action registry.
    const drawTools = [
      'drawPolyline',
      'drawCatmullRom',
      'drawBezier',
      'drawArc',
      'drawRotatedRect',
      'drawPolygon',
    ];

    for (const tool of drawTools) {
      const action = getActionDefs().find((a) => a.drawTool === tool);
      expect(action, `No action registered for DrawTool "${tool}"`).toBeDefined();
    }
  });

  // ── Platform-aware shortcut formatting ──────────────────

  describe('formatShortcut', () => {
    beforeEach(() => _resetIsMacCache());
    afterEach(() => {
      vi.unstubAllGlobals();
      _resetIsMacCache();
    });

    function stubPlatform(platform: string, ua = '') {
      vi.stubGlobal('navigator', { platform, userAgent: ua });
    }

    it('keeps Mac glyphs verbatim on macOS', () => {
      stubPlatform('MacIntel');
      expect(formatShortcut('⌘S')).toBe('⌘S');
      expect(formatShortcut('⇧⌘Z')).toBe('⇧⌘Z');
      expect(formatShortcut('⌘,')).toBe('⌘,');
    });

    it('rewrites Mac glyphs to Ctrl/Shift/Alt on Windows', () => {
      stubPlatform('Win32');
      expect(formatShortcut('⌘S')).toBe('Ctrl+S');
      expect(formatShortcut('⇧⌘Z')).toBe('Shift+Ctrl+Z');
      expect(formatShortcut('⌘,')).toBe('Ctrl+,');
    });

    it('rewrites Mac glyphs on Linux', () => {
      stubPlatform('Linux x86_64');
      expect(formatShortcut('⌘K')).toBe('Ctrl+K');
    });

    it('passes through non-modifier glyphs and bare letters', () => {
      stubPlatform('Win32');
      expect(formatShortcut('⌫')).toBe('⌫');
      expect(formatShortcut('H')).toBe('H');
    });

    it('handles undefined/empty input', () => {
      stubPlatform('Win32');
      expect(formatShortcut(undefined)).toBe('');
      expect(formatShortcut('')).toBe('');
    });
  });

  // ── Toggle actions have isToggle flag ───────────────────

  it('toggle actions are marked with isToggle', () => {
    const toggleIds = ['toggleGrid', 'toggleSnap'] as const;
    for (const id of toggleIds) {
      const action = getActionMap().get(id);
      expect(action?.isToggle, `${id} should have isToggle=true`).toBe(true);
    }
  });
});
