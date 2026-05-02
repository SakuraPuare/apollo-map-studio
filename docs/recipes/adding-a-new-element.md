# Adding a New Map Element

End-to-end walkthrough for introducing a new Apollo map element type. The
running example is a hypothetical `tollGate` element — a polygon with a
`type` enum (`MANUAL`, `ETC`, `MIXED`) and a foreign key to its parent
junction.

The codebase is layered (`core → lib → store → hooks → components`).
When you add an element you must touch every layer in the same direction
the imports flow, otherwise the build will fail or the element will be
invisible to downstream consumers.

::: warning Layer-import order
Imports flow downward only. `core/` cannot import from `lib/`, `lib/`
cannot import from `store/`, etc. See
[/architecture/overview](../architecture/overview.md) for the
enforcement matrix. Adding the element from the top down (component
first) will break the build.
:::

## Preconditions

- You know what the element looks like in the Apollo proto. If you're
  adding a brand new field that has no proto, write a `.proto` first
  under `src/proto/map_msgs/` and regenerate the bundled types.
- You have a clean `pnpm typecheck` baseline. Adding an element creates
  cross-cutting type changes; starting from an already-broken tree
  makes diagnosing failures much harder.
- You've decided whether the element belongs under a parent (lane,
  road, junction) or floats at the top of the layer tree.

## Step 1 — Define or extend the proto

Apollo `.proto` definitions live in `src/proto/map_msgs/`. Existing
files for reference:

```text
src/proto/map_msgs/
  map.proto                # the root Map message
  map_lane.proto
  map_junction.proto
  map_pnc_junction.proto
  map_signal.proto
  map_stop_sign.proto
  map_yield_sign.proto
  map_speed_bump.proto
  map_clear_area.proto
  map_crosswalk.proto
  map_parking_space.proto
  map_barrier_gate.proto
  map_rsu.proto
  map_area.proto
  …
```

For our `tollGate` example, create `src/proto/map_msgs/map_toll_gate.proto`
and add it to `map.proto`'s top-level `Map` message as
`repeated TollGate toll_gate = N;`.

Do **not** edit the generated runtime under `src/io/proto/` by hand —
those are produced by the proto loader and rebuilt on each Vite run.

## Step 2 — TypeScript entity type

Open `src/types/apollo.ts` and add the entity-side type. Mirror Apollo's
proto2 optional semantics (`type?: …`) where the proto field uses
`optional`. Always include:

- An `id: string`
- A discriminator `entityType: 'tollGate'` (literal-typed so unions
  narrow correctly)
- Foreign-key fields as `string | null` (use `null`, not `undefined`,
  for explicit "no parent" — this keeps cascade-delete logic uniform)
- An `overlapIds: string[]` if the element participates in overlap
  derivation

```ts
// src/types/apollo.ts
export interface TollGateEntity {
  id: string;
  entityType: 'tollGate';
  type: TollGateType;
  polygon: ApolloPolygon;
  junctionId: string | null;
  overlapIds: string[];
}

export type TollGateType = 'MANUAL' | 'ETC' | 'MIXED';
```

Then surface it in `src/types/entities.ts` so downstream code only
imports from one location:

```ts
// src/types/entities.ts
export type {
  // … existing exports …
  TollGateEntity,
  TollGateType,
} from './apollo';
```

`MapEntity` is already a discriminated union of `DrawingEntity |
ApolloEntity`. Since `TollGateEntity` is part of `ApolloEntity` (define
it on the union in `apollo.ts`), no change to `MapEntity` itself is
needed — but verify the union by running `pnpm typecheck` immediately.

## Step 3 — Zod schema

`src/lib/schemas.ts` is the source of truth for inspector form validation.
Add the enum option list and the schema:

```ts
// src/lib/schemas.ts
export const tollGateTypeOptions = ['MANUAL', 'ETC', 'MIXED'] as const;

export const tollGateSchema = z.object({
  type: z.enum(tollGateTypeOptions),
});

export type TollGateFormValues = z.infer<typeof tollGateSchema>;
```

Keep the schema small — it only validates user-editable fields, not
geometry. Geometry is edited on the canvas, not the inspector.

## Step 4 — Entity ops

`src/lib/entityOps.ts` is the anti-corruption boundary between the
proto layer and the UI. UI code never imports from
`@/core/geometry/apolloCompile` — only from `@/lib/entityOps`. Anything
proto-shaped goes through here.

The folder is split by concern:

```text
src/lib/entityOps/
  cascadeDeleteRefs.ts   # patch references when ids are removed
  edit.ts                # createEntity / moveEntity / setEditPoint / …
  reparent.ts            # canReparent / reparent
  typeGuards.ts          # isAreaEntity / isPolygonEditEntity / …
```

### 4a. `typeGuards.ts`

If your element is polygon-edited (vertices addressable by index), add
it to `isPolygonEditEntity`. If it counts as an "area" element (filled
polygon overlay), add it to `isAreaEntity`. Add to
`isApolloEntityType`:

```ts
// src/lib/entityOps/typeGuards.ts
export function isApolloEntityType(t: string): t is ApolloEntityType {
  return (
    // … existing types …
    t === 'tollGate'
  );
}
```

### 4b. `cascadeDeleteRefs.ts`

If your element references other ids (junction, overlap, lane, …),
extend `patchOne` so that deleting one of those upstream entities
strips the dangling reference instead of leaving it broken:

```ts
// src/lib/entityOps/cascadeDeleteRefs.ts
case 'tollGate': {
  const t = next as TollGateEntity;
  if (t.junctionId && removed.has(t.junctionId)) {
    next = { ...t, junctionId: null };
  }
  break;
}
```

`overlapIds` is already handled wholesale by `stripOverlapIds`, so
nothing extra is needed for that field.

### 4c. `reparent.ts`

If users can drag the element under a different parent in the layer
tree, extend `canReparent` and `reparent` to know about your new
parent target shape. If it lives only at the top level, no change is
needed.

### 4d. `edit.ts`

Extend `createEntity` so the FSM commit path (see Step 8) can
materialise an instance from `{ element, state, points, anchors }`. For
polygon elements this is usually a single new branch:

```ts
// src/lib/entityOps/edit.ts
if (element === 'tollGate') {
  return {
    id: nextEntityId('tollGate', entities),
    entityType: 'tollGate',
    type: 'MANUAL',
    polygon: { points: coordsToPoints(points) },
    junctionId: null,
    overlapIds: [],
  };
}
```

If you want to support per-vertex editing, also extend `getEditPoints`,
`setEditPoint`, `setAllEditPoints`, and `deleteVertex`.

## Step 5 — Wire the proto bridge

The proto round-trip lives under `src/io/proto/`. Two halves:

- `entityBridge` (or equivalent — the file names may have evolved):
  proto-message → entity, entity → proto-message.
- `apolloIO.worker.ts`: uses the bridge inside the import/export worker.

Open the file that maps Apollo proto messages to entities (search for
`entityType: 'lane'` to find the existing converter) and add a
`tollGate` branch in **both** directions. Round-trip test fixtures
live under `src/io/__fixtures__/apollo/` — drop a small map containing
your new element there and assert that
`importApolloMap(fixture)` and `exportApolloMap(entities)` are
idempotent.

::: warning ACL audit
Run this grep before merging — anything that imports
`apolloCompile` from outside `lib/entityOps` is a leak that bypasses
the anti-corruption layer:

```sh
git grep "from '@/core/geometry/apolloCompile'" \
  -- 'src/components/**' 'src/hooks/**'
```

A non-empty result fails review. Route the access through a new helper
in `entityOps` instead.
:::

## Step 6 — Inspector form

`src/components/layout/panels/InspectorForms/` holds one file per
"shape" of form. The two split-out modules are `lane.tsx`,
`overlap.tsx`, and `pncJunction.tsx` (their forms are large enough
to warrant their own file). Everything else lives in `simpleForms.tsx`.

For our `tollGate` example, add a `TollGateForm` to `simpleForms.tsx`
following the same pattern as `JunctionForm` / `BarrierGateForm`:

```tsx
// src/components/layout/panels/InspectorForms/simpleForms.tsx
import { tollGateSchema, tollGateTypeOptions, type TollGateFormValues } from '@/lib/schemas';
import type { TollGateEntity } from '@/types/apollo';
import { zodResolverZ4 } from './resolver';

export function TollGateForm({ entity }: { entity: TollGateEntity }) {
  const updateEntity = useMapStore((s) => s.updateEntity);
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<TollGateFormValues>({
    resolver: zodResolverZ4<TollGateFormValues>(tollGateSchema),
    mode: 'onChange',
    defaultValues: { type: entity.type },
  });

  // ... reset/sync useEffects (mirror JunctionForm) ...

  useEffect(() => {
    const sub = methods.watch((value) => {
      const live = entityRef.current;
      if (value.type === live.type) return;
      updateEntity(live.id, { ...live, type: value.type! });
    });
    return () => sub.unsubscribe();
  }, [methods, updateEntity]);

  return (
    <FormProvider {...methods}>
      <form>
        <Section title="Attributes">
          <Value label="ID" value={entity.id} />
          <Select
            name="type"
            label="Type"
            options={tollGateTypeOptions}
            enumCategory="tollGateType"
          />
          <Value label="Junction" value={entity.junctionId ?? '—'} />
          <Value label="Overlaps" value={entity.overlapIds.length || '—'} />
        </Section>
      </form>
    </FormProvider>
  );
}
```

Wire it into the dispatcher in `src/components/layout/panels/InspectorForms.tsx`:

```tsx
case 'tollGate':
  return <TollGateForm entity={entity as TollGateEntity} />;
```

Add `tollGateType` to `src/lib/enumLabels.ts` so the `Select` displays
human-readable labels.

## Step 7 — Layer tree

`src/components/layout/panels/LayerTree/treeBuilder.ts` builds the
hierarchical view. Two sub-files matter:

- `constants.ts` — `TOP_LEVEL_ORDER` and `TYPE_LABELS`
- `treeBuilder.ts` — `buildTree` walks `mapStore.entities` and groups them

Add `'tollGate'` to `TOP_LEVEL_ORDER` (in display order — usually after
`area` for ground-truth elements) and `TYPE_LABELS['tollGate'] =
'Toll Gates'`.

If toll gates can nest under junctions, mirror the lane pattern in
`buildTree`:

```ts
if (e.entityType === 'tollGate') {
  const t = e as TollGateEntity;
  if (t.junctionId && junctions.has(t.junctionId)) {
    ensureJunction(t.junctionId).push(baseNode({}));
    continue;
  }
  ensureGroup('tollGate').push(baseNode({}));
  continue;
}
```

## Step 8 — Action and drawing tool

The action registry is the **only** place to register new menu items,
shortcuts, palette entries, and tool-strip entries. Edit
`src/core/actions/registry/types.ts`:

```ts
export type ActionId =
  | // … existing ids …
  | 'tool:drawTollGate';
```

Then add the `ActionDef` to `src/core/actions/registry/definitions.ts`:

```ts
{
  id: 'tool:drawTollGate',
  label: 'Draw Toll Gate',
  category: 'tool',
  shortcut: 'T',
  keybinding: { key: 't' },
  icon: FaRoadBarrier,         // or any react-icon
  inCommandPalette: true,
  drawTool: 'drawPolygon',     // reuse polygon FSM state
},
```

The `drawTool` field tells `useActionDispatcher` to fire
`SELECT_TOOL` to the FSM. If your element needs a brand-new draw state
(neither polygon nor polyline fits), follow
[adding-a-new-drawing-tool](./adding-a-new-drawing-tool.md) instead of
reusing an existing one.

The `MapElementType` union in `src/core/elements.ts` also needs the new
member so `useDrawCommit.commitEntity` knows what to construct. Wire
the action's element argument through the tool-select flow.

## Step 9 — Map icon

If your element renders as a glyph on the map (signal, stop sign,
parking…), register it in `src/lib/mapIcons.ts`:

```ts
import { FaSquareTollBooth } from 'react-icons/fa6';

const REGISTRY: Record<string, ComponentType<IconProps>> = {
  // … existing icons …
  'icon-toll-gate': FaSquareTollBooth,
};
```

Reference the icon id (`icon-toll-gate`) in your GeoJSON `icon`
property when compiling the spatial worker output. Polygon-only
elements can skip this step.

## Step 10 — Tests

Write a thin slice of tests at each layer that has new code. Convention:
test file lives next to the module under `__tests__/`.

| Layer        | Test file                                                               |
| ------------ | ----------------------------------------------------------------------- |
| Schema       | `src/lib/__tests__/schemas.test.ts`                                     |
| Entity ops   | `src/lib/entityOps/__tests__/cascadeDeleteRefs.test.ts`, `edit.test.ts` |
| Type guards  | `src/lib/entityOps/__tests__/typeGuards.test.ts`                        |
| Proto bridge | `src/io/__tests__/entityBridge.test.ts` (round-trip a fixture)          |
| Inspector    | `src/components/layout/panels/__tests__/InspectorForms.test.tsx`        |
| Action       | `src/core/actions/__tests__/registry.test.ts`                           |

Minimum bar:

- A `tollGateSchema.parse({ type: 'MANUAL' })` happy path and one
  invalid-input rejection.
- A cascade-delete test: delete a junction, assert the toll gate's
  `junctionId` becomes `null`.
- A round-trip test: import a fixture containing a toll gate, export,
  re-parse, deep-equal.
- An inspector test: render `<TollGateForm entity={…} />`, change
  `type`, assert `updateEntity` was called with the new value.

## Verification checklist

1. `pnpm typecheck` — all unions narrow.
2. `pnpm lint` — no ACL leaks, no `as unknown as X`.
3. `pnpm test` — the new tests pass and existing tests still pass.
4. `pnpm dev` — manually:
   - Press the new shortcut, draw a toll gate.
   - Open Inspector, change `type`, observe canvas update.
   - Drag it under a junction in the layer tree.
   - Delete the junction, observe `junctionId` cleared.
   - Export `.bin`, re-import, observe round-trip.
5. `pnpm bench` — no new perf regression.

## Cross-references

- [/architecture/overview](../architecture/overview.md) — layer-import rules
- [/architecture/state-management](../architecture/state-management.md) — entity store + undo
- [adding-a-new-action](./adding-a-new-action.md) — registry shape detail
- [adding-a-new-drawing-tool](./adding-a-new-drawing-tool.md) — FSM extension
- [Types / inspectorSchema](/api/types/inspector-schema) — form patterns
