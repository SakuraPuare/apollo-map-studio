# Layer tree

The layer tree (Activity bar → Layers tab) shows every entity in the map
as a hierarchy. It's the canonical way to navigate large maps, reparent
lanes into roads or junctions, and seed empty Apollo entities you'll fill
in later.

## Source map

| Concern                              | File                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| Top-level component                  | `src/components/layout/panels/LayerTree.tsx`                 |
| Tree builder (entities → tree nodes) | `src/components/layout/panels/LayerTree/treeBuilder.ts`      |
| Tree node renderer                   | `src/components/layout/panels/LayerTree/Node.tsx`            |
| Tree types                           | `src/components/layout/panels/LayerTree/types.ts`            |
| Reparent guard                       | `canReparent()` in `src/lib/entityOps.ts`                    |
| Reparent action                      | `reparentEntity()` in `src/store/mapStore.ts`                |
| Tree library                         | [react-arborist](https://github.com/brimdata/react-arborist) |

## Tree shape

```
[+ Road]   [+ RSU]                          ← header buttons (LayerTree.tsx:101)

Map
├─ Apollo
│  ├─ Roads
│  │  └─ road_001                           ← RoadEntity
│  │     └─ Section sect_001                ← RoadSection (synthetic node)
│  │        ├─ lane_001                     ← LaneEntity (lane.section = sect_001)
│  │        └─ lane_002
│  ├─ Junctions
│  │  └─ junction_001                       ← JunctionEntity
│  │     ├─ lane_003                        ← lane.junctionId = junction_001
│  │     ├─ lane_004
│  │     └─ rsu_001                         ← rsu.junctionId = junction_001
│  ├─ PNC Junctions
│  ├─ Signals
│  ├─ Crosswalks
│  ├─ Stop Signs
│  ├─ Yield Signs
│  ├─ Speed Bumps
│  ├─ Clear Areas
│  ├─ Parking Spaces
│  ├─ Barrier Gates
│  ├─ Areas
│  └─ Overlaps
└─ Drawings
   ├─ polyline_001
   ├─ bezier_001
   └─ …
```

Bucket nodes (`Apollo`, `Drawings`, type categories) are synthetic — they
don't correspond to entities, just to grouping. Entity nodes are clickable;
bucket nodes are not.

::: tip Closed by default
The tree starts with all groups collapsed (`openByDefault={false}`). Click
the chevron to expand. This keeps performance reasonable on 10k+ entity
maps.
:::

## Selection

Click any entity node to select it:

1. `LayerTree.tsx:50-60` calls `onSelect(entityId)` on the upstream prop.
2. Upstream sends `SELECT_ENTITY` to the FSM.
3. The FSM transitions to `selected` state.
4. The Inspector renders the entity's form.
5. The map canvas highlights the entity.

The reverse path (clicking on the canvas) is also wired: clicking a hit-test
target selects the entity, and `selectedId` flows back into the tree as the
selected node.

::: warning Multi-select isn't supported
The tree uses single-select only. Selecting a node deselects the previous.
Bulk operations (delete, reparent) are out of scope for 1.0.
:::

## Drag-and-drop reparenting

Drag any entity node to a different parent to reassign it. Two checks gate
the drop:

### Compile-time check — `disableDrag`

```ts
disableDrag={(node) => node.kind !== 'entity'}
```

Bucket and section nodes are not draggable.

### Runtime check — `disableDrop` → `canReparent`

`canReparent(child, target, entities)` (in `src/lib/entityOps.ts`) returns
`true` if and only if the move is structurally allowed by the Apollo proto
schema.

The allowed moves:

| Child entity | Target             | Effect on entity                                                |
| ------------ | ------------------ | --------------------------------------------------------------- |
| Lane         | RoadSection        | Adds lane to `section.laneIds`, removes from any other section  |
| Lane         | Junction           | Sets `lane.junctionId`, clears any RoadSection membership       |
| Lane         | (root, "unassign") | Clears `junctionId` and any section membership                  |
| RSU          | Junction           | Sets `rsu.junctionId`                                           |
| Road         | Junction           | Sets `road.junctionId` (rare; mostly for ramp-style topologies) |

Rejected drops display the cursor's "no" indicator and never fire `onMove`.
If `reparentEntity` itself rejects (race condition where the user dragged
faster than state propagated), it returns `{ rejected: '<reason>' }` and
`LayerTree.tsx:91` console-warns. The child snaps back.

::: tip A drop that "does nothing" is usually disallowed
If you drag and the cursor flashes red, `canReparent` returned false. Check
that the target type matches the child's allowed parents. The most
common mistake: trying to drop a Lane onto a Junction's child Lane (you
must drop onto the Junction itself).
:::

::: warning Reparenting recomputes topology
Moving a lane between sections or junctions triggers a topology
reconciliation. Predecessor / successor links may change as a result.
If you've manually authored pred/succ via the Inspector, those won't be
clobbered (they're tagged in `_userOverrides`); but auto-derived links
will rebuild against the new parent. Read [Topology and junctions](/guide/topology-and-junctions)
for the full reconciliation logic.
:::

## Header buttons

Two buttons at the top of the panel:

### `+ Road`

Creates a new empty `RoadEntity` with one empty `RoadSection`:

```ts
const road: RoadEntity = {
  id: nextEntityId('road', entities),
  entityType: 'road',
  sections: [{ id: nextSubId(SUB_PREFIX.section, []), laneIds: [] }],
  junctionId: null,
  type: 'CITY_ROAD',
};
```

The road appears under `Roads`, with one empty `Section` child. Drag your
existing lanes into the section to populate it.

### `+ RSU`

Creates a new empty `RSUEntity`:

```ts
const rsu: RSUEntity = {
  id: nextEntityId('rsu', entities),
  entityType: 'rsu',
  junctionId: null,
  overlapIds: [],
};
```

The RSU appears under `RSUs`. Drag it into a Junction to assign.

::: tip Why no "+ Junction" button?
Junctions have geometry — a polygon outline. You can't seed an empty
Junction without a polygon. Use the ToolStrip's Junction element + Polygon
tool instead, which produces a Junction with the polygon you draw.
:::

## Visibility (current state)

**Today**, every entity is always visible on the canvas. There is no
per-entity / per-type visibility toggle in the layer tree. This is a known
gap; the cold-layer pipeline supports per-layer filtering and could front
a tree-side toggle, but the UI hasn't shipped.

If you need to focus on a subset, use [Search](/guide/activity-bar-and-panels#search-panel-searchpanel)
to filter, or zoom in past the cluttered region.

## Reordering

react-arborist supports reordering siblings, and the editor allows it for
lanes within a `RoadSection`. The order in `section.laneIds` is significant
in Apollo — it determines the lane index used for
`leftNeighborForwardIds[0]` / `rightNeighborForwardIds[0]` derivation. If
you reorder lanes within a section, the neighbor links recompute on the
next save.

::: warning Section reorder is not implemented
You can reorder lanes within a section. You **cannot** drag sections
themselves to reorder them — sections appear in the order they were
created. To reorder, edit the round-tripped `.txt` proto manually.
:::

## Performance

The tree is virtualized via react-arborist (`overscanCount={10}`). Rendering
a 10k-entity tree adds about 50 ms per render (mostly the `buildTree`
memoized derivation). Subsequent renders that don't change the entity map
are cached by `useMemo`.

If you see jank when expanding a large group, the cause is usually the
inspector re-rendering on selection rather than the tree itself. Close the
Inspector to confirm.

## Where to next

- [Inspector](/guide/inspector) — selection feeds the right-side panel.
- [Topology and junctions](/guide/topology-and-junctions) — what
  reparenting does to predecessor/successor.
- [Architecture / EntityOps adapter](/architecture/entityops) — the
  `canReparent` rule table and `reparentEntity` semantics.
