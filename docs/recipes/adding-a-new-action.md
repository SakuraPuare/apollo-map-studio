# Adding a New Action

The action registry (`src/core/actions/registry.ts`) is the single
source of truth for every user-executable command in the app — menu
items, command palette entries, keyboard shortcuts, tool-strip
buttons, and dispatcher targets all read from this one list.

Adding a new action that does not need a new map element type or new
FSM draw state is a single-file change. This recipe shows the full
shape of an `ActionDef`, the dispatcher contract, and how to verify
the result.

## When to use this recipe

- You're adding a "Toggle X overlay" menu item.
- You're wiring a new `Cmd+Shift+P`-style shortcut.
- You're exposing an existing internal handler in the command palette.

If you also need a new map element, follow
[adding-a-new-element](./adding-a-new-element.md) — that recipe ends
with this one as its final step. If you're extending the FSM with a
new draw state, see
[adding-a-new-drawing-tool](./adding-a-new-drawing-tool.md).

## The `ActionDef` shape

Defined in `src/core/actions/registry/types.ts`:

```ts
export interface ActionDef {
  id: ActionId; // literal union — statically checked
  label: string; // displayed in menus / palette
  category: ActionCategory; // 'file' | 'edit' | 'view' | 'tool' | 'selection'
  shortcut?: string; // human-readable display (Mac glyphs)
  keybinding?: KeyBinding; // dispatch matcher — see below
  icon?: IconType; // react-icons component
  inCommandPalette: boolean; // visible in Cmd+K palette
  menu?: string; // 'File' | 'Edit' | 'View' | …
  menuOrder?: number; // sort order within the menu
  isToggle?: boolean; // shows a checkmark / active state
  drawTool?: DrawTool; // 'drawPolyline' | … — for tool actions
  uiSlot?: ToolStripSlot; // 'selection' | 'view' — for tool-strip
  uiOrder?: number; // sort order within the slot
}
```

`KeyBinding`:

```ts
export interface KeyBinding {
  key: string; // 'k', 'z', 'delete', '/' — lowercased on dispatch
  ctrl?: boolean; // matches Ctrl OR Meta (treated identically)
  shift?: boolean;
  alt?: boolean;
  global?: boolean; // fires even when an input is focused
}
```

::: tip Platform-aware shortcut display
Authors write the canonical Mac glyph form (`⌘S`, `⇧⌘Z`, `⌥⌫`) once.
`formatShortcut()` in `helpers.ts` rewrites those glyphs to
`Ctrl+S`, `Shift+Ctrl+Z`, `Alt+⌫` on non-Mac at render time. The
matcher in `matchesKeybinding()` already treats `Ctrl` and `Cmd` as
the same modifier, so a single `{ key: 's', ctrl: true }` covers both
platforms.
:::

## Categories and what they imply

| Category    | License gate  | Typical use                |
| ----------- | ------------- | -------------------------- |
| `file`      | no            | import / export / settings |
| `edit`      | yes (canEdit) | undo / redo / delete       |
| `view`      | no            | grid / snap / palette      |
| `tool`      | yes           | drawing tool selectors     |
| `selection` | yes           | mode toggles               |

`useActionDispatcher` (`src/hooks/useActionDispatcher.ts`) blocks
`edit` / `tool` / `selection` actions when the license is not in an
editable state, plus the explicit `connectLanes` id. New actions in
those categories inherit that gate automatically.

## Worked example — "Toggle Lane Labels"

A view-layer toggle that shows or hides lane id labels on the map.

### Step 1 — Add the id

```ts
// src/core/actions/registry/types.ts
export type ActionId =
  | 'importApollo'
  | // … existing ids …
  | 'toggleLaneLabels';
```

### Step 2 — Add the def

```ts
// src/core/actions/registry/definitions.ts
import { FaTag } from 'react-icons/fa6';

export const ACTION_DEFS: ActionDef[] = [
  // … existing defs …
  {
    id: 'toggleLaneLabels',
    label: 'Toggle Lane Labels',
    category: 'view',
    shortcut: '⌘L',
    keybinding: { key: 'l', ctrl: true, global: true },
    icon: FaTag,
    inCommandPalette: true,
    menu: 'View',
    menuOrder: 40,
    isToggle: true,
  },
];
```

### Step 3 — Wire the handler

The dispatcher's handler map is in `useActionDispatcher`:

```ts
// src/hooks/useActionDispatcher.ts
map.set('toggleLaneLabels', () => useUIStore.getState().toggleLaneLabels());
```

If your toggle reflects a piece of state, also extend `getToggleState`
so the menu / palette / strip can render the active indicator:

```ts
const laneLabelsEnabled = useUIStore((s) => s.laneLabelsEnabled);

// inside getToggleState:
case 'toggleLaneLabels': return laneLabelsEnabled;
```

### Step 4 — Implement the underlying state (if new)

Add `laneLabelsEnabled` and `toggleLaneLabels` to `src/store/uiStore.ts`,
and consume the flag wherever the labels are rendered (likely a layer
hook under `src/hooks/`).

### Step 5 — Confirm propagation

You do **not** edit `MenuBar`, `CommandPalette`, or `ToolStrip`. They
all consume the registry through helper functions in
`src/core/actions/registry/helpers.ts`:

| Surface          | Helper used                     |
| ---------------- | ------------------------------- |
| MenuBar          | `getMenuActions(menuName)`      |
| CommandPalette   | `getCommandPaletteActions()`    |
| ToolStrip        | `getToolStripSlotActions(slot)` |
| Keyboard handler | `getKeyBindingActions()`        |
| Tool dispatch    | `getToolAction(drawTool)`       |

Adding the def is enough. Run `pnpm dev`:

- `View > Toggle Lane Labels` appears in the menubar at order 40.
- `Cmd+K` palette shows the entry; pressing it fires the handler.
- `Cmd+L` toggles the state and the menu/palette show the checkmark.

## Variations

### Tool action

Tool actions arm the FSM. Set `category: 'tool'` and `drawTool: '<state>'`:

```ts
{
  id: 'tool:drawPolyline',
  label: 'Draw Polyline',
  category: 'tool',
  shortcut: 'P',
  keybinding: { key: 'p' },
  icon: FaPencil,
  inCommandPalette: true,
  drawTool: 'drawPolyline',
}
```

`useActionDispatcher` walks `ACTION_DEFS` once and registers a
`SELECT_TOOL` handler for every entry that carries a `drawTool`. No
explicit handler-map line is needed.

### Tool-strip slot action

```ts
uiSlot: 'view',
uiOrder: 20,
```

Causes the action to render as a button in the corresponding ToolStrip
slot. `getToolStripSlotActions(slot)` returns them sorted by `uiOrder`.

### Palette-only action

Some commands shouldn't have a menu entry (too obscure, or just a
shortcut surface). Set `inCommandPalette: true`, omit `menu`. The
`commandPalette` action itself is the inverse: `inCommandPalette:
false` because it opens the palette and shouldn't be findable from
within it.

### Modifier-only "global" shortcuts

Without `global: true`, the shortcut is **suppressed** while focus is
in an `<input>` / `<textarea>` / `<select>`. Set `global: true` for
shortcuts that must work everywhere (Save, Undo, Cmd+K). The keyboard
handler in `useActionDispatcher` enforces this:

```ts
if (inInput && !action.keybinding.global) continue;
```

## Verification

1. `pnpm typecheck` — `ActionId` literal union enforces the new id at
   call sites; if you forget to add it, `execute('toggleLaneLabels')`
   fails to compile.
2. `pnpm lint` — no rule changes, but the file should pass.
3. `pnpm test` — extend `src/core/actions/__tests__/registry.test.ts`
   to assert the new entry exists and exposes the expected fields.
4. Manual: open the View menu, the command palette, press the shortcut,
   verify the toggle state renders correctly.

## Common mistakes

- **Forgetting the `ActionId` literal**: typecheck fails at every call
  site of `execute(id)`. Symptom: red squiggles in unrelated
  components.
- **Leaking a `tool:` handler outside the registry**: don't add a
  `map.set('tool:foo', …)` line if the def already declares
  `drawTool`. The dispatcher loops `ACTION_DEFS` and would register
  twice.
- **Setting `global: true` on a destructive shortcut**: a `Cmd+Backspace`
  global shortcut deletes selection while the user is editing inspector
  text. Default to non-global unless the action is genuinely
  cross-cutting.
- **Overlapping `keybinding`**: two defs matching the same event fire
  the **first** one in `ACTION_DEFS` order. Resolve by giving one a
  modifier, not by reordering.

## Cross-references

- [/architecture/overview](../architecture/overview.md) — action
  registry as the dispatch single-source-of-truth
- [Core API](/api/core/) — registry helper APIs
- [Keyboard shortcuts](/guide/shortcuts) — keybinding
  semantics and platform mapping
