# Actions Registry

> Source: `src/core/actions/registry.ts` + `src/core/actions/registry/{definitions,helpers,types}.ts`

## Overview

`registry.ts` is a barrel that re-exports everything; the real code lives
in three sibling files:

| File                      | Responsibility                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `registry/types.ts`       | `ActionId` literal union, `ActionDef` shape, `KeyBinding`, `ActionCategory`, `ToolStripSlot` |
| `registry/definitions.ts` | The `ACTION_DEFS` array — single source of truth for every user-executable action            |
| `registry/helpers.ts`     | `ACTION_MAP`, getter functions, `matchesKeybinding`, `formatShortcut`, `isMacPlatform`       |

This is the R5 single-source-of-truth fix: every menu, command palette
entry, toolstrip slot, and keyboard shortcut reads from `ACTION_DEFS`.
Adding a new action means appending one row to `definitions.ts` (and
optionally pointing `drawTool` at a new FSM state). MenuBar / CommandPalette
/ ToolStrip / keyboard handlers all pick it up automatically.

## Exports

### Types

#### `ActionId`

```ts
type ActionId =
  | 'importApollo'
  | 'exportApolloBin'
  | 'exportApolloText'
  | 'settings'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'toggleGrid'
  | 'toggleSnap'
  | 'resetLayout'
  | 'commandPalette'
  | 'defaultMode'
  | 'connectLanes'
  | 'tool:drawPolyline'
  | 'tool:drawBezier'
  | 'tool:drawArc'
  | 'tool:drawRotatedRect'
  | 'tool:drawPolygon'
  | 'tool:drawCatmullRom';
```

A literal union — TypeScript catches typos in dispatcher switches at
compile time.

#### `ActionCategory`

```ts
type ActionCategory = 'file' | 'edit' | 'view' | 'tool' | 'selection';
```

#### `ToolStripSlot`

```ts
type ToolStripSlot = 'selection' | 'view';
```

Toolstrip slots that the registry reuses for non-draw actions (currently
only the View slot for grid/snap toggles).

#### `KeyBinding`

```ts
interface KeyBinding {
  key: string; // case-insensitive, matched via toLowerCase()
  ctrl?: boolean; // ctrl OR meta — matchesKeybinding treats them as one modifier
  shift?: boolean;
  alt?: boolean;
  global?: boolean; // true = consumed even when an input is focused
}
```

#### `ActionDef`

```ts
interface ActionDef {
  id: ActionId;
  label: string;
  category: ActionCategory;
  shortcut?: string; // canonical Mac glyph form, e.g. '⇧⌘Z'
  keybinding?: KeyBinding; // matcher input
  icon?: IconType; // react-icons component (FaPencil, FaGear, …)
  inCommandPalette: boolean; // does it show up in ⌘K?
  menu?: string; // menubar parent: 'File' | 'Edit' | 'View'
  menuOrder?: number; // ascending sort within menu
  isToggle?: boolean; // shown with a check mark when active
  drawTool?: DrawTool; // FSM tool this action selects
  uiSlot?: ToolStripSlot;
  uiOrder?: number;
}
```

### Constants

#### `ACTION_DEFS: ActionDef[]`

The full registry. Every consumer derives from this array.

#### `ACTION_MAP: Map<ActionId, ActionDef>`

`new Map(ACTION_DEFS.map((a) => [a.id, a]))`. Constant-time lookup by id.

### Functions

#### `getActionsByCategory(category: ActionCategory): ActionDef[]`

Filter the registry by category (no sort).

#### `getMenuActions(menu: string): ActionDef[]`

Returns all actions whose `menu === menu`, sorted by `menuOrder` (default
99 if absent). MenuBar consumes this.

#### `getMenuNames(): string[]`

Returns the unique set of `menu` strings across `ACTION_DEFS`. Drives
the menubar's top-level entries.

#### `getCommandPaletteActions(): ActionDef[]`

Filter by `inCommandPalette: true`. CommandPalette renders these as a
flat list with fuzzy search.

#### `getKeyBindingActions(): ActionDef[]`

Filter by `keybinding != null`. The keyboard handler iterates this list
and runs `matchesKeybinding(event, action.keybinding!)` against each.

#### `getToolAction(drawTool: DrawTool): ActionDef | undefined`

Reverse-lookup: given an FSM `DrawTool` string, return the `ActionDef`.
ToolStrip uses this to render the active tool's icon and shortcut.

#### `getToolStripSlotActions(slot: ToolStripSlot): ActionDef[]`

Filter by `uiSlot`, sorted by `uiOrder`. Used to render slot-specific
buttons (e.g. grid/snap in the view slot).

#### `matchesKeybinding(e: KeyBindingEvent, kb: KeyBinding): boolean`

```ts
type KeyBindingEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;
```

Returns true iff every modifier matches and the lowercased key matches.
Treats `ctrl` and `meta` as the same modifier — `⌘S` and `Ctrl+S` both
fire `exportApolloBin`. Modifier flags must match exactly: a binding
without `shift` will reject events where Shift is held.

#### `isMacPlatform(): boolean`

Memoised platform check. Tries `navigator.userAgentData.platform` first
(Chromium UA-CH), falls back to deprecated `navigator.platform`, finally
sniffs `navigator.userAgent` (catches iPad masquerading as desktop
Safari). Cached after the first call.

#### `_resetIsMacCache(): void`

Test-only escape hatch that clears the memoised mac flag.

#### `formatShortcut(shortcut: string | undefined): string`

Renders the canonical Mac glyph string for the current platform. Mac
returns the input unchanged; non-Mac maps `⌘ ⌃ → Ctrl+`, `⇧ → Shift+`,
`⌥ → Alt+`. Non-modifier glyphs (`⌫`, `⏎`) pass through.

::: info Why glyphs, not strings
Registry authors write `'⇧⌘Z'` once. The keybinding matcher already
normalises `ctrl|meta`, so we only need to fix the _display_ per
platform — not the dispatch path.
:::

## Behavior

- Every menu/command-palette/toolstrip consumer pulls from `ACTION_DEFS`
  via the typed getters; no module imports `ACTION_MAP` from outside
  helpers (avoid cycles).
- `ActionId` is a literal union, so TypeScript catches typos in
  dispatcher switches at compile time.
- Shortcuts are written once in canonical Mac glyph form; `formatShortcut`
  rewrites to platform on render.
- Keybinding matching is case-insensitive on the key, exact on
  modifiers, with `ctrl|meta` collapsed to one bit.

## Action catalogue

### File

| id                 | shortcut | menuOrder | inCommandPalette |
| ------------------ | -------- | --------- | ---------------- |
| `importApollo`     | —        | 1         | yes              |
| `exportApolloBin`  | `⌘S`     | 11        | yes              |
| `exportApolloText` | `⇧⌘S`    | 12        | yes              |
| `settings`         | `⌘,`     | 90        | yes              |

### Edit

| id             | shortcut | menuOrder | toggle |
| -------------- | -------- | --------- | ------ |
| `undo`         | `⌘Z`     | 10        | —      |
| `redo`         | `⇧⌘Z`    | 20        | —      |
| `delete`       | `⌫`      | 40        | —      |
| `connectLanes` | `C`      | 50        | yes    |

### View

| id               | shortcut | menuOrder | toggle | uiSlot |
| ---------------- | -------- | --------- | ------ | ------ |
| `resetLayout`    | —        | 10        | —      | —      |
| `toggleGrid`     | `⌘G`     | 20        | yes    | view   |
| `toggleSnap`     | —        | 30        | yes    | view   |
| `commandPalette` | `⌘K`     | —         | —      | —      |

### Selection

| id            | shortcut | toggle |
| ------------- | -------- | ------ |
| `defaultMode` | `H`      | yes    |

### Tool (drawTool)

| id                     | shortcut | drawTool          |
| ---------------------- | -------- | ----------------- |
| `tool:drawPolyline`    | `P`      | `drawPolyline`    |
| `tool:drawBezier`      | `B`      | `drawBezier`      |
| `tool:drawArc`         | `A`      | `drawArc`         |
| `tool:drawRotatedRect` | `R`      | `drawRotatedRect` |
| `tool:drawPolygon`     | `G`      | `drawPolygon`     |
| `tool:drawCatmullRom`  | —        | `drawCatmullRom`  |

::: warning Shortcut conflict
`G` is bound to **both** `toggleGrid` (`{ key: 'g', ctrl: true }`) and
`tool:drawPolygon` (`{ key: 'g' }`). Modifier specificity in
`matchesKeybinding` keeps them disjoint — Ctrl+G hits the toggle, plain
G picks the polygon tool. Adding a third `g`-bound action would silently
collide.
:::

## Examples

Adding a new action — say a "Toggle Inspector" action:

```ts
// registry/types.ts: extend the union
type ActionId = /* ... */ | 'toggleInspector';

// registry/definitions.ts: append one row
{
  id: 'toggleInspector',
  label: 'Toggle Inspector',
  category: 'view',
  shortcut: '⌘I',
  keybinding: { key: 'i', ctrl: true, global: true },
  icon: FaSidebar,
  inCommandPalette: true,
  menu: 'View',
  menuOrder: 40,
  isToggle: true,
}
```

The MenuBar, CommandPalette, and keyboard handler will pick it up after
the dispatcher in `useActionDispatcher.ts` adds a case for the new id.

Wiring the keyboard handler:

```ts
// useGlobalKeydown.ts (excerpt)
import { getKeyBindingActions, matchesKeybinding, ACTION_MAP } from '@/core/actions/registry';

const actions = getKeyBindingActions();

window.addEventListener('keydown', (e) => {
  for (const action of actions) {
    if (!action.keybinding) continue;
    if (!matchesKeybinding(e, action.keybinding)) continue;
    if (!action.keybinding.global && isInputFocused()) continue;
    e.preventDefault();
    dispatch(action.id);
    return;
  }
});
```

Rendering a menu (excerpt from `MenuBar.tsx`):

```ts
import { getMenuActions, formatShortcut } from '@/core/actions/registry';

function FileMenu() {
  return (
    <Menu>
      {getMenuActions('File').map((action) => (
        <MenuItem
          key={action.id}
          onClick={() => dispatch(action.id)}
          rightSlot={formatShortcut(action.shortcut)}
        >
          {action.label}
        </MenuItem>
      ))}
    </Menu>
  );
}
```

## Related

- [FSM: editorMachine](/api/core/fsm-editor-machine) — `drawTool` ids match `DrawTool` state node names
- [Architecture: action registry](/architecture/cold-hot-layers#action-registry-r5)
