---
title: MapOutline
description: Read-only structural overview panel — per-Apollo-type counts, orphan / dangling-reference health checks, plus an embedded Apollo header metadata block.
---

# MapOutline

> Source:
>
> - `src/components/layout/panels/MapOutline.tsx`
> - `src/components/layout/panels/MapMetadataForm.tsx` (embedded at the bottom)

## Purpose & UX role

`MapOutline` is the **read-only summary** panel of the sidebar
(`activeTab === 'explorer'`). It lets the user audit a map quickly
before exporting. It does three things:

1. **Total entity count** — single header line `Total entities: N`.
2. **Apollo type breakdown** (17 types) — only types with N>0 are shown.
3. **Drawing primitive count** — `polyline / catmullRom / bezier / arc / rect / polygon` collapsed into one "Drawing Primitives · Total" row.
4. **Health checks**:
   - **Unparented Lanes** — lane has no `junctionId` and isn't listed in any RoadSection
   - **Dangling junction_id** — `lane.junctionId` / `road.junctionId` / `rsu.junctionId` references a junction that doesn't exist
5. **MapMetadataForm** (embedded at the bottom) — surfaces 12 fields from `apollo.hdmap.Map.header`: version / date / projection.proj / district / generation / rev_major / rev_minor / vendor / left / top / right / bottom.

The panel is **read-only**; every mutation flows through other panels (LayerTree, Inspector).

## Props

`MapOutline` takes no props.

```ts
export function MapOutline(): JSX.Element;
```

## Internal state

| Hook                          | Purpose                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `useMapStore(s.entities)`     | Subscribes to the whole entity Map (its reference drives `useMemo`)                            |
| `useMemo(() => computeStats)` | Streams the entities into an `OutlineStats` object: apollo counts, drawing count, orphan count |

`computeStats` steps (`MapOutline.tsx:64-100`):

1. First pass — collect every lane id referenced by some RoadSection (`lanesInSection`).
2. Second pass — for each entity:
   - Drawing type → `drawingCount++`
   - Otherwise → `apolloCounts.set(type, n+1)`
   - For lane / road / rsu, run dangling-junction detection

## Side effects

None. This is a pure derived view.

## Render anatomy

```jsx
<div className="h-full overflow-y-auto p-3 text-xs text-zinc-300 font-mono">
  <div className="mb-3 pb-2 border-b border-white/10">
    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Map Outline</div>
    <div className="text-zinc-400">Total entities: <span className="text-cyan-400">{n}</span></div>
  </div>
  {hasAnything ? (
    <>
      <Section title="Apollo HD-Map">{/* per-type rows */}</Section>
      {drawingCount > 0 && <Section title="Drawing Primitives"><Row label="Total" /></Section>}
      <Section title="Health"><Row label="Unparented Lanes" warn={…} /><Row label="Dangling junction_id" warn={…} /></Section>
    </>
  ) : <div>No entities yet.</div>}
  <MapMetadataForm />
</div>
```

`Section` and `Row` are file-local helpers:

- `Section` — uppercase tiny-caps heading + `space-y-0.5` container.
- `Row` — `flex justify-between`; turns amber on `warn=true`, cyan otherwise.

## MapMetadataForm embed

The embedded `<MapMetadataForm />` reads `useApolloMapStore(s.header, s.info)`. If no Apollo map has been imported, it shows a placeholder:

> No Apollo map imported. Header metadata becomes available after import.

After import, three sections render (Source / Header / Bounds). The form is **read-only** — `apolloMapStore` does not currently expose a `setHeader` mutator (see the long comment at `MapMetadataForm.tsx:6-26`).

## Performance notes

- **Two O(N) passes**: `computeStats` walks the entity map twice. N is typically ≤ 1e4 and the cost is negligible.
- **`useMemo`** is keyed on the `entities` reference. The store sets `entities` to a new immutable Map; reference equality determines re-compute.
- **No selection subscription**: unlike `LayerTree`, `MapOutline` does not depend on the selected id, so selecting an entity does not re-render this panel.

## Known gaps

- The header is not editable (see the comment block at the top of the source file);
- Rows aren't clickable (a future PR could link a row to `SearchPanel`);
- "Total" does not honor layer visibility — hidden layers still count.

## Source map

| Concern           | File location                  |
| ----------------- | ------------------------------ |
| Component body    | `MapOutline.tsx:102-158`       |
| `computeStats`    | `MapOutline.tsx:64-100`        |
| `Section` helper  | `MapOutline.tsx:160-167`       |
| `Row` helper      | `MapOutline.tsx:169-176`       |
| Type constants    | `MapOutline.tsx:10-55`         |
| `MapMetadataForm` | `MapMetadataForm.tsx` (entire) |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) → SidebarPanel → MapOutline (`activeTab='explorer'`)
- [LayerTree](./layer-tree.md) — complementary, editable view
- [`apolloMapStore`](/en/api/store/) — source of header / bounds / info
- [`mapStore`](/en/api/store/store-map) — source of entities
