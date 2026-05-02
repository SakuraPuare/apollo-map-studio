---
title: CommandPalette
description: cmdk-powered ⌘K palette — groups every action whose `inCommandPalette` is true by category, bound to the Action Registry.
---

# CommandPalette

> Source: `src/components/layout/panels/CommandPalette.tsx`

## Purpose & UX role

`CommandPalette` is the classic ⌘K overlay built on [`cmdk`](https://cmdk.paco.me/). Behavior matches VS Code / Linear / Raycast:

- ⌘K (Mac) / Ctrl+K (Win/Linux) opens it
- The input is focused; cmdk runs fuzzy search live
- ↑↓ navigate, Enter executes, Esc closes
- Commands are grouped by `category` (capitalized as the heading)
- Each row shows a `✓` for `isToggle` actions plus a `formatShortcut` keybinding chip

It is the third UI outlet of the [Action Registry](/en/architecture/), alongside [MenuBar](./menu-bar.md) and [ToolStrip](./tool-strip.md). All commands flow from `getCommandPaletteActions()` — adding a new command only requires editing `src/core/actions/registry.ts`.

## Component API

```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute: (actionId: ActionId) => void;
  getToggleState?: (actionId: ActionId) => boolean;
}
```

| Prop             | Type                              | Default     | Description                                                   |
| ---------------- | --------------------------------- | ----------- | ------------------------------------------------------------- |
| `open`           | `boolean`                         | —           | Visibility control                                            |
| `onOpenChange`   | `(open: boolean) => void`         | —           | Open/close callback; usually bound to `setCommandPaletteOpen` |
| `onExecute`      | `(actionId: ActionId) => void`    | —           | Execute callback; usually `useActionDispatcher().execute`     |
| `getToggleState` | `(actionId: ActionId) => boolean` | `undefined` | Returns toggle state for `isToggle` actions (renders ✓)       |

When `open=false`, the component returns `null`; the modal is not in the DOM.

## Internal state

| Hook                                        | Purpose                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `useState<string>('')` `search`             | Current input string (cmdk owns the fuzzy logic)                   |
| `useMemo(() => getCommandPaletteActions())` | One-shot read of available actions (registry is module-level)      |
| `useMemo(() => grouped)`                    | Buckets by `action.category` into `Record<string, ActionDef[]>`    |
| `useCallback runCommand`                    | Calls `onExecute(action.id) → onOpenChange(false) → setSearch('')` |

## Side effects

| When           | Behavior                                                  |
| -------------- | --------------------------------------------------------- |
| `useEffect`    | Mounts a `keydown` listener: ⌘/Ctrl+K toggles, Esc closes |
| Backdrop click | `onOpenChange(false)`                                     |
| `runCommand`   | Closes the palette and clears `search` after dispatching  |

::: warning Double keydown listeners
`WorkspaceLayout` also mounts a ⌘K listener (in its inner `useEffect`); that one mostly closes an already-open palette. CommandPalette's own listener is mounted only while `open=true`. They do not conflict — once cmdk's input has focus, the input intercepts events first.
:::

## Render anatomy

```jsx
<div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
  <div
    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
    onClick={() => onOpenChange(false)}
  />
  <Command
    className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
    loop
  >
    <div className="flex items-center border-b border-white/10 px-4">
      <FaMagnifyingGlass />
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Type a command or search..."
      />
      <kbd>ESC</kbd>
    </div>
    <Command.List className="max-h-[300px] overflow-y-auto p-2">
      <Command.Empty>No results found.</Command.Empty>
      {Object.entries(grouped).map(([group, items]) => (
        <Command.Group heading={group}>
          {items.map((action) => (
            <Command.Item value={`${action.label} ${group}`} onSelect={() => runCommand(action)}>
              <Icon /> <span>{action.label}</span>
              {isChecked && <span>✓</span>}
              {action.shortcut && <kbd>{formatShortcut(action.shortcut)}</kbd>}
            </Command.Item>
          ))}
        </Command.Group>
      ))}
    </Command.List>
    <div className="border-t … flex items-center gap-4 text-[10px] text-zinc-600">
      <span>↑↓ Navigate</span>
      <span>↵ Select</span>
      <span>ESC Close</span>
    </div>
  </Command>
</div>
```

## Performance notes

- **cmdk owns the fuzzy index**: `Command.Item`'s `value` field is the search corpus; filtering is O(N) with a tiny constant.
- **Lazy load**: `WorkspaceLayout/lazyPanels.tsx:21-24` wraps it as `LazyCommandPalette` — cmdk + this component are downloaded only on first open.
- **Empty `useMemo` deps**: `getCommandPaletteActions()` is a module-level array in the registry — never changes at runtime.

## Known gaps

- **No recent-commands history**: order is fixed. A `localStorage` recent buffer would help.
- **No parameterized commands**: every action is a parameterless button. Commands like "Go to entity by id" would need an additional cmdk sub-state-machine.

## Source map

| Concern               | File location                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| Component body        | `CommandPalette.tsx:22-139`                                                   |
| Grouping              | `CommandPalette.tsx:31-42`                                                    |
| `runCommand`          | `CommandPalette.tsx:44-51`                                                    |
| ⌘K / Esc listener     | `CommandPalette.tsx:53-66`                                                    |
| Action Registry entry | `src/core/actions/registry.ts` (`getCommandPaletteActions`, `formatShortcut`) |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — mounts `LazyCommandPalette`
- [MenuBar](./menu-bar.md) / [ToolStrip](./tool-strip.md) — sibling Action Registry outlets
- [`useActionDispatcher`](/en/api/hooks)
- [Architecture overview](/en/architecture/) — Action Registry
