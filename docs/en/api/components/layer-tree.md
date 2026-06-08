---
title: LayerTree
description: react-arborist drag-and-drop tree for Apollo entities — reparent across Junction / Road / Section / Lane, with visibility/lock toggles.
---

# LayerTree

> Source:
>
> - `src/components/layout/panels/LayerTree.tsx`
> - `src/components/layout/panels/LayerTree/Node.tsx`
> - `src/components/layout/panels/LayerTree/treeBuilder.ts`
> - `src/components/layout/panels/LayerTree/types.ts`
> - `src/components/layout/panels/LayerTree/constants.ts`

## Purpose & UX role

`LayerTree` is the sidebar's **structural editor** view (`activeTab === 'layers'`). It uses [`react-arborist`](https://github.com/brimdata/react-arborist) to virtualize the tree of every entity, and supports:

- **Drag-and-drop reparent**: lane → junction, lane → RoadSection, lane back to the unparented group.
- **Visibility toggle** (eye icon): backed by `uiStore.layerStates`, drives the cold-layer renderer in real time.
- **Lock toggle** (padlock): locked layers ignore canvas hit-tests.
- **Delete** (trash): calls `removeEntity(id)`.
- **Detach** (link icon): `reparentEntity(id, { kind: 'none' })`.
- **Quick Create**: `+ Road` / `+ RSU` buttons in the toolbar.

The tree is built by `treeBuilder.ts`, which centralizes the dual-parent semantics for lanes (junction-owned vs road-section-owned) and the canonical ordering of the 17 Apollo entity groups.

## Composition tree

```mermaid
flowchart TB
  LT[LayerTree]
  LT --> Toolbar[Toolbar: + Road / + RSU]
  LT --> ArboristTree[<Tree> from react-arborist]
  ArboristTree --> Node[Node renderer]
  Node --> Group[Group: Roads / Junctions / Lanes / …]
  Node --> Section[Section: roadId:sectionId]
  Node --> Entity[Entity row \(name, icon, actions\)]
```

## Props

```ts
interface LayerTreeProps {
  onSelect?: (entityId: string | null) => void;
  selectedId?: string | null;
}
```

| Prop         | Type                                 | Default     | Description                                                                             |
| ------------ | ------------------------------------ | ----------- | --------------------------------------------------------------------------------------- |
| `onSelect`   | `(entityId: string \| null) => void` | `undefined` | Called on selection change. Groups / sections fire `null`; entities fire the entity id. |
| `selectedId` | `string \| null`                     | `null`      | External selected-entity id — passed into react-arborist's controlled `selection` prop. |

## Internal state

| Hook                                 | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `useMapStore(s.entities)`            | Subscribes to the full entity Map                   |
| `useMapStore(s.reparentEntity)`      | Calls `reparentEntity(id, target)` to switch parent |
| `useMapStore(s.addEntity)`           | `+ Road` / `+ RSU` buttons                          |
| `useRef<TreeApi<TreeNode>>`          | `treeRef` — react-arborist imperative handle        |
| `useMemo(() => buildTree(entities))` | Streams entities into the tree-node array           |

Wrapped callbacks via `useCallback`: `createRoad` / `createRSU` / `handleSelect` / `checkDisableDrop` / `handleMove`.

## Side effects

No `useEffect` — every action is driven by react-arborist callbacks.

### `handleMove`

Receives `dragNodes` (dragged) + `parentNode` (target). Flow:

1. Pull the dragged entity id and the target's `parentTarget` (`{ kind: 'junction' | 'road' | 'roadSection' | 'none', … }`).
2. Call `mapStore.reparentEntity(id, target)`.
3. The store delegates to `entityOps.reparent`, which performs validity checks and proto translation ([R2 anti-corruption layer](/en/architecture/)).
4. On `{ rejected: '...' }`, the console warns — e.g. dropping a road inside a lane.

### `checkDisableDrop`

Called by react-arborist while dragging to decide if the drop target is valid:

- Dragging non-entity → disabled
- No parent node → disabled
- Target has no `parentTarget` → disabled
- Otherwise delegate to `entityOps.canReparent(child, target, entities)`

`canReparent` is the validity oracle inside the anti-corruption layer; it owns every Apollo-proto relational constraint.

## treeBuilder algorithm

`buildTree(entities)` runs in this order:

1. **Pre-pass**: separate roads + junctions, build `laneSection` Map (lane id → owning RoadSection).
2. **Main pass**: bucket each entity into a parent (lane → junction / section / unparented; road → junction / unparented; rsu → mirror lane; everything else → group).
3. **Top-level group ordering**: dictated by `TOP_LEVEL_ORDER` (17 Apollo + 6 drawing primitives, see `constants.ts:27-51`).

A `TreeNode`'s `parentTarget` field encodes "if you drop on me, this is the argument to pass to `reparentEntity`". It is the contract between `entityOps` and react-arborist.

## Node rendering (`Node.tsx`)

Each row is 39px:

```jsx
<div ref={dragHandle} onClick={…} className={…}>
  <Chevron />
  <Icon /> {/* group: FaLayerGroup; section: §; entity: emoji */}
  <span>{name}</span>
  {(group||section) && <span>{children.length}</span>}
  <ActionButtons /> {/* visible on hover */}
</div>
```

- **On groups**: eye + lock buttons bound to `useUIStore.toggleLayerVisible(groupKey)` / `toggleLayerLocked(groupKey)`.
- **On entities**: link icon (detach) + trash icon (delete).
- Selected = `bg-cyan-500/15`; hidden group = `opacity-50`; drop-target = `bg-cyan-500/10 ring-1 ring-cyan-500/30`.

## Render anatomy

```jsx
<div className="h-full flex flex-col">
  <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800/60">
    <button onClick={createRoad}><FaPlus />Road</button>
    <button onClick={createRSU}><FaPlus />RSU</button>
  </div>
  {treeData.length === 0 ? <Empty /> : (
    <Tree<TreeNode> ref={treeRef} data={treeData} … >{Node}</Tree>
  )}
</div>
```

## Performance notes

- **`buildTree` is O(N)** plus a handful of Map operations. <1ms at N ≤ 1e4.
- **Virtualization**: `overscanCount=10`, `rowHeight=26` — only visible rows + buffer are rendered, no matter how big the tree.
- **`checkDisableDrop` is hot during drag**: `canReparent` must stay O(1)~O(K) — it is already implemented with Map / Set lookups.
- **Controlled `selection`**: feed `entity:${selectedId}` string through props to keep arborist in sync with the FSM-derived selection.

## Known constraints

- `Tree`'s `height={600}` is a hardcoded constant — it does not yet respond to container resize. Resizing the sidebar produces inner scrolling instead of panel scrolling. Fix needs a `ResizeObserver`.
- `+ Road` creates one empty RoadSection; the user must drag lanes into it manually to complete the assignment.

## Source map

| Concern                       | File location                       |
| ----------------------------- | ----------------------------------- |
| Main component                | `LayerTree.tsx:17-142`              |
| `+ Road` / `+ RSU` creation   | `LayerTree.tsx:25-48`               |
| `handleSelect`                | `LayerTree.tsx:50-60`               |
| `checkDisableDrop`            | `LayerTree.tsx:62-77`               |
| `handleMove`                  | `LayerTree.tsx:79-97`               |
| Node renderer                 | `LayerTree/Node.tsx` (entire)       |
| Tree builder                  | `LayerTree/treeBuilder.ts` (entire) |
| TYPE_LABELS / TOP_LEVEL_ORDER | `LayerTree/constants.ts`            |
| `TreeNode` / `DropKind`       | `LayerTree/types.ts`                |
| `entityOps.canReparent`       | `src/lib/entityOps.ts`              |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) → SidebarPanel → LayerTree (`activeTab='layers'`)
- [`mapStore.reparentEntity`](/en/api/store/store-map)
- [`entityOps`](/en/api/lib/) — R2 anti-corruption layer entrypoint
- [Architecture overview](/en/architecture/) — anti-corruption layer
- [InspectorForms](./inspector-forms.md) — detail editing for the selected entity
