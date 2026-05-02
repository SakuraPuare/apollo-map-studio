# ToolStrip

> Source: `src/components/layout/ToolStrip.tsx`

## Overview

`ToolStrip` is the 36px-tall horizontal toolbar between the menu bar
and the canvas. It exposes three groups:

1. **Mode switches** — Default (Hand) and Connect-Lanes — modal toggles
   that aren't FSM draw tools.
2. **Element bar** — 11 icon buttons for Apollo element types (lane,
   junction, signal, etc.) plus drawing primitives.
3. **Available tools** — once an element is picked, the tools allowed
   for that element (polyline / bezier / arc / etc.) appear after a
   divider.
4. **View slot** — registry-driven (Grid, Snap toggles) plus the
   command-palette launcher.

Every button funnels through the same `useActionDispatcher` so behavior
matches keyboard shortcuts and the menu bar.

## Component props

```ts
interface ToolStripProps {
  currentTool: string; // FSM state value
  currentElement: MapElementType | null; // FSM context.activeElement
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
  onOpenCommandPalette?: () => void;
  /** Action Registry dispatcher — required for view slot (grid/snap). */
  onExecuteAction: (actionId: ActionId) => void;
  /** Action Registry toggle state reader — required for view slot. */
  getToggleState: (actionId: ActionId) => boolean;
}
```

| Prop              | Source                                                        |
| ----------------- | ------------------------------------------------------------- |
| `currentTool`     | `useSelector(actorRef, s => s.value)`                         |
| `currentElement`  | `useSelector(actorRef, s => s.context.activeElement)`         |
| `onSelectTool`    | Wraps `actorRef.send({ type: 'SELECT_TOOL', tool, element })` |
| `onExecuteAction` | `useActionDispatcher().execute`                               |
| `getToggleState`  | `useActionDispatcher().getToggleState`                        |

## Behavior

### Element bar

```ts
import { MAP_ELEMENTS } from '@/core/elements';

<div>{MAP_ELEMENTS.map((el) => <button onClick={() => onSelect(el.type)}>...)}</div>
```

`MAP_ELEMENTS` is the canonical list from `core/elements`. Each entry
has `type`, `label`, `icon`, `color`, `defaultTool`, `tools[]`.

Clicking an element calls `handleElementSelect(type)`:

```ts
const handleElementSelect = (type: MapElementType) => {
  const def = ELEMENT_MAP.get(type)!;
  onSelectTool(def.defaultTool, type); // arms the FSM with the element + its default tool
};
```

### Available-tool resolution

```ts
const elementDef = currentElement ? ELEMENT_MAP.get(currentElement) : null;
const availableTools = elementDef
  ? ALL_DRAW_TOOLS.filter((t) => elementDef.tools.includes(t.tool))
  : [];
```

Lane allows polyline / bezier / catmullRom; signal allows polyline
only; clear-area allows polygon only — each element declares its
allowed tools.

### Tool button rendering

```ts
{availableTools.map(({ tool }) => {
  const action = getToolAction(tool);   // registry lookup
  const Icon = action?.icon ?? FaMagnifyingGlass;
  return (
    <ToolButton
      icon={Icon}
      label={`${elementDef?.label ?? ''} · ${action?.label ?? tool}`}
      shortcut={action?.shortcut}
      active={currentTool === tool}
      onClick={() => handleToolSelect(tool)}
    />
  );
})}
```

`getToolAction(tool)` is the integration point — the action registry's
single source for icon, label, and shortcut. Adding a new draw tool
means:

1. Adding a record to the action registry with `drawTool: 'newTool'`.
2. Adding `'newTool'` to one or more elements' `tools[]` in
   `core/elements`.

The ToolStrip picks it up automatically.

### Default-mode and Connect-Lanes

The two leftmost buttons sit before the element bar because they're
**modal switches**, not drawing tools:

- **Default (Hand)** — escape hatch. Active when the FSM is `idle`
  with no armed element and connect-mode is off. Clicking dispatches
  `defaultMode` action which sends CANCEL+RESET to the FSM and exits
  connect-mode.
- **Connect Lanes** — arms a non-FSM modal. Click → toggle
  `uiStore.connectMode`.

Both render via `getToggleState(...)` for active state.

### View slot

```ts
const viewActions = getToolStripSlotActions('view');
```

Returns the registry actions tagged for the toolstrip's view slot
(currently: `toggleGrid`, `toggleSnap`). Each renders identically:

```tsx
<ToolButton
  active={action.isToggle ? getToggleState(action.id) : false}
  onClick={() => onExecuteAction(action.id)}
  ...
/>
```

The slot is fully registry-driven — adding a new view toggle is one
record in `registry.ts`.

### Command palette launcher

```tsx
<button onClick={onOpenCommandPalette}>
  <FaTerminal />
  <kbd>⌘K</kbd>
</button>
```

A small launcher button that hints at the `⌘K` shortcut.

### Why "Selection" is gone

Earlier versions had Select / Pan tool buttons. They're removed —
ESC + MapLibre's native dragPan covers the same cases without a modal
selection. `useDragPan` re-enables drag during `idle` / `selected`,
and ESC always dispatches CANCEL to the FSM.

## Examples

### Mounting

```tsx
<ToolStrip
  currentTool={currentState}
  currentElement={activeElement as MapElementType | null}
  onSelectTool={handleSelectTool}
  onOpenCommandPalette={() => setCommandPaletteOpen(true)}
  onExecuteAction={execute}
  getToggleState={getToggleState}
/>
```

### Adding a new view toggle

```ts
// In registry.ts
{
  id: 'toggleScaleBar',
  category: 'view',
  isToggle: true,
  label: 'Scale Bar',
  icon: FaRulerHorizontal,
  shortcut: 'Cmd+Shift+R',
  toolStripSlot: 'view',
  inCommandPalette: true,
}
```

Add a handler in `useActionDispatcher`, a toggle case in
`getToggleState`, and the button shows up next to Grid/Snap.

## Related

- [Action Registry](/api/core/action-registry)
- [useActionDispatcher](/api/hooks/use-action-dispatcher)
- [Menu bar](/api/components/menu-bar)
- [Element registry](/api/core/elements)
- [editorMachine FSM](/api/core/editor-machine)
