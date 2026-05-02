---
title: Keyboard Shortcuts (Cross-Platform Alias)
description: Cross-platform shortcut alias table for users coming from Photoshop / VS Code / QGIS — see Shortcuts for the canonical KeyBinding reference.
---

# Keyboard Shortcuts (Cross-Platform Alias)

> This page is the **alias view** of [Shortcuts](./shortcuts.md). It puts AMS keybindings next to Photoshop, VS Code, and QGIS so users migrating from those tools can build muscle memory faster.

::: tip Two-page split

- [Shortcuts](./shortcuts.md) — source of truth (id, KeyBinding object, global flag)
- [Keyboard Shortcuts](./keyboard-shortcuts.md) (this page) — intuitive memory + cross-platform map

If you're new to AMS, read [Shortcuts](./shortcuts.md) first.
:::

## Per-platform mapping

| Action          | macOS          | Windows        | Linux          | AMS Action id          |
| --------------- | -------------- | -------------- | -------------- | ---------------------- |
| Undo            | `⌘Z`           | `Ctrl+Z`       | `Ctrl+Z`       | `undo`                 |
| Redo            | `⇧⌘Z`          | `Ctrl+Shift+Z` | `Ctrl+Shift+Z` | `redo`                 |
| Export .bin     | `⌘S`           | `Ctrl+S`       | `Ctrl+S`       | `exportApolloBin`      |
| Export .txt     | `⇧⌘S`          | `Ctrl+Shift+S` | `Ctrl+Shift+S` | `exportApolloText`     |
| Command Palette | `⌘K`           | `Ctrl+K`       | `Ctrl+K`       | `commandPalette`       |
| Settings        | `⌘,`           | `Ctrl+,`       | `Ctrl+,`       | `settings`             |
| Toggle Grid     | `⌘G`           | `Ctrl+G`       | `Ctrl+G`       | `toggleGrid`           |
| Delete          | `Delete` / `⌫` | `Delete`       | `Delete`       | `delete`               |
| Default Pan     | `H`            | `H`            | `H`            | `defaultMode`          |
| Connect Lanes   | `C`            | `C`            | `C`            | `connectLanes`         |
| Draw Polyline   | `P`            | `P`            | `P`            | `tool:drawPolyline`    |
| Draw Bezier     | `B`            | `B`            | `B`            | `tool:drawBezier`      |
| Draw Arc        | `A`            | `A`            | `A`            | `tool:drawArc`         |
| Draw Rectangle  | `R`            | `R`            | `R`            | `tool:drawRotatedRect` |
| Draw Polygon    | `G`            | `G`            | `G`            | `tool:drawPolygon`     |

## vs Photoshop

| Photoshop | Meaning        | AMS equivalent    | Note                                    |
| --------- | -------------- | ----------------- | --------------------------------------- |
| `H`       | Hand           | `H` Default (Pan) | Identical                               |
| `P`       | Pen            | `P` Polyline      | Identical                               |
| `R`       | Rotate / Rect  | `R` Rectangle     | Used for rotated rectangle              |
| `B`       | Brush          | `B` Bezier        | Different concept, same letter          |
| `M`       | Marquee        | —                 | No equivalent                           |
| `⌘+T`     | Free Transform | —                 | AMS edits via direct control-point drag |
| `⌘Z`      | Undo           | `⌘Z`              | Identical                               |

## vs VS Code

| VS Code               | AMS equivalent       | Note                       |
| --------------------- | -------------------- | -------------------------- |
| `⌘P` Quick Open       | —                    | Use `⌘K` palette           |
| `⌘⇧P` Command Palette | `⌘K` Command Palette | Different key, same idea   |
| `⌘B` Toggle Sidebar   | —                    | Use ActivityBar tab toggle |
| `⌘,` Settings         | `⌘,` Settings        | Identical                  |
| `⌘W` Close Tab        | —                    | Use × in dockview          |

::: tip Memory anchor
AMS uses `⌘K` for the palette (cmdk default), distinct from VS Code's `⌘⇧P`. Both are fuzzy search boxes.
:::

## vs QGIS

| QGIS                     | AMS equivalent               | Note                                                |
| ------------------------ | ---------------------------- | --------------------------------------------------- |
| Pan tool (Spacebar+drag) | `H`                          | QGIS uses spacebar; AMS uses H to return to default |
| `Ctrl+S` Save Project    | `Ctrl+S` Export base_map.bin | Same concept — persist your output                  |
| Identify (`I`)           | Click an entity              | No dedicated tool — Inspector opens directly        |
| Snap toggle              | `Toggle Snap` button         | No keybinding (ToolStrip View slot)                 |

## Modifier cheat sheet

| AMS modifier | macOS key      | Win/Linux key |
| ------------ | -------------- | ------------- |
| `⌘`          | Command (L/R)  | Ctrl          |
| `⇧`          | Shift          | Shift         |
| `⌥`          | Option         | Alt           |
| `⌃`          | Control (rare) | Ctrl          |

::: warning ⌘ and Ctrl share a single field
AMS represents both with `ctrl: true` in `KeyBinding` — single field, platform-aware automatically.
:::

## Steps

1. Pick your platform column.
2. Find the action.
3. Press it — no need to click first.
4. Shortcuts work with map focus; `global: true` ones also work inside text inputs.

## Migration FAQ

| Coming from | Question               | Answer                                                                             |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Photoshop   | Where's `T` (Type)?    | No text tool — use Inspector fields                                                |
| VS Code     | `⌘+S` always exports?  | Yes — AMS has no project save concept; export _is_ save                            |
| QGIS        | What is one Undo step? | One entity-level edit (`mapStore` commit) — finer-grained than QGIS's session unit |
| AutoCAD     | No command line?       | Use `⌘K` palette instead                                                           |

## Persistence

This page persists nothing itself. Keybindings come from the static `definitions.ts` registry; require rebuild to change.

## Source

- `src/core/actions/registry/helpers.ts` — `isMacPlatform` / `formatShortcut`
- `src/core/actions/registry/definitions.ts` — KeyBinding fields

## vs Sketchfab & Blender

Some teams move from 3D modelling tools to AMS for HD-map labelling:

| Blender         | AMS equivalent                          | Note                          |
| --------------- | --------------------------------------- | ----------------------------- |
| `G` Grab/Move   | Drag control points directly            | AMS has no separate Grab mode |
| `R` Rotate      | Drag the rotate handle after selection  | AMS uses handles, not letters |
| `S` Scale       | Shift+drag a handle                     | Proportional                  |
| `Tab` Edit Mode | Double-click an entity → `editingPoint` | XState transition             |
| `N` Properties  | Inspector is always docked              | No toggle needed              |

## ESC / Enter semantics by state

`Escape` and `Enter` are not plain shortcuts — they are FSM contextual events:

| State              | ESC                        | Enter                                   |
| ------------------ | -------------------------- | --------------------------------------- |
| `idle`             | no-op                      | no-op                                   |
| `drawPolyline` etc | CANCEL (drop current draw) | CONFIRM (commit)                        |
| `selected`         | Deselect                   | no-op                                   |
| `editingPoint`     | Exit edit                  | Apply current drag                      |
| Any modal dialog   | Close                      | Submit (ActivationDialog does not bind) |

## Modifier combos cheat sheet

| Combo                   | Where         | Behavior                         |
| ----------------------- | ------------- | -------------------------------- |
| `Shift` + click         | LayerTree     | Multi-select                     |
| `Cmd/Ctrl` + click      | LayerTree     | Add/remove from selection        |
| `Shift` + drag handle   | Edit mode     | Proportional scale               |
| `Alt` + drag handle     | Edit mode     | Mirror constraint                |
| `Cmd/Ctrl` + wheel      | Map           | Browser zoom (may fire in dev)   |
| `Cmd/Ctrl` + click lane | Connect Lanes | Wire directly, skipping two-step |

## See also

- [Shortcuts](./shortcuts.md) — full reference (recommended)
- [MenuBar & ToolStrip](./menubar-and-toolstrip.md) — the menu / strip surface
- [Command Palette](./command-palette.md) — `⌘K` global search
- [Drawing Tools](./drawing-tools.md) — draw tools and letter-key map
- [Editing & Snapping](./editing-and-snapping.md) — Shift / Alt drag semantics

## Per-platform keycode cheatsheet

| Logical    | Apple keyboard | Windows keyboard | Chrome OS |
| ---------- | -------------- | ---------------- | --------- |
| Cmd / Meta | ⌘ Command      | Win              | Search    |
| Ctrl       | ⌃ Control      | Ctrl             | Ctrl      |
| Alt        | ⌥ Option       | Alt              | Alt       |
| Shift      | ⇧              | Shift            | Shift     |
| Backspace  | ⌫              | Backspace        | Backspace |
| Delete     | ⌦              | Delete           | Delete    |
| Enter      | Return ↵       | Enter            | Enter     |
| Esc        | Esc            | Esc              | Esc       |

## Muscle-memory drills

If you're new to AMS, build muscle memory around these 7 keys first:

```
⌘K → palette (search anything)
⌘S → save (export .bin)
⌘Z / ⇧⌘Z → undo / redo
⌫ → delete selected
H → return to default
C → connect lanes
```

Master these and 95% of your daily AMS workflow lives in your fingertips.

## Common misfires

| Wanted                  | Actually does              | Use instead                    |
| ----------------------- | -------------------------- | ------------------------------ |
| `⌘P` to find an entity  | Browser print dialog       | SearchPanel or LayerTree       |
| `⌘W` to close a panel   | Electron closes the window | dockview ×                     |
| `⌘+` to zoom the canvas | Browser zoom               | Mouse wheel or MapLibre native |
| `⌘Y` to redo            | Browser history            | AMS uses `⇧⌘Z`                 |

## Concurrent modifiers

A `KeyBinding` has no "ordering". On any main-key press, AMS checks the current state of all modifiers. So:

| Sequence                            | Fires `⌘S`?                                 |
| ----------------------------------- | ------------------------------------------- |
| `Cmd down → S down`                 | ✅                                          |
| `S down → Cmd down → release`       | ❌ (Cmd was not down at the time S pressed) |
| `Cmd down → Shift down → S down`    | ❌ (the Shift makes it match ⇧⌘S)           |
| `Cmd down → S down → S up → S down` | ✅✅ (each S press fires once)              |

## Long-press behavior

AMS has **no** long-press semantics. Each KeyBinding fires once on `keydown`; the browser `repeat` event is ignored (except for FSM-event keys like SELECT_TOOL).

::: tip Anti-misfire
Holding a shortcut won't repeat-fire export-style actions, so a stuck finger does not flood I/O.
:::

## Test coverage

| Test                     | File                                                  | Asserts                     |
| ------------------------ | ----------------------------------------------------- | --------------------------- |
| `matchesKeybinding` unit | `src/core/actions/registry/__tests__/helpers.test.ts` | Platform / modifiers / case |
| Integration              | `e2e/shortcuts.spec.ts`                               | Playwright simulated keys   |

## Quick lookup card

```
┌─────────────────────────────────────────────────┐
│           AMS Quick Lookup                      │
├─────────────────────────────────────────────────┤
│ ⌘K     Command Palette                          │
│ ⌘S     Export .bin                              │
│ ⇧⌘S    Export .txt                              │
│ ⌘Z     Undo                                     │
│ ⇧⌘Z    Redo                                     │
│ ⌫      Delete selection                         │
│ ⌘G     Toggle Grid                              │
│ ⌘,     Settings                                 │
│ H      Default (Pan)                            │
│ C      Connect Lanes                            │
│ P/B/A  Polyline / Bezier / Arc                  │
│ R/G    Rectangle / Polygon                      │
│ Esc    Cancel / Close                           │
│ Enter  Confirm draw                             │
└─────────────────────────────────────────────────┘
```

## Rationale for the chosen keys

| Key              | Why                                                      |
| ---------------- | -------------------------------------------------------- |
| `H` Default      | Photoshop / GIMP / Figma all use Hand                    |
| `C` Connect      | "C" for Connect — easy mnemonic                          |
| `P/B/A/R/G` Draw | Aligns with Photoshop Pen / Brush / Arc / Rect / Polygon |
| `⌘K` Palette     | cmdk default; Linear / Slack / Notion consensus          |
| `⌘,` Settings    | macOS Preferences standard                               |

## A11y notes

| Item                             | Behavior                                     |
| -------------------------------- | -------------------------------------------- |
| Screen reader announces shortcut | `aria-label` or `kbd` tag                    |
| High contrast                    | Tailwind follows `prefers-contrast: more`    |
| Keyboard-only navigation         | Every ActionDef is reachable without a mouse |
| Focus ring                       | Tailwind `focus-visible`                     |

## Desktop-only shortcuts

Electron 41 registers the standard system menu on macOS:

| Menu                      | Shortcut | Action          |
| ------------------------- | -------- | --------------- |
| Apollo Map Studio → About | —        | About dialog    |
| Apollo Map Studio → Hide  | `⌘H`     | System hide     |
| Apollo Map Studio → Quit  | `⌘Q`     | Quit            |
| Window → Minimize         | `⌘M`     | System minimize |
| Window → Close            | `⌘W`     | Close window    |

::: tip Desktop vs Web difference
The web build lacks these "system" menus. If a labeller switches between desktop and web, muscle memory for `⌘W` may misfire — beware.
:::

## Migration drills

### From Photoshop

```
1. Launch AMS.
2. Press H — cursor should become a hand; status bar Mode goes back to idle.
3. Press P — after selecting a Lane, P enters Polyline drawing.
4. Press ⌘Z — undo latest.
5. Press ⌘S — file save dialog.
```

### From VS Code

```
1. Press ⌘K — command palette opens (different from VS Code's ⌘⇧P, but equivalent).
2. Type "settings", press Enter — Settings modal opens.
3. ESC closes.
```

### From QGIS

```
1. Press H to switch to default mode.
2. Drag the map — pans the view.
3. Wheel — zooms.
4. ⌘S — like QGIS Save Project, but actually Export Apollo Map.
```
