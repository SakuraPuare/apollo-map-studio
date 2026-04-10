import { describe, it, expect } from 'vitest';
import {
  ACTION_DEFS,
  ACTION_MAP,
  getMenuActions,
  getCommandPaletteActions,
  getKeyBindingActions,
  matchesKeybinding,
  type ActionDef,
} from '../registry';

describe('Action Registry', () => {
  // ── Structural integrity ────────────────────────────────

  it('every action has a unique ID', () => {
    const ids = ACTION_DEFS.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every action has a non-empty label', () => {
    for (const a of ACTION_DEFS) {
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it('every action has a valid category', () => {
    const validCategories = ['file', 'edit', 'view', 'tool', 'selection'];
    for (const a of ACTION_DEFS) {
      expect(validCategories).toContain(a.category);
    }
  });

  it('ACTION_MAP covers all definitions', () => {
    expect(ACTION_MAP.size).toBe(ACTION_DEFS.length);
  });

  // ── Coverage checks ─────────────────────────────────────

  it('all tool actions define a drawTool or are the select tool', () => {
    const toolActions = ACTION_DEFS.filter((a) => a.category === 'tool');
    for (const a of toolActions) {
      if (a.id === 'tool:select') continue;
      expect(a.drawTool, `${a.id} missing drawTool`).toBeDefined();
    }
  });

  it('all actions with shortcuts have keybindings defined', () => {
    const withShortcuts = ACTION_DEFS.filter(
      (a) => a.shortcut && a.shortcut.length <= 3 // single-key shortcuts
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

  it('File menu has at least export and settings', () => {
    const fileActions = getMenuActions('File');
    const ids = fileActions.map((a) => a.id);
    expect(ids).toContain('export');
    expect(ids).toContain('settings');
  });

  it('Edit menu has undo, redo, and delete', () => {
    const editActions = getMenuActions('Edit');
    const ids = editActions.map((a) => a.id);
    expect(ids).toContain('undo');
    expect(ids).toContain('redo');
    expect(ids).toContain('delete');
  });

  it('View menu has grid and snap toggles', () => {
    const viewActions = getMenuActions('View');
    const ids = viewActions.map((a) => a.id);
    expect(ids).toContain('toggleGrid');
    expect(ids).toContain('toggleSnap');
  });

  it('menu actions are sorted by menuOrder', () => {
    for (const menu of ['File', 'Edit', 'View']) {
      const actions = getMenuActions(menu);
      for (let i = 1; i < actions.length; i++) {
        expect(
          (actions[i - 1].menuOrder ?? 99) <= (actions[i].menuOrder ?? 99),
          `${menu} menu: ${actions[i - 1].id} should come before ${actions[i].id}`
        ).toBe(true);
      }
    }
  });

  // ── Command palette coverage ────────────────────────────

  it('command palette includes all tool actions', () => {
    const cpActions = getCommandPaletteActions();
    const cpIds = new Set(cpActions.map((a) => a.id));
    const toolActions = ACTION_DEFS.filter((a) => a.category === 'tool');

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

  function fakeEvent(opts: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }): KeyboardEvent {
    return {
      key: opts.key,
      ctrlKey: opts.ctrlKey ?? false,
      metaKey: opts.metaKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      altKey: opts.altKey ?? false,
    } as unknown as KeyboardEvent;
  }

  it('matchesKeybinding works for simple key', () => {
    expect(matchesKeybinding(fakeEvent({ key: 'v' }), { key: 'v' })).toBe(true);
    expect(matchesKeybinding(fakeEvent({ key: 'v' }), { key: 'b' })).toBe(false);
  });

  it('matchesKeybinding works for ctrl+key', () => {
    expect(matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true }), { key: 'z', ctrl: true })).toBe(true);
    expect(matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true }), { key: 'z' })).toBe(false);
  });

  it('matchesKeybinding works for ctrl+shift+key', () => {
    expect(matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true, shiftKey: true }), { key: 'z', ctrl: true, shift: true })).toBe(true);
    expect(matchesKeybinding(fakeEvent({ key: 'z', ctrlKey: true, shiftKey: true }), { key: 'z', ctrl: true })).toBe(false);
  });

  // ── All draw tools are registered ───────────────────────

  it('all DrawTool types have a corresponding action', () => {
    const drawTools = [
      'drawPolyline', 'drawCatmullRom', 'drawBezier',
      'drawArc', 'drawRect', 'drawPolygon',
    ];

    for (const tool of drawTools) {
      const action = ACTION_DEFS.find((a) => a.drawTool === tool);
      expect(action, `No action registered for DrawTool "${tool}"`).toBeDefined();
    }
  });

  // ── Toggle actions have isToggle flag ───────────────────

  it('toggle actions are marked with isToggle', () => {
    const toggleIds = ['toggleGrid', 'toggleSnap'];
    for (const id of toggleIds) {
      const action = ACTION_MAP.get(id);
      expect(action?.isToggle, `${id} should have isToggle=true`).toBe(true);
    }
  });
});
