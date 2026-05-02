---
title: SearchPanel
description: Sidebar flat substring search — matches entity id and entityType case-insensitively, capped at 200 hits, click to select.
---

# SearchPanel

> Source: `src/components/layout/panels/SearchPanel.tsx`

## Purpose & UX role

`SearchPanel` is the content rendered when the ActivityBar's `search` tab is active. It does one thing: a **flat** substring search across `mapStore.entities` that produces a clickable list. Unlike `LayerTree`, there is **no hierarchy** — the goal is to find an entity even when the user does not know where it lives.

UX behavior:

- The input is auto-focused on mount; the query string is shared with the parent through `useSidebar()`, so toggling the panel does not lose state.
- Matches use the entity id (case-insensitive) and the `entityType` (`lane` / `crosswalk` / …).
- Hit count is capped at 200 to prevent thousands of DOM rows on large maps.
- The currently selected entity is highlighted with `bg-cyan-500/15`.

## Composition tree

```mermaid
flowchart TB
  SP[SearchPanel]
  SP --> Header[input + match count]
  SP --> List[results list \(<= 200\)]
  List --> Row[Row \(id, entityType\)]
```

## Props

```ts
interface SearchPanelProps {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}
```

| Prop         | Type                           | Default     | Description                                                                                             |
| ------------ | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------- |
| `selectedId` | `string \| null`               | `undefined` | Highlights the currently selected row.                                                                  |
| `onSelect`   | `(id: string \| null) => void` | `undefined` | Row click callback; typically wired to the same path as `actorRef.send({ type: 'SELECT_ENTITY', id })`. |

## Internal state

| Hook                      | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `useMapStore(s.entities)` | Subscribes to the entity Map.                                         |
| `useSidebar()`            | `searchQuery` / `setSearchQuery` — shares the query with the sidebar. |
| `useMemo(() => results)`  | Derives the hit array from `entities` + `searchQuery`.                |

Derivation (`SearchPanel.tsx:20-31`):

```ts
const q = searchQuery.trim().toLowerCase();
if (!q) return [];
const out: { id: string; entityType: string }[] = [];
for (const e of entities.values()) {
  if (e.id.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q)) {
    out.push({ id: e.id, entityType: e.entityType });
    if (out.length >= 200) break;
  }
}
return out;
```

The 200-cap is an explicit `break`, not React-side trimming.

## Side effects

No effect. `autoFocus` is browser-native — the `<input autoFocus />` grabs focus on mount.

## Render anatomy

```jsx
<div className="h-full flex flex-col">
  <div className="px-2 py-2 border-b border-white/[0.07] shrink-0">
    <div className="relative">
      <FaMagnifyingGlass className="absolute …" />
      <input type="search" value={searchQuery} onChange={…} placeholder="Search id or type…" autoFocus />
    </div>
    <div className="text-[10px] text-zinc-600 mt-1 px-1">
      {searchQuery ? `${results.length} match${…}` : 'Type to search'}
    </div>
  </div>
  <div className="flex-1 overflow-y-auto">
    {/* ul of li rows */}
  </div>
</div>
```

Each result row:

```jsx
<li onClick={() => onSelect?.(r.id)} className={…}>
  <span className="text-xs font-mono text-zinc-300 truncate" title={r.id}>
    {r.id.length > 22 ? `…${r.id.slice(-18)}` : r.id}
  </span>
  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
    {r.entityType}
  </span>
</li>
```

## Performance notes

- **O(N) linear scan**: every keystroke walks every entity. ~1ms at N=1e4 — no index needed.
- **Early break at 200**: avoids generating thousands of DOM rows when the query is too broad.
- **`useMemo` is keyed on entities + query**: React fast-refresh preserves the memo cache.
- **No match highlighting**: the matched substring is not yellow-bolded yet — a P9 candidate.

## Known gaps

- No facet filter (e.g. `type:lane`);
- No fuzzy / edit-distance matching;
- The 200 cap is too tight for 1e5+ entity maps — would require a worker-side index or chunked rendering.

## Source map

| Concern             | File location                    |
| ------------------- | -------------------------------- |
| Component body      | `SearchPanel.tsx:16-82`          |
| Derived results     | `SearchPanel.tsx:20-31`          |
| Input + match count | `SearchPanel.tsx:35-52`          |
| Results list        | `SearchPanel.tsx:53-79`          |
| `SidebarContext`    | `src/context/SidebarContext.tsx` |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) → SidebarPanel → SearchPanel (`activeTab='search'`)
- [LayerTree](./layer-tree.md) — complementary hierarchical view
- [`mapStore`](/en/api/store/store-map)
- `useSidebar` → `src/context/SidebarContext.tsx`
