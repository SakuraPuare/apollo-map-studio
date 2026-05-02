# Keyboard shortcuts

Every shortcut in this table is sourced from the action registry at
`src/core/actions/registry/definitions.ts`. The display column shows the
macOS glyph form; on Linux/Windows, `formatShortcut()` substitutes
`Ctrl+`, `Shift+`, `Alt+`. The `matchesKeybinding()` matcher
(`registry/helpers.ts:48`) treats `ctrlKey || metaKey` identically, so a
single binding works on both platforms.

## How to read this page

| Column            | Meaning                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Action**        | Action label (matches the menu / palette item)                                        |
| **macOS**         | Glyph form as written in the registry (`⌘`, `⇧`, `⌥`, `⌃`)                            |
| **Linux/Windows** | What `formatShortcut()` renders on non-Mac platforms                                  |
| **Global**        | Whether the shortcut fires when focus is in an `<input>`, `<textarea>`, or `<select>` |
| **Action id**     | Registry id; useful for grepping source                                               |

## File

| Action                   | macOS | Linux/Windows  | Global | Action id          |
| ------------------------ | ----- | -------------- | :----: | ------------------ |
| Import Apollo Map…       | —     | —              |   —    | `importApollo`     |
| Export Apollo Map (.bin) | `⌘S`  | `Ctrl+S`       |  yes   | `exportApolloBin`  |
| Export Apollo Map (.txt) | `⇧⌘S` | `Ctrl+Shift+S` |  yes   | `exportApolloText` |
| Settings                 | `⌘,`  | `Ctrl+,`       |   no   | `settings`         |

::: warning Save shortcut overrides browser save
`⌘S` / `Ctrl+S` is registered global, so the editor preempts the
browser's native "save page" dialog. Web-build users benefit; if you
want the browser dialog, click outside the editor first.
:::

## Edit

| Action           | macOS           | Linux/Windows  | Global | Action id      |
| ---------------- | --------------- | -------------- | :----: | -------------- |
| Undo             | `⌘Z`            | `Ctrl+Z`       |  yes   | `undo`         |
| Redo             | `⇧⌘Z`           | `Ctrl+Shift+Z` |  yes   | `redo`         |
| Delete Selection | `⌫` (Backspace) | `Backspace`    |   no   | `delete`       |
| Connect Lanes    | `C`             | `C`            |   no   | `connectLanes` |

::: tip Why ⌫ for Delete?
The action's literal keybinding is `{ key: 'delete' }`. Both `Delete`
(Forward Delete) and `Backspace` send `key: 'Delete'` / `'Backspace'` —
on macOS the registry maps to Backspace; on Windows/Linux laptops the
same physical key fires. If you have a separate Forward Delete key, it
also works.
:::

## View

| Action          | macOS | Linux/Windows | Global | Action id        |
| --------------- | ----- | ------------- | :----: | ---------------- |
| Toggle Grid     | `⌘G`  | `Ctrl+G`      |  yes   | `toggleGrid`     |
| Toggle Snap     | —     | —             |   —    | `toggleSnap`     |
| Reset Layout    | —     | —             |   —    | `resetLayout`    |
| Command Palette | `⌘K`  | `Ctrl+K`      |  yes   | `commandPalette` |

## Selection / Tool modes

| Action        | macOS | Linux/Windows | Global | Action id     |
| ------------- | ----- | ------------- | :----: | ------------- |
| Default (Pan) | `H`   | `H`           |   no   | `defaultMode` |

The `H` shortcut clears any in-flight draw or selection (sends
`CANCEL` then `RESET` to the FSM), exits Connect Lanes mode if active,
and arms the canvas for plain pan/select.

## Drawing tools

| Action          | macOS | Linux/Windows | Global | Action id              |
| --------------- | ----- | ------------- | :----: | ---------------------- |
| Draw Polyline   | `P`   | `P`           |   no   | `tool:drawPolyline`    |
| Draw Bezier     | `B`   | `B`           |   no   | `tool:drawBezier`      |
| Draw Arc        | `A`   | `A`           |   no   | `tool:drawArc`         |
| Draw Rectangle  | `R`   | `R`           |   no   | `tool:drawRotatedRect` |
| Draw Polygon    | `G`   | `G`           |   no   | `tool:drawPolygon`     |
| Draw CatmullRom | —     | —             |   —    | `tool:drawCatmullRom`  |

`G` is double-bound — `⌘G` is "Toggle Grid" (global, with Ctrl/Cmd),
plain `G` is "Draw Polygon" (no modifier). The matcher distinguishes
them because `matchesKeybinding` checks `kb.ctrl !== (e.ctrlKey ||
e.metaKey)`.

::: warning Single-letter shortcuts in inputs
None of the drawing-tool shortcuts are global. Press `B` while a text
field has focus, you'll get a literal "B" in the field, not a Bezier
state transition. To trigger drawing tools from the keyboard while
editing inspector fields, blur the input first (`Esc` or click the
canvas).
:::

## In-modal shortcuts

These are not in the registry — they're handled by individual modals.

| Modal             | Key     | Effect                                     |
| ----------------- | ------- | ------------------------------------------ |
| Command Palette   | `↑` `↓` | Navigate items                             |
| Command Palette   | `↵`     | Execute highlighted item                   |
| Command Palette   | `Esc`   | Close                                      |
| Command Palette   | `⌘K`    | Toggle (open or close)                     |
| Settings          | `Esc`   | Close                                      |
| Settings          | `↵`     | Commit current input field                 |
| Activation Dialog | `Esc`   | Close (unless busy)                        |
| Projection Picker | `Esc`   | Cancel (resolves `null` to dialog promise) |

## In-canvas FSM events

These are **not** keyboard shortcuts — they're FSM events triggered by
mouse gestures. Listed here for reference:

| Gesture                     | FSM event             | When it fires                               |
| --------------------------- | --------------------- | ------------------------------------------- |
| `mousedown` on canvas       | `MOUSE_DOWN`          | While drawing or in Connect mode            |
| `mousemove` over canvas     | `MOUSE_MOVE`          | Always, throttled                           |
| `mouseup` after handle drag | `MOUSE_UP`            | After drag handle released                  |
| Double-click on canvas      | `DOUBLE_CLICK`        | Commits polyline / polygon / bezier         |
| `Esc` in idle               | (no-op)               | XState 5 silently ignores no-handler events |
| `Esc` in selected           | `CANCEL` → `idle`     | Deselects                                   |
| `Esc` in editingPoint       | `CANCEL` → `selected` | Reverts drag                                |
| `Esc` in any draw state     | `CANCEL` → `idle`     | Discards the draft, `resetDraw`             |

## Platform mapping table

How the registry's macOS glyphs render on non-Mac platforms:

| Glyph | macOS display      | Linux/Windows display | Modifier        |
| ----- | ------------------ | --------------------- | --------------- |
| `⌘`   | Command            | `Ctrl+`               | Ctrl/Meta       |
| `⌃`   | Control            | `Ctrl+`               | Ctrl            |
| `⇧`   | Shift              | `Shift+`              | Shift           |
| `⌥`   | Option             | `Alt+`                | Alt             |
| `⌫`   | Delete (Backspace) | `Backspace`           | n/a (key glyph) |
| `↵`   | Return             | `Enter`               | n/a (key glyph) |

`isMacPlatform()` (`registry/helpers.ts:69`) decides which form to render
based on `navigator.userAgentData.platform` (modern) or
`navigator.platform` + `userAgent` (fallback). Result is memoized per
session.

## Customization

**Not yet supported.** Keybindings are baked into the registry. To
re-bind, edit `src/core/actions/registry/definitions.ts` and rebuild.

A `useKeybindingStore` with persistent overrides is on the roadmap. The
matcher is already structurally generic (`KeyBinding` is `{key, ctrl,
shift, alt, global}`); persisting overrides + a small UI in the
Settings panel would suffice.

## Where to next

- [Command palette](/guide/command-palette) — fuzzy access to every
  action.
- [MenuBar and ToolStrip](/guide/menubar-and-toolstrip) — visual
  surface of the same registry.
- [Architecture / Action registry](/architecture/action-registry) —
  the data model that drives this table.
