# Customizing Keyboard Shortcuts

All keyboard shortcuts trace back to the action registry. Changing a
binding is a one-line edit; the keyboard handler in
`useActionDispatcher` reads the registry on mount and rebuilds its
listener whenever the dispatcher remounts.

## File map

```text
src/core/actions/registry/
  types.ts          # KeyBinding interface
  definitions.ts    # ACTION_DEFS — the bindings live here
  helpers.ts        # matchesKeybinding, formatShortcut, isMacPlatform
src/hooks/
  useActionDispatcher.ts   # window keydown listener that consumes the registry
```

The platform-aware display helper (`formatShortcut`) and the matcher
(`matchesKeybinding`) handle Cmd-vs-Ctrl translation, so authors only
write the canonical Mac glyph form once.

## Step 1 — Pick the action

Open `src/core/actions/registry/definitions.ts` and find the action
you want to rebind. Every entry has both a display string
(`shortcut`) and a dispatch matcher (`keybinding`):

```ts
{
  id: 'undo',
  label: 'Undo',
  category: 'edit',
  shortcut: '⌘Z',                            // display only
  keybinding: { key: 'z', ctrl: true, global: true }, // matcher
  // …
},
```

The two must stay in sync — `formatShortcut('⌘Z')` renders `Ctrl+Z`
on non-Mac, but if you change `keybinding.key` to `'y'` without
updating `shortcut`, the menu displays `⌘Z` while the actual binding
is `Ctrl+Y`.

## Step 2 — Edit both fields

To rebind redo from `⇧⌘Z` to `⌘Y`:

```ts
{
  id: 'redo',
  label: 'Redo',
  category: 'edit',
  shortcut: '⌘Y',
  keybinding: { key: 'y', ctrl: true, global: true },
  // …
},
```

`formatShortcut` uses a small glyph table:

```text
⌘ → Ctrl+
⌃ → Ctrl+
⇧ → Shift+
⌥ → Alt+
```

Non-modifier glyphs (`⌫`, `⏎`, function-key indicators) pass through.
Write modifiers in the canonical Mac order: `⌃⌥⇧⌘<key>`.

## Step 3 — Verify

`pnpm dev` and exercise:

- The new shortcut triggers the action.
- The menu / palette / tooltip displays `⌘Y` on Mac and `Ctrl+Y` on
  Linux/Windows.
- `pnpm test` — the action registry tests still pass.

## `KeyBinding` semantics

```ts
export interface KeyBinding {
  key: string; // matched against e.key.toLowerCase()
  ctrl?: boolean; // matches e.ctrlKey OR e.metaKey
  shift?: boolean;
  alt?: boolean;
  global?: boolean; // if false, suppressed when an input is focused
}
```

The matcher (`matchesKeybinding` in `helpers.ts`):

```ts
export function matchesKeybinding(e: KeyBindingEvent, kb: KeyBinding): boolean {
  if (e.key.toLowerCase() !== kb.key.toLowerCase()) return false;
  if (!!kb.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (!!kb.shift !== e.shiftKey) return false;
  if (!!kb.alt !== e.altKey) return false;
  return true;
}
```

Notable details:

- **`ctrl: true` matches Cmd on Mac.** No need for a separate
  `meta: true`. The keyboard handler in `useActionDispatcher` enforces
  this at dispatch time.
- **All comparisons are lowercased.** `'Z'` and `'z'` are the same
  binding. Use lowercase in the registry for consistency with how
  `e.key` arrives.
- **Special keys take their `e.key` name verbatim.** `'delete'`,
  `'escape'`, `'enter'`, `'backspace'`, `'arrowup'`, `'tab'`, `' '`
  (literal space). Don't use synonyms.
- **`shift: true` is required when the key produces a different
  character with shift held.** `key: '?'` will never fire because the
  browser delivers `e.key === '/'` with `shiftKey: true`. Use
  `{ key: '/', shift: true }` instead.

## `global` semantics

The dispatcher's keyboard handler:

```ts
const inInput =
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement;

for (const action of kbActions) {
  if (inInput && !action.keybinding.global) continue;
  // …
}
```

| `global` | Effect                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| `false`  | Suppressed while focus is in an input. Default for tool selectors.             |
| `true`   | Fires regardless of focus. Use for save, undo/redo, command palette, settings. |

Default to `global: false`. Promote to `true` only when the action is
genuinely cross-cutting; otherwise the user can't type a `p` into the
inspector without the polyline tool arming.

## Platform display via `formatShortcut`

`formatShortcut(shortcut)` is called by every UI surface that displays
a binding (`MenuBar`, `CommandPalette`, `ToolStrip` tooltips). It
returns the input unchanged on Mac and substitutes glyphs on other
platforms. Manual platform branches in components are unnecessary.

`isMacPlatform()` is memoised — first call samples
`navigator.userAgentData.platform` then `navigator.platform` then the
user agent string. Tests can call `_resetIsMacCache()` to clear the
memo between specs.

## Conflict resolution

When two defs match the same `KeyBinding` event, the **first one in
`ACTION_DEFS` order** wins. The handler returns immediately on a
match:

```ts
if (matchesKeybinding(e, action.keybinding)) {
  e.preventDefault();
  execute(action.id);
  return;
}
```

Don't resolve conflicts by reordering. Add a modifier so the new
binding is unambiguous, or repurpose the conflicting action.

## Chord support

The registry currently has **no chord support** (`Cmd+K Cmd+S`-style
two-stroke bindings). Every entry is single-stroke. If you need a
chord, the right place to add it is the keyboard handler in
`useActionDispatcher`: introduce a stateful prefix matcher that
collapses to single-stroke `KeyBinding` after the prefix is consumed,
then time out the prefix after ~1 second. Until that lands, plan
shortcuts around single-stroke bindings.

## Removing a shortcut

To remove a binding without removing the action:

```ts
{
  id: 'commandPalette',
  label: 'Command Palette',
  // shortcut, keybinding removed
  inCommandPalette: false,
  // …
}
```

The action remains executable via `execute('commandPalette')` from
the palette or a menu item — the keyboard handler simply ignores it
because `getKeyBindingActions()` filters on `keybinding`.

## Verification

1. `pnpm typecheck` — `KeyBinding` shape is enforced.
2. `pnpm test` — registry tests cover the new binding shape.
3. `pnpm dev`:
   - Press the binding on Mac and on a non-Mac VM (or fake the UA in
     DevTools) — both should fire the action.
   - Open the menu / palette — both should show the platform-correct
     display string.
   - Focus an inspector input and press the binding — fires only if
     `global: true`.

## Cross-references

- [/api/core](../api/core/) — `matchesKeybinding`, `formatShortcut`,
  `isMacPlatform`
- [adding-a-new-action](./adding-a-new-action.md) — full action def
  shape
- [/guide/shortcuts](../guide/shortcuts.md) — user-facing reference
