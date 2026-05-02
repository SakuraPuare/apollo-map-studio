# CommandPalette

> Source: `src/components/layout/panels/CommandPalette.tsx`

## Overview

`CommandPalette` is the `⌘K` / `Ctrl+K` action launcher — a centered
modal search box backed by the [cmdk](https://cmdk.paco.me/) primitive
and fed entirely by the [Action Registry](/api/core/action-registry).
Every action in the registry that declares `inCommandPalette: true`
shows up here, grouped by `category`, searchable by label, and
executable with the same `onExecute(actionId)` callback used by the
menu bar and tool strip.

## Component props

```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Execute action by ID — provided by ActionDispatcher */
  onExecute: (actionId: ActionId) => void;
  /** Get toggle state for toggle actions */
  getToggleState?: (actionId: ActionId) => boolean;
}
```

| Prop             | Notes                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `open`           | Controlled visibility — `WorkspaceLayout` owns the state          |
| `onOpenChange`   | Setter; called on backdrop click, ESC, or after running an action |
| `onExecute`      | Wired to `useActionDispatcher.execute`                            |
| `getToggleState` | Optional; renders a `✓` for active toggle actions                 |

## Behavior

### Action source

```ts
const actions = useMemo(() => getCommandPaletteActions(), []);
```

`getCommandPaletteActions()` from `@/core/actions/registry` returns
the subset of `ACTION_DEFS` flagged for the palette, sorted by
category and label.

### Grouping

```ts
const grouped = useMemo(() => {
  const groups: Record<string, ActionDef[]> = {};
  for (const a of actions) {
    const cat = a.category.charAt(0).toUpperCase() + a.category.slice(1);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(a);
  }
  return groups;
}, [actions]);
```

Categories are title-cased for display ("File", "Edit", "View",
"Tool", "Selection"). Insertion order matches the registry's
declaration order.

### cmdk integration

The palette uses cmdk's `Command`, `Command.Input`, `Command.List`,
`Command.Group`, and `Command.Item` primitives:

```tsx
<Command className="..." loop>
  <Command.Input value={search} onValueChange={setSearch} placeholder="..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>
    {Object.entries(grouped).map(([group, items]) => (
      <Command.Group heading={group}>
        {items.map((action) => (
          <Command.Item value={`${action.label} ${group}`} onSelect={() => runCommand(action)}>
            {/* icon, label, shortcut */}
          </Command.Item>
        ))}
      </Command.Group>
    ))}
  </Command.List>
</Command>
```

The `value={...}` per item is what cmdk searches against. Including
the group name in the value lets the user type "view grid" to find
"Toggle Grid" under the View group.

`loop` enables wrap-around arrow-key navigation.

### Run command + close

```ts
const runCommand = useCallback(
  (action: ActionDef) => {
    onExecute(action.id);
    onOpenChange(false);
    setSearch('');
  },
  [onExecute, onOpenChange],
);
```

The palette closes immediately on execution and clears the search
query so the next open starts fresh.

### Keyboard shortcuts

```ts
useEffect(() => {
  const down = (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onOpenChange(!open);
    }
    if (e.key === 'Escape' && open) onOpenChange(false);
  };
  document.addEventListener('keydown', down);
  return () => document.removeEventListener('keydown', down);
}, [open, onOpenChange]);
```

The `⌘K` shortcut is duplicated here and in
`WorkspaceLayoutInner` — both paths converge on `onOpenChange`. The
duplication is harmless because `e.preventDefault()` runs in both
handlers and only one ends up flipping the state.

### Visual layout

- Backdrop: 60% black with backdrop blur, fills the viewport.
- Palette: centered, 512px max width, 20vh from top.
- Footer hint: `↑↓ Navigate · ↵ Select · ESC Close`.

### Toggle indicator

```tsx
const isChecked = action.isToggle && getToggleState?.(action.id);
{
  isChecked && <span className="text-cyan-400 text-xs">✓</span>;
}
```

For actions like `toggleGrid` / `toggleSnap` / `connectLanes`, the
palette renders a checkmark when the toggle is currently active.

## Examples

### Mounting

```tsx
{
  commandPaletteOpen && (
    <Suspense fallback={<OverlayFallback label="Loading command palette..." />}>
      <LazyCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onExecute={execute}
        getToggleState={getToggleState}
      />
    </Suspense>
  );
}
```

The palette is lazy-loaded so its bundle (cmdk + this component)
doesn't weigh on the initial render.

### Adding an action to the palette

```ts
// In src/core/actions/registry.ts
{
  id: 'duplicate',
  category: 'edit',
  label: 'Duplicate Selection',
  inCommandPalette: true,
  // ...
}
```

The palette picks it up on next mount — no other touch points.

### Excluding from palette

Set `inCommandPalette: false` (or omit). E.g. tool-strip-only modal
toggles like the element selectors don't appear in the palette.

## Related

- [Action Registry](/api/core/action-registry)
- [useActionDispatcher](/api/hooks/use-action-dispatcher)
- [Menu bar](/api/components/menu-bar)
- [Tool strip](/api/components/tool-strip)
- [cmdk docs](https://cmdk.paco.me/)
