---
title: ToolStrip
description: 36-pixel tool strip — Default/Connect modal switches, 11 element icons, element-specific tool variants, command palette trigger, and Action-Registry-driven view toggles.
---

# ToolStrip

> Source: `src/components/layout/ToolStrip.tsx`

## Purpose & UX role

`ToolStrip` is the 36-pixel-high strip directly below `MenuBar`. It has four functional zones (left → right):

1. **Default + Connect** — two modal-switch buttons (not draw tools), backed by the `defaultMode` and `connectLanes` actions.
2. **ElementBar** — 11 Apollo element icons (lane / road / signal / crosswalk …); clicking changes `currentElement`.
3. **Tool variants** (conditional) — once an element is selected, only the tools it whitelists appear; e.g. lane supports `drawCatmullRom` / `drawBezier`, crosswalk only supports `drawPolygon`.
4. **Spacer + Command Palette trigger**.
5. **View slot** — auto-populated from Action Registry actions whose `slot==='view'` (e.g. `toggleGrid`, `toggleSnap`).

## Composition tree

```mermaid
flowchart TB
  TS[ToolStrip]
  TS --> Modal[ToolButton defaultMode]
  TS --> Conn[ToolButton connectLanes]
  TS --> Div1[Divider]
  TS --> EB[ElementBar 11×]
  TS --> Div2{conditional Divider}
  TS --> TV[Tool variants \(filtered by element\)]
  TS --> Spacer
  TS --> CP[Command Palette button ⌘K]
  TS --> Div3[Divider]
  TS --> View[View slot \(toggleGrid/toggleSnap …\)]
```

## Props

```ts
interface ToolStripProps {
  currentTool: string;
  currentElement: MapElementType | null;
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
  onOpenCommandPalette?: () => void;
  onExecuteAction: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
}
```

| Prop                   | Type                                                 | Default | Description                                                                                                        |
| ---------------------- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `currentTool`          | `string`                                             | —       | Current FSM state (`drawPolyline` / `idle` / …)                                                                    |
| `currentElement`       | `MapElementType \| null`                             | —       | Currently selected element type; `null` hides the tool variants block                                              |
| `onSelectTool`         | `(tool: DrawTool, element?: MapElementType) => void` | —       | Called when the user picks an element or a tool; typically `actorRef.send({ type: 'SELECT_TOOL', tool, element })` |
| `onOpenCommandPalette` | `() => void`                                         | —       | ⌘K button click handler                                                                                            |
| `onExecuteAction`      | `(actionId: ActionId) => void`                       | —       | Used by view slot / default / connect buttons                                                                      |
| `getToggleState`       | `(actionId: ActionId) => boolean`                    | —       | Returns toggle state for `isToggle` actions (Grid / Snap / DefaultMode)                                            |

## Subcomponents

### `ToolButton`

Generic icon button. Active state uses `bg-ams-accent/20 text-ams-accent shadow-[inset_0_-2px_0_0_var(--color-ams-accent)]`; idle hover uses `hover:bg-ams-surface-hover`.

### `Divider`

Vertical `w-px h-5 bg-ams-border-strong` rule.

### `ElementBar`

11 icon-only buttons. Active background `bg-ams-surface-active` + foreground = `el.color` (each element declares its own color in `MAP_ELEMENTS`).

## Internal state

`ToolStrip` is stateless — every value comes from props (`currentTool` / `currentElement`) or from the Action Registry / `useActionDispatcher` (`getToggleState`).

## Side effects

None. Every interaction is propagated upward via callbacks.

## Render logic

1. Read `defaultMode` and `connectLanes` from the Action Registry, render at the top (`ToolStrip.tsx:134-161`).
2. Render `ElementBar`. Clicking calls `onSelectTool(def.defaultTool, type)` (`ToolStrip.tsx:113-115`).
3. If `currentElement` is non-null, filter `ALL_DRAW_TOOLS` to the tools the element whitelists and render each as a `ToolButton` (`ToolStrip.tsx:108-186`).
4. Render the `⌘K` button → `onOpenCommandPalette()`.
5. Pull every `slot==='view'` action via `getToolStripSlotActions('view')` and render into the right region (`ToolStrip.tsx:204-216`).

## Performance notes

- **No memoization**: the component is light enough; `ALL_DRAW_TOOLS.filter` returns at most 6 items.
- **`ACTION_DEFS.find` runs every render**: switching to `ACTION_MAP.get('defaultMode')` (O(1) within the registry) is a possible micro-optimization, but with 5 entries the array scan is negligible.
- **Inline lambdas on every render**: children are not memoized, so the cost of fresh closures is zero.

## Design-token note

`ToolStrip` is the **reference migration** for the `ams-*` design tokens. Idle element foreground uses `text-ams-text-secondary`, hover uses `bg-ams-surface-hover`, active uses `bg-ams-accent/20` with `shadow-[inset_0_-2px_0_0_var(--color-ams-accent)]` to draw the underline. See the [Design tokens](/en/architecture/) architecture section for context.

## Source map

| Concern                 | File location                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Component body          | `ToolStrip.tsx:100-219`                                                                    |
| `ToolButton`            | `ToolStrip.tsx:38-56`                                                                      |
| `ElementBar`            | `ToolStrip.tsx:71-96`                                                                      |
| Default + Connect block | `ToolStrip.tsx:134-161`                                                                    |
| Tool variants filter    | `ToolStrip.tsx:108-111`, `166-187`                                                         |
| View slot               | `ToolStrip.tsx:204-216`                                                                    |
| Element registry        | `src/core/elements.ts` (`MAP_ELEMENTS`, `ELEMENT_MAP`, `ALL_DRAW_TOOLS`)                   |
| Action registry         | `src/core/actions/registry.ts` (`ACTION_DEFS`, `getToolAction`, `getToolStripSlotActions`) |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — parent
- [MenuBar](./menu-bar.md) / [CommandPalette](./command-palette.md) — sibling Action Registry outlets
- [`editorMachine`](/en/api/core/) — `SELECT_TOOL` / `DEFAULT_MODE` / `CONNECT_LANES` events
- [Architecture overview](/en/architecture/) — Action Registry design, ams-\* design tokens
