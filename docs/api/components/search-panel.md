# SearchPanel

> Source: `src/components/layout/panels/SearchPanel.tsx`

## Overview

`SearchPanel` is the sidebar tab that lets the user find an entity by
ID or type substring, regardless of where it sits in the layer tree's
hierarchy. The result is a flat clickable list with type badges. This
is the fast-path "I know what I'm looking for, take me to it" tool.

The search query lives in `SidebarContext`, so it persists across tab
switches.

## Component props

```ts
interface SearchPanelProps {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}
```

| Prop         | Source                                                       |
| ------------ | ------------------------------------------------------------ |
| `selectedId` | FSM `context.selectedEntityId` (highlight matching row)      |
| `onSelect`   | Forwards into `actorRef.send({ type: 'SELECT_ENTITY', id })` |

## Behavior

### Search algorithm

```ts
const results = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return [];
  const out: { id: string; entityType: string }[] = [];
  for (const e of entities.values()) {
    if (e.id.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q)) {
      out.push({ id: e.id, entityType: e.entityType });
      if (out.length >= 200) break; // safety cap for huge maps
    }
  }
  return out;
}, [entities, searchQuery]);
```

| Behavior    | Detail                                                       |
| ----------- | ------------------------------------------------------------ |
| Match       | Substring on lowercased id **or** entityType                 |
| Empty query | Empty results (no list, hint shown)                          |
| Cap         | 200 hits — protects rendering on huge maps                   |
| Linear scan | `O(n)` per keystroke; fine for tens of thousands of entities |

The result is intentionally a flat list — the user has already typed
something specific, the layer hierarchy is in the way.

### Persisted query

```ts
const { searchQuery, setSearchQuery } = useSidebar();
```

`SidebarContext` owns the query, so:

- Switching to another tab and back keeps the query and results.
- The query survives across activity-bar switches in the same session.

### Result item

```tsx
<li
  onClick={() => onSelect?.(r.id)}
  className={clsx('...', selectedId === r.id && 'bg-cyan-500/15')}
>
  <span className="font-mono">{r.id.length > 22 ? `…${r.id.slice(-18)}` : r.id}</span>
  <span className="uppercase tracking-wider text-zinc-500">{r.entityType}</span>
</li>
```

Each row shows:

- The id (truncated to last 18 chars if longer than 22 — useful for
  long Apollo ids like `lane_road1_section0_lane3_xxxxx`).
- A small uppercase tracking-wide type badge.
- Selection highlight when `selectedId === r.id`.

### Accessibility

The input has `type="search"` and `autoFocus` — so opening the Search
tab focuses the box automatically and shows the OS-provided clear
button. The footer shows `${count} matches` so the user knows when
they've narrowed enough.

### Empty states

| Condition          | Render                                    |
| ------------------ | ----------------------------------------- |
| Empty query        | "Search across all entity ids and types." |
| Non-empty, no hits | "No matches"                              |
| Has hits           | `<ul>` of result rows                     |

## Examples

### Mounting

```tsx
<SearchPanel selectedId={selectedId} onSelect={handleSelect} />
```

`handleSelect` from `SidebarPanelContent` turns the id into a
`SELECT_ENTITY` event, so clicking a result selects the entity in the
canvas + inspector + layer tree simultaneously.

### Programmatically running a search

```ts
import { useSidebar } from '@/context/SidebarContext';

const { setSearchQuery } = useSidebar();
setSearchQuery('lane_42');
```

Useful for scripted test scenarios.

## Related

- [SidebarPanel](/api/components/map-outline)
- [Layer tree](/api/components/layer-tree)
- `src/context/SidebarContext.tsx`
- [editorMachine.SELECT_ENTITY](/api/core/editor-machine)
