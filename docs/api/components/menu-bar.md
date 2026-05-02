# MenuBar

> Source: `src/components/layout/MenuBar.tsx`

## Overview

`MenuBar` is the top-of-window menu strip — File, Edit, View, etc. —
generated entirely from the [Action Registry](/api/core/action-registry).
Every menu name comes from `getMenuNames()`, every entry comes from
`getMenuActions(name)`, and every click delegates back through the
`onExecute` prop. The component itself owns nothing but open-state
management and grouping by `menuOrder`.

A right-aligned "Mode Toggle" lets the user switch between drawing
mode (绘图) and scene mode (场景), which drives the persisted Dockview
layout key.

## Component props

```ts
export interface MenuBarProps {
  onExecute: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
}
```

| Prop             | Source                | Notes                                                        |
| ---------------- | --------------------- | ------------------------------------------------------------ |
| `onExecute`      | `useActionDispatcher` | Receives the registry's `ActionId` literal union — type-safe |
| `getToggleState` | `useActionDispatcher` | Returns `true` for active toggle actions; rendered as `✓`    |

## Behavior

### Menu generation

```ts
const menuNames = getMenuNames();
// e.g. ['File', 'Edit', 'View', 'Tools']

menuNames.map((name) => (
  <Menu
    label={name}
    actions={getMenuActions(name)}
    isOpen={openMenu === name}
    onOpen={...}
    onClose={...}
    onExecute={onExecute}
    getToggleState={getToggleState}
  />
));
```

`getMenuActions(name)` returns the menu's actions sorted by
`menuOrder`. Adding a menu entry is a one-line change in
`registry.ts`; nothing in `MenuBar` needs to update.

### Auto-divider grouping

```ts
let lastOrder = -1;
for (const action of actions) {
  const order = Math.floor((action.menuOrder ?? 99) / 10);
  if (lastOrder >= 0 && order !== lastOrder) {
    itemsWithDividers.push('divider');
  }
  itemsWithDividers.push(action);
  lastOrder = order;
}
```

The integer division by 10 buckets actions into `menuOrder` groups
(0–9, 10–19, 20–29, ...). When the bucket changes, a divider is
emitted. So actions with `menuOrder` 10, 12, 25 render as `[10, 12,
divider, 25]` — a clean way to group "import / export" vs. "settings"
without a separate divider type in the registry.

### Toggle indicator

```tsx
<span className="w-4 text-center shrink-0">
  {item.isToggle && getToggleState(item.id) ? '✓' : ''}
</span>
```

Only `isToggle: true` entries can show a checkmark. Non-toggle entries
get a 4-char-wide blank to keep label alignment consistent.

### Outside click handling

The single `Menu` component wraps itself in a div ref and adds a
document-level `mousedown` listener while open. Click outside →
`onClose()`. The handler is unmounted when the menu closes to avoid
unnecessary handlers in the document tree.

### Mode toggle

```tsx
function ModeToggle() {
  const appMode = useUIStore((s) => s.appMode);
  const setAppMode = useUIStore((s) => s.setAppMode);
  // ...
  <button onClick={() => setAppMode('drawing')}>绘图</button>
  <button onClick={() => setAppMode('scene')}>场景</button>
}
```

The mode is persisted as a uiStore field. `WorkspaceLayout` keys its
`<DockviewReact>` on `appMode`, so flipping the toggle remounts the
panel host with the appropriate saved layout (`ams-layout-v3-drawing`
vs `ams-layout-v3-scene`).

### Shortcut display

```tsx
<span className="text-zinc-600 font-mono text-[10px] min-w-[3.5rem] text-right shrink-0">
  {item.shortcut ? formatShortcut(item.shortcut) : ''}
</span>
```

`formatShortcut(...)` from the registry adapts to platform — on
macOS it shows `⌘`, elsewhere `Ctrl`. The same helper drives
`ToolStrip` and `CommandPalette` so shortcut formatting never
diverges.

## Examples

### Mounting

```tsx
<MenuBar onExecute={execute} getToggleState={getToggleState} />
```

### Adding a new menu entry

```ts
// In src/core/actions/registry.ts
{
  id: 'exportApolloProto',
  category: 'file',
  menu: 'File',
  menuOrder: 35,
  label: 'Export Proto JSON…',
  shortcut: 'Cmd+Shift+P',
  // ...
}
```

The menu picks it up automatically; the dispatcher needs a matching
handler.

### Inspecting menu order

```ts
import { getMenuActions } from '@/core/actions/registry';
console.log(getMenuActions('Edit').map((a) => `${a.menuOrder}: ${a.label}`));
```

## Related

- [Action Registry](/api/core/action-registry)
- [useActionDispatcher](/api/hooks/use-action-dispatcher)
- [Tool strip](/api/components/tool-strip)
- [Command palette](/api/components/command-palette)
- [uiStore.appMode](/api/store/store-ui)
