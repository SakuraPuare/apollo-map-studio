# MenuBar and ToolStrip

Both the menu bar and the tool strip are **fully derived** from a single
data file: `src/core/actions/registry/definitions.ts`. There is no JSX list
of menu items hidden in `MenuBar.tsx`. To add an item to the editor, you add
an `ActionDef` to the registry; to remove one, you delete the record.

This page maps every visible button to its registry entry, then explains the
two non-action chrome elements (the mode toggle and the element bar).

## How the registry drives the UI

Source: `src/core/actions/registry.ts` (re-exports from `registry/`).

Each `ActionDef` carries:

```ts
interface ActionDef {
  id: ActionId; // discriminated union of every legal id
  label: string;
  category: 'file' | 'edit' | 'view' | 'tool' | 'selection';
  shortcut?: string; // mac glyph form, e.g. '⌘S' or '⇧⌘Z'
  keybinding?: KeyBinding; // structural: {key, ctrl, shift, alt, global}
  icon?: IconType; // react-icons component
  inCommandPalette: boolean;
  menu?: string; // 'File' | 'Edit' | 'View' — drives MenuBar
  menuOrder?: number; // dividers inserted between groups of 10
  isToggle?: boolean; // shows a checkmark in menus
  drawTool?: DrawTool; // arms an FSM draw state
  uiSlot?: 'selection' | 'view'; // shows in ToolStrip slot
  uiOrder?: number;
}
```

The MenuBar reads `getMenuActions('File' | 'Edit' | 'View')`. The ToolStrip's
right-edge slot reads `getToolStripSlotActions('view')`. The CommandPalette
reads `getCommandPaletteActions()`. Keyboard shortcuts wire through
`getKeyBindingActions()` + `matchesKeybinding()`. Adding a new item is one
record in `definitions.ts`.

::: tip Single source for shortcuts
The `shortcut` field is rendered by `formatShortcut()` in `helpers.ts:98`. On
macOS it's the literal glyph form (`⌘S`); on Linux/Windows the helper
substitutes `Ctrl+`, `Shift+`, `Alt+`. The keybinding matcher
(`matchesKeybinding`) treats `ctrlKey || metaKey` identically, so a single
record covers both platforms.
:::

## MenuBar

Source: `src/components/layout/MenuBar.tsx`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] Apollo Map Studio   File  Edit  View       [绘图 | 场景]      │
└──────────────────────────────────────────────────────────────────────┘
```

The menus list is `getMenuNames()`, which deduplicates the `menu:` field
across all action defs. Currently three menus exist; adding a record with
`menu: 'Tools'` would make a fourth menu appear automatically.

### File menu

| Item                     | Action id          | Shortcut | Notes                                                             |
| ------------------------ | ------------------ | -------- | ----------------------------------------------------------------- |
| Import Apollo Map…       | `importApollo`     | —        | Opens browser/native file picker, accepts `.bin`/`.txt`/`.pb.txt` |
| _divider_                |                    |          | between groups of 10                                              |
| Export Apollo Map (.bin) | `exportApolloBin`  | `⌘S`     | Worker-encoded protobuf, downloads with timestamp                 |
| Export Apollo Map (.txt) | `exportApolloText` | `⇧⌘S`    | Text protobuf for diff/code review                                |
| _divider_                |                    |          |                                                                   |
| Settings                 | `settings`         | `⌘,`     | Opens [Settings](/guide/settings) modal                           |

::: warning Shortcuts can be intercepted
`⌘S` / `Ctrl+S` is marked `global: true` in the registry, so it fires even
when focus is in an input. `⌘,` is **not** global — focus an `<input>` and
press it, you'll get a regular comma. Whether a binding is global is
deliberate; see `useActionDispatcher.ts:198-216` for the dispatch logic.
:::

### Edit menu

| Item             | Action id      | Shortcut        | Notes                                                     |
| ---------------- | -------------- | --------------- | --------------------------------------------------------- |
| Undo             | `undo`         | `⌘Z`            | Sends `CANCEL` first (R1 closure), then `temporal.undo()` |
| Redo             | `redo`         | `⇧⌘Z`           | Same CANCEL-first guard                                   |
| _divider_        |                |                 |                                                           |
| Delete Selection | `delete`       | `⌫` (Backspace) | Sends `DELETE_ENTITY` to FSM                              |
| _divider_        |                |                 |                                                           |
| Connect Lanes    | `connectLanes` | `C`             | Toggle; isToggle shows ✓ in menu when active              |

::: warning Undo CANCEL is load-bearing
Read this if you're modifying undo behavior: `useActionDispatcher.ts:104-108`
sends `CANCEL` before `temporal.undo()`. Without it, the FSM keeps
`drawPoints` referring to entities that just rolled back, and the next
`CONFIRM` corrupts your map. Regression test:
`src/hooks/__tests__/undoCancel.test.ts`.
:::

### View menu

| Item         | Action id     | Shortcut | Notes                                                           |
| ------------ | ------------- | -------- | --------------------------------------------------------------- |
| Reset Layout | `resetLayout` | —        | Wipes Dockview state for current `appMode` and rebuilds default |
| Toggle Grid  | `toggleGrid`  | `⌘G`     | Persists `gridEnabled` to `useUIStore`                          |
| Toggle Snap  | `toggleSnap`  | —        | Persists `snapEnabled` to `useUIStore`                          |

::: tip Items without shortcuts
`Reset Layout` and `Toggle Snap` have no shortcut field, so they're
keyboard-inaccessible by default. Add a `keybinding:` to the registry
record if you want one.
:::

### Mode toggle (right edge)

Two segmented buttons: `绘图` (drawing) and `场景` (scene). They mutate
`useUIStore.appMode`. This is **not** registry-backed because it doesn't
fit the action model — it's a global UI mode that switches the entire
Dockview layout.

| Mode      | Default Dockview layout              |
| --------- | ------------------------------------ |
| `drawing` | Map + Sidebar(Layers) + Inspector    |
| `scene`   | Map + Sidebar + Inspector + Timeline |

Layouts persist per mode under `apollo-map-studio:dockview-layout-{mode}`.

## ToolStrip

Source: `src/components/layout/ToolStrip.tsx`

```
┌──────────────────────────────────────────────────────────────────────┐
│ [H] [C] | [Lane][Junction]…[Area] | [tool1][tool2] |  [⌘K] [Grid][Snap]│
└──────────────────────────────────────────────────────────────────────┘
```

### Slot 1 — modal switches

Two buttons that arm a global UI mode:

| Button  | Action id      | Shortcut | Active when                                        |
| ------- | -------------- | -------- | -------------------------------------------------- |
| Hand    | `defaultMode`  | `H`      | `idle` FSM + no `activeElement` + not connect-mode |
| Connect | `connectLanes` | `C`      | `useUIStore.connectMode.active`                    |

Hand is the **escape hatch**. Pressing `H` (or clicking the button) sends
`CANCEL` then `RESET` to the FSM, then exits connect mode if active. After
`H`, the canvas pans freely with no draw or selection armed.

::: tip Default-mode activeness
The Hand button highlights only when **all three** conditions hold (idle
FSM, no element, no connect-mode). Drawing or selection lights it back off.
This is why pressing `H` after a draw does something visible — the icon
turns cyan to confirm you're back in neutral.
:::

### Slot 2 — element bar

Twelve buttons, one per entry in `MAP_ELEMENTS` (`src/core/elements.ts:49`):

| #   | Element                 | Color     | Default tool      | All tools                        |
| --- | ----------------------- | --------- | ----------------- | -------------------------------- |
| 1   | Lane (车道)             | `#4a9eff` | `drawBezier`      | `drawBezier`, `drawArc`          |
| 2   | Junction (路口)         | `#ffcc00` | `drawPolygon`     | `drawPolygon`                    |
| 3   | PNC Junction (PNC 路口) | `#ff9933` | `drawPolygon`     | `drawPolygon`                    |
| 4   | Parking Space (车位)    | `#7c5cbf` | `drawRotatedRect` | `drawRotatedRect`, `drawPolygon` |
| 5   | Crosswalk (人行横道)    | `#ffffff` | `drawRotatedRect` | `drawRotatedRect`, `drawPolygon` |
| 6   | Signal (信号灯)         | `#22cc44` | `drawBezier`      | `drawBezier`                     |
| 7   | Stop Sign (停车标志)    | `#ff0000` | `drawBezier`      | `drawBezier`                     |
| 8   | Speed Bump (减速带)     | `#ffaa00` | `drawBezier`      | `drawBezier`                     |
| 9   | Yield Sign (让行标志)   | `#ff6600` | `drawBezier`      | `drawBezier`                     |
| 10  | Clear Area (禁停区)     | `#ff4466` | `drawRotatedRect` | `drawRotatedRect`, `drawPolygon` |
| 11  | Barrier Gate (道闸)     | `#aa66ff` | `drawBezier`      | `drawBezier`                     |
| 12  | Area (区域)             | `#66aaff` | `drawPolygon`     | `drawPolygon`                    |

Clicking an element button calls `SELECT_TOOL` with that element's
`defaultTool`. The FSM transitions to the corresponding draw state.

::: tip Element-then-tool
The drawing model is element-first: pick an element, get its allowed tools.
You cannot start by picking a tool — that would lose the element binding.
If you want raw geometry without an Apollo type, the same six tools exist
without the element binding via the command palette (`Draw Polyline`,
`Draw Bezier`, …) and produce primitive entities.
:::

### Slot 3 — drawing tools (conditional)

Only appears after you select an element. Filtered by the element's `tools`
allowlist. For example with Lane selected: `Bezier (B)`, `Arc (A)`. With
Parking Space: `Rectangle (R)`, `Polygon (G)`.

The active tool is highlighted with the `ams-accent` color. Switching tools
mid-draw cancels the current draft and restarts in the new state.

### Slot 4 — command palette button

Single button: opens [Command palette](/guide/command-palette). The button
just calls `onOpenCommandPalette()` — `⌘K` is wired in
`useActionDispatcher.ts` and also in `WorkspaceLayout.tsx:64-77`, the
double-binding is intentional so the palette opens even before the
dispatcher mounts.

### Slot 5 — view toggles (right edge)

Pulled from `getToolStripSlotActions('view')`. Currently:

| Button      | Action id    | Shortcut |
| ----------- | ------------ | -------- |
| Toggle Grid | `toggleGrid` | `⌘G`     |
| Toggle Snap | `toggleSnap` | —        |

Both are toggle actions; the button highlights when active.

## Adding a new menu item or tool button

The full procedure to add a new editor action:

1. Open `src/core/actions/registry/registry/types.ts` and add the new id to
   the `ActionId` union.
2. Open `src/core/actions/registry/definitions.ts` and append an `ActionDef`
   record. Set `menu`/`menuOrder` to put it in a menu, `uiSlot`+`uiOrder`
   to put it in the ToolStrip view slot, `inCommandPalette: true` to expose
   it in `⌘K`, and `keybinding:` for a shortcut.
3. Open `src/hooks/useActionDispatcher.ts`. In the `handlers` map (lines
   77-150), add a `map.set('myActionId', () => { ... })` entry.

That's all. The MenuBar, ToolStrip, CommandPalette, and keyboard handler
re-derive from the registry on next render. No JSX edits in any UI file.

::: warning Don't bypass the dispatcher
Resist the urge to wire a button directly to its handler. The dispatcher is
the single point that calls `assertEditable()` for license-gated
operations. Bypass it and you'll let read-only license states (expired,
tampered) mutate the map.
:::

## Adding a new drawing tool

Drawing tools require a registry record **and** an FSM state:

1. Add the tool name to `DrawTool` in `src/core/fsm/editorMachine.ts:10`.
2. Add the tool to `DRAW_STATES` (line 18).
3. Add a `states.<tool>: { on: sharedDrawEvents }` block (or a custom
   handler set if it doesn't fit polyline-style commit).
4. Add an `ActionDef` with `category: 'tool'`, `drawTool: '<tool>'`,
   `keybinding:` for a shortcut.
5. Wire commit logic in `src/hooks/useDrawCommit.ts` if the new tool's
   geometry doesn't fit the existing branches.
6. Allow the tool in `MAP_ELEMENTS` (`src/core/elements.ts:49`) for any
   element that should accept it.

The dispatcher's `for (const action of ACTION_DEFS) { if (action.drawTool) … }`
loop (`useActionDispatcher.ts:144-149`) auto-generates the
`SELECT_TOOL` handler — no manual wiring per tool.

## Where to next

- [Activity bar and panels](/guide/activity-bar-and-panels) — what each
  sidebar panel does.
- [Command palette](/guide/command-palette) — the `⌘K` interface that
  reads the same registry.
- [Keyboard shortcuts](/guide/shortcuts) — the full shortcut
  table, derived from the registry.
- [Architecture / Action registry](/architecture/action-registry) — the
  internal API for adding action types.
