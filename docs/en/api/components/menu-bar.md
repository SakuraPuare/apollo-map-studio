---
title: MenuBar
description: 32-pixel top menu strip — pulls every menu item dynamically from the Action Registry and exposes the drawing/scene segmented mode toggle.
---

# MenuBar

> Source: `src/components/layout/MenuBar.tsx`

## Purpose & UX role

`MenuBar` is the 32-pixel-high menu strip at the top of `WorkspaceLayout`. It has four blocks (left → right):

1. **Logo + app name** — `Apollo Map Studio` text plus a gradient badge icon.
2. **Menus** (File / Edit / View / Tools / Help) — **fully driven by the Action Registry**; nothing is hardcoded inside this component.
3. **Spacer** (`flex-1`).
4. **ModeToggle** — a drawing/scene segmented control bound to `useUIStore.appMode`.

Together with [ToolStrip](./tool-strip.md) and [CommandPalette](./command-palette.md), `MenuBar` is one of three UI outlets of the Action Registry (see the architecture's [Action Registry](/en/architecture/) section).

## Composition tree

```mermaid
flowchart TB
  MB[MenuBar]
  MB --> Logo[Logo + app name]
  MB --> MenuRow[Menu loop \(getMenuNames\)]
  MenuRow --> M1[Menu File]
  MenuRow --> M2[Menu Edit]
  MenuRow --> M3[Menu View]
  MenuRow --> M4[Menu Tools]
  MenuRow --> M5[Menu Help]
  MB --> Spacer
  MB --> MT[ModeToggle drawing / scene]
```

## Props

```ts
export interface MenuBarProps {
  onExecute: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
}
```

| Prop             | Type                              | Default | Description                                                                                                      |
| ---------------- | --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `onExecute`      | `(actionId: ActionId) => void`    | —       | Called when the user picks a menu item — typically `useActionDispatcher().execute`                               |
| `getToggleState` | `(actionId: ActionId) => boolean` | —       | Returns the current state for actions whose `isToggle` is true (e.g. `toggleGrid`); used to render the checkmark |

## Subcomponents

### `Menu`

```ts
function Menu(props: {
  label: string;
  actions: ActionDef[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExecute: (id: ActionId) => void;
  getToggleState: (id: ActionId) => boolean;
}): JSX.Element;
```

Behavior:

- Clicking the button toggles open/closed.
- While open, mounts a global `mousedown` listener — clicking outside closes the menu (`MenuBar.tsx:32-41`).
- Groups actions by `menuOrder` and inserts a divider every 10-step boundary (`MenuBar.tsx:44-53`).
- Renders a checkmark with `getToggleState(item.id) ? '✓' : ''`.

### `ModeToggle`

```ts
function ModeToggle(): JSX.Element;
```

- Reads `appMode` and `setAppMode` directly from `useUIStore`.
- Two buttons (`drawing` / `scene`), each 11px text, 3px padding; active state is `bg-cyan-500/20 text-cyan-300`.

## Internal state

| Hook                             | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `useState<string \| null>(null)` | `openMenu` — name of currently-open menu (mutually exclusive) |
| `useUIStore(s.appMode)`          | Current app mode (drawing/scene)                              |
| `useUIStore(s.setAppMode)`       | Switch mode                                                   |

## Side effects

- **Click outside**: each `Menu` mounts a `mousedown` listener while `isOpen` is true. Any click outside the menu closes it. The listener **must** be removed on cleanup; otherwise multi-menu use leaks listeners.
- **Item execution**: `onExecute(item.id)` is handled by the parent's `useActionDispatcher`, including the R1 undo CANCEL fix.

## Render anatomy

```jsx
<div className="h-8 bg-zinc-950 border-b border-white/[0.07] flex items-center px-2 shrink-0">
  <div className="flex items-center gap-2 mr-4">
    <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-400 to-cyan-600" />
    <span className="text-xs font-medium text-zinc-300 tracking-wide">Apollo Map Studio</span>
  </div>
  <div className="flex items-center">
    {menuNames.map((name) => (
      <Menu key={name} label={name} actions={getMenuActions(name)} … />
    ))}
  </div>
  <div className="flex-1" />
  <ModeToggle />
</div>
```

Dropdown panel:

```jsx
<div className="absolute top-full left-0 mt-1 py-1 min-w-[200px] bg-zinc-900 border border-white/10 rounded-md shadow-xl z-50">
  {/* each row: ✓ marker / label / shortcut */}
</div>
```

## Performance notes

- **`getMenuNames()` runs every render**, but internally it is a `MENU_ORDER` constant array + `Map.has`, O(N) and negligible. If the menu set grows, wrap with `useMemo` in the parent.
- **`Menu` is not memoized**: the parent's `onExecute` / `getToggleState` come from `useActionDispatcher` and are fresh references each render. The dropdown panel is unmounted when `isOpen=false`, so the cost is irrelevant.
- **Keyboard shortcuts are NOT handled here**: `useActionDispatcher` mounts a global `keydown` listener at `WorkspaceLayout`; `MenuBar` merely displays `formatShortcut(item.shortcut)`.

## Source map

| Concern                | File location                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------- |
| MenuBar body           | `MenuBar.tsx:142-177`                                                               |
| `Menu` subcomponent    | `MenuBar.tsx:13-97`                                                                 |
| Click-outside listener | `MenuBar.tsx:32-41`                                                                 |
| Menu divider insertion | `MenuBar.tsx:44-53`                                                                 |
| ModeToggle             | `MenuBar.tsx:108-140`                                                               |
| Action Registry entry  | `src/core/actions/registry.ts` (`getMenuNames`, `getMenuActions`, `formatShortcut`) |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — parent
- [ToolStrip](./tool-strip.md) / [CommandPalette](./command-palette.md) — sibling Action Registry outlets
- Action Registry → `src/core/actions/registry.ts`
- `useActionDispatcher` → [`/en/api/hooks`](/en/api/hooks)
- Mode toggle → [`uiStore.appMode`](/en/api/store/store-ui)
