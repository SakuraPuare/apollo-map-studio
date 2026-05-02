# LayerTree

> Source: `src/components/layout/panels/LayerTree.tsx`, `src/components/layout/panels/LayerTree/{Node.tsx,treeBuilder.ts,types.ts,constants.ts}`

## Overview

`LayerTree` is the sidebar's hierarchical view of the map document.
It uses [react-arborist](https://github.com/brimdata/react-arborist)
to render a virtualized tree with drag-and-drop reparenting:

- **Group** rows — top-level type buckets (Roads, Junctions, Lanes,
  …). Visibility / lock toggles per group.
- **Section** rows — each road's `RoadSection` lists its lanes.
- **Entity** rows — actual entities, draggable. Hovered actions:
  detach from parent, delete.

The tree is built from `mapStore.entities` via
`buildTree(entities)` and re-runs whenever the entity map reference
changes.

## Component props

```ts
interface LayerTreeProps {
  onSelect?: (entityId: string | null) => void;
  selectedId?: string | null;
}
```

| Prop         | Source                                                        |
| ------------ | ------------------------------------------------------------- |
| `onSelect`   | Forwarded as `SELECT_ENTITY` to FSM via `SidebarPanelContent` |
| `selectedId` | FSM `context.selectedEntityId`, drives row highlighting       |

## Behavior

### Tree shape

```
Roads
├─ road_1 (entity, expandable)
│  ├─ Section sec_a   (drop target → roadSection)
│  │  ├─ lane_x
│  │  └─ lane_y
│  └─ Section sec_b
│     └─ lane_z
Junctions
├─ junction_1 (drop target → junction)
│  ├─ lane_under_junction
│  ├─ road_under_junction
│  └─ rsu_under_junction
Lanes
└─ lane_unparented        ← orphan bucket
RSUs
└─ rsu_unparented
Signals, Crosswalks, …
```

The grouping rules:

- **Lanes** with a resolvable `junctionId` go under that junction.
- **Lanes** that appear in any `RoadSection.laneIds` go under that
  section.
- **Lanes** that satisfy neither show under the top-level "Lanes"
  group as orphans.
- **Roads** with a resolvable `junctionId` go under that junction;
  otherwise top-level "Roads".
- **RSUs** with a resolvable `junctionId` go under that junction;
  otherwise top-level "RSUs".
- All other types live under their type group only.

### Drag and drop

```ts
disableDrag={(node) => node.kind !== 'entity'}
disableDrop={checkDisableDrop}
onMove={handleMove}
```

`checkDisableDrop` runs `canReparent(child, target, entities)` from
`@/lib/entityOps`. Drop is blocked if:

- The drag node isn't an entity.
- The target node has no `parentTarget` (groups for non-reparentable
  types).
- The reparent would create a cycle or violate type constraints.

`handleMove` dispatches `mapStore.reparentEntity(id, target)`. If the
store rejects (e.g. mid-flight race condition), the rejection is
logged.

### Top-level Road / RSU creation

```tsx
<button onClick={createRoad}>+ Road</button>
<button onClick={createRSU}>+ RSU</button>
```

Both buttons allocate an id via `nextEntityId(...)` and call
`addEntity(...)`. New roads come with one empty section so the user
can immediately drag lanes into it.

### Inline visibility / lock

Per-group, the user can toggle:

- **Visibility** — `uiStore.toggleLayerVisible(entityType)`. The cold
  layer reads `layerStates[type].visible` to filter features.
- **Lock** — `uiStore.toggleLayerLocked(entityType)`. Locked layers
  cannot be hit-tested or selected; the canvas event router filters
  them.

These actions only render on group rows (entity rows show detach +
delete instead).

## LayerTree/Node.tsx

Each tree row uses the `Node` component. It renders:

1. A chevron for internal nodes (rotates open).
2. An icon — `FaLayerGroup` for groups, `§` for sections, or the
   per-type emoji from `entityIcon(...)`.
3. The display name (truncated id for entities).
4. Child count for groups / sections.
5. Hover-revealed action buttons (visibility/lock for groups,
   detach/delete for entities).

Drag handle uses `dragHandle` from react-arborist's NodeRendererProps.
Selection state is internal to react-arborist; clicking either
toggles open (internal) or selects (leaf).

## LayerTree/treeBuilder.ts

```ts
export function buildTree(entities: ReadonlyMap<string, MapEntity>): TreeNode[];
```

Pure function. Two-pass build:

1. **Pass 1** — collect roads + junctions; precompute the
   `lane → {roadId, sectionId}` lookup.
2. **Pass 2** — walk every entity once, decide its parent bucket via
   the rules above, and push it into the appropriate
   `Map<key, TreeNode[]>`.

Then assemble groups in `TOP_LEVEL_ORDER`, falling through to any
remaining keys for forward compatibility.

```ts
function dropKindForGroup(entityType: string): DropKind {
  if (entityType === 'lane' || entityType === 'rsu' || entityType === 'road') return 'unparented';
  return 'none';
}

function parentTargetForGroup(entityType: string): ParentTarget | undefined {
  if (entityType === 'lane' || entityType === 'rsu' || entityType === 'road') {
    return { kind: 'none' };
  }
  return undefined;
}
```

Lane / RSU / Road groups can receive drops with target `{ kind: 'none' }`,
which is interpreted by `entityOps.reparentEntity` as "remove from
current parent".

## LayerTree/types.ts

```ts
export type DropKind = 'junction' | 'road' | 'roadSection' | 'unparented' | 'none';

export interface TreeNode {
  id: string; // 'group:lane', 'section:road1:secA', 'entity:lane_42'
  name: string;
  kind: 'group' | 'section' | 'entity';
  entityType?: string;
  entityId?: string;
  parentTarget?: ParentTarget;
  dropKind: DropKind;
  children?: TreeNode[];
}
```

The `id` field uses prefixes (`group:`, `section:`, `entity:`) so
react-arborist's keyed lookups don't collide between buckets.

## LayerTree/constants.ts

```ts
export const TYPE_LABELS: Record<string, string>; // 'lane' → 'Lanes'
export const TOP_LEVEL_ORDER: readonly string[]; // canonical group order
export function entityIcon(entityType: string): string;
export function entityDisplayId(id: string): string; // truncated id
```

`TOP_LEVEL_ORDER` is the source of truth for which type group renders
first (Roads → Junctions → Lanes → Signals → …). Adding a new entity
type means appending to this list and to `TYPE_LABELS` /
`ENTITY_GLYPH`.

`entityIcon` returns an emoji glyph per type — fast and recognizable
without an icon font dependency. Falls back to `📄` for unknown
types.

`entityDisplayId(id)` truncates to last 12 chars if longer than 16,
prefixed with `…`. Long Apollo ids stay readable without wrapping.

## Examples

### Mounting

```tsx
<LayerTree onSelect={handleSelect} selectedId={selectedId} />
```

`handleSelect(id)` dispatches `SELECT_ENTITY` to the FSM, which is the
same path canvas clicks use.

### Adding a new entity type

1. Append to `TOP_LEVEL_ORDER` and `TYPE_LABELS`.
2. Add an emoji to `ENTITY_GLYPH`.
3. If the type allows reparenting, extend
   `dropKindForGroup` / `parentTargetForGroup` and update
   `entityOps.canReparent`.

### Inspecting the tree

```ts
import { buildTree } from '@/components/layout/panels/LayerTree/treeBuilder';

const tree = buildTree(useMapStore.getState().entities);
console.log(JSON.stringify(tree, null, 2));
```

## Related

- [react-arborist](https://github.com/brimdata/react-arborist)
- [entityOps reparent](/api/lib/entity-ops) — `canReparent`, `reparentEntity`
- [mapStore.reparentEntity](/api/store/store-map)
- [uiStore.layerStates](/api/store/store-ui) — visibility/lock state
- [SidebarPanel](/api/components/map-outline)
