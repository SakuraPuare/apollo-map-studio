# Inspector System

The right-hand inspector panel renders a form-per-entity-type. The forms are
schema-driven — each entity type has a `zod` schema that doubles as form
type and runtime validator — and each inspector subform binds to a slice of
the underlying `MapEntity` via `react-hook-form`.

## Files

```
src/components/layout/panels/InspectorForms.tsx        ← entity type → form switch
src/components/layout/panels/InspectorForms/
  ├── DrawingForm.tsx          ← polyline / catmullRom / bezier / arc / rect / polygon
  ├── lane.tsx                 ← LaneForm (most complex)
  ├── overlap.tsx              ← OverlapForm
  ├── pncJunction.tsx          ← PNCJunctionForm
  ├── resolver.ts              ← shared zodResolver + form helpers
  └── simpleForms.tsx          ← AreaForm, JunctionForm, SignalForm, ...

src/lib/schemas.ts             ← zod source of truth for all form values
src/types/entities.ts          ← MapEntity discriminated union
src/types/inspectorSchema.ts   ← schema-driven form descriptor types
```

## Discriminated union dispatch

`InspectorForms.tsx:45-80` is the entry point — a single switch on
`entity.entityType`:

```tsx
export function EntityForm({ entity }: { entity: MapEntity }) {
  switch (entity.entityType) {
    case 'lane':
      return <LaneForm entity={entity as LaneEntity} />;
    case 'junction':
      return <JunctionForm entity={entity as JunctionEntity} />;
    case 'parkingSpace':
      return <ParkingSpaceForm entity={entity as ParkingSpaceEntity} />;
    case 'signal':
      return <SignalForm entity={entity as SignalEntity} />;
    case 'stopSign':
      return <StopSignForm entity={entity as StopSignEntity} />;
    case 'road':
      return <RoadForm entity={entity as RoadEntity} />;
    case 'pncJunction':
      return <PNCJunctionForm entity={entity as PNCJunctionEntity} />;
    case 'overlap':
      return <OverlapForm entity={entity as OverlapEntity} />;
    case 'area':
      return <AreaForm entity={entity as AreaEntity} />;
    case 'barrierGate':
      return <BarrierGateForm entity={entity as BarrierGateEntity} />;
    case 'crosswalk':
      return <CrosswalkForm entity={entity as CrosswalkEntity} />;
    case 'speedBump':
      return <SpeedBumpForm entity={entity as SpeedBumpEntity} />;
    case 'yieldSign':
      return <YieldSignForm entity={entity as YieldSignEntity} />;
    case 'clearArea':
      return <ClearAreaForm entity={entity as ClearAreaEntity} />;
    case 'rsu':
      return <RSUForm entity={entity as RSUEntity} />;
    default:
      return <DrawingForm entity={entity} />;
  }
}
```

The `default` branch covers the six basic drawing entity types (polyline,
catmullRom, bezier, arc, rect, polygon) which share a single render path.

## zod schemas as source of truth

Every form value type is derived from a zod schema. `src/lib/schemas.ts`
declares them:

```ts
// src/lib/schemas.ts:37-46
export const laneSchema = z.object({
  type: z.enum(laneTypeOptions),
  turn: z.enum(laneTurnOptions),
  direction: z.enum(laneDirectionOptions),
  speedLimit: z.number().min(0).max(50),
  leftWidth: z.number().min(0.5).max(10).optional(),
  rightWidth: z.number().min(0.5).max(10).optional(),
  leftBoundaryType: z.enum(boundaryTypeOptions),
  rightBoundaryType: z.enum(boundaryTypeOptions),
});
export type LaneFormValues = z.infer<typeof laneSchema>;
```

The schema is used three places:

1. **Form type** — `LaneFormValues = z.infer<typeof laneSchema>` is what
   `react-hook-form` sees.
2. **Resolver** — `zodResolver(laneSchema)` validates on every change.
3. **UI hints** — `laneSchema.shape.speedLimit` exposes the min/max so the
   slider can read its bounds without restating them.

::: tip One schema → three uses
Without a schema, you'd repeat the speed-limit range three times: in the
TypeScript type, in the validator, in the slider's `min`/`max` props.
With it, the schema is the single bound; the form, the validator, and the UI
all refer back.
:::

## Available schemas

| Entity       | Schema               | Form file         |
| ------------ | -------------------- | ----------------- |
| Lane         | `laneSchema`         | `lane.tsx`        |
| Junction     | `junctionSchema`     | `simpleForms.tsx` |
| ParkingSpace | `parkingSpaceSchema` | `simpleForms.tsx` |
| Signal       | `signalSchema`       | `simpleForms.tsx` |
| StopSign     | `stopSignSchema`     | `simpleForms.tsx` |
| Road         | `roadSchema`         | `simpleForms.tsx` |
| Area         | `areaSchema`         | `simpleForms.tsx` |
| BarrierGate  | `barrierGateSchema`  | `simpleForms.tsx` |
| Overlap      | (custom)             | `overlap.tsx`     |
| PNCJunction  | (custom)             | `pncJunction.tsx` |

The custom forms (`overlap`, `pncJunction`) have nested data shapes that
don't fit a flat zod object — they use react-hook-form's `useFieldArray`
for the nested arrays directly.

## react-hook-form integration

Each form follows the same pattern:

```tsx
// LaneForm (abridged)
function LaneForm({ entity }: { entity: LaneEntity }) {
  const form = useForm<LaneFormValues>({
    resolver: zodResolver(laneSchema),
    defaultValues: laneFormValuesFromEntity(entity),
  });

  // 1. Sync defaults when entity changes (e.g. user selects different lane)
  useEffect(() => { form.reset(laneFormValuesFromEntity(entity)); }, [entity.id]);

  // 2. Watch all values and write back to the store
  const values = form.watch();
  useEffect(() => {
    if (!shouldPersistLaneForm(form, values)) return;
    const next = applyLaneFormToEntity(entity, values);
    if (next !== entity) useMapStore.getState().updateEntity(entity.id, next);
  }, [values, entity]);

  return (
    <Form {...form}>
      <FormField name="type" ... />
      <FormField name="turn" ... />
      <SpeedLimitSlider ... />
      <BoundaryPicker side="left" ... />
      <BoundaryPicker side="right" ... />
    </Form>
  );
}
```

The exported helpers `laneFormValuesFromEntity`, `shouldPersistLaneForm`,
and `diffLaneFormAgainstEntity` (re-exported from
`InspectorForms.tsx:39-44`) keep the entity → form → entity round-trip
deterministic and idempotent.

::: warning Identity guard prevents render storms
`shouldPersistLaneForm` short-circuits when the form values would produce an
identical entity. Without this, the form's `watch` callback fires on every
keystroke, the store sees a new entity object every time, and the cold layer
worker re-decorates every keystroke. The guard collapses unchanged updates
into no-ops.
:::

## Lane subform — most complex

`LaneForm` is the largest because lanes have:

- 8 scalar fields (type, turn, direction, speedLimit, left/right width, both
  boundary types).
- A nested boundary array (each boundary has multiple segments with
  `boundaryType` per segment, currently flattened to "left/right type" in
  the form).
- Computed read-only fields (length, derived junction id) shown as a
  read-only data card.
- Topology buttons (Connect Predecessor, Connect Successor) that route
  through `useUIStore.getState().toggleConnectMode()`.

The form's persisted shape is `LaneFormValues` (`schemas.ts:48`). The
non-persisted "lane id" / "junction id" / "length" cards are rendered by a
sibling read-only component, not by the form.

## Overlap subform

Overlaps are derived (see [Overlap Derivation](./overlap-derivation.md)). The
form is mostly read-only: it shows participant ids, the overlap region, and
per-pair `isMerge` flags.

The one editable affordance — `isMerge` per object pair — is "pinned" via
the `_userOverrides` mechanism so subsequent geometric reconciles preserve
the user's override (see `src/core/elements/overlap/overridePaths.ts`). The
form writes to `_userOverrides` rather than to `objects[i].laneOverlapInfo`
directly.

## PNCJunction subform

PNC junctions have a nested `passageGroup[].lane[]` structure. The form
uses `useFieldArray` to render each passage group as a collapsible card,
with drag-to-reorder for both the group and the lanes within. Reparenting
of nested lanes goes through `entityOps.reparent`.

## DrawingForm — the fallback

`DrawingForm.tsx` handles the six generic shapes — polyline, catmullRom,
bezier, arc, rect, polygon. These have no Apollo-side proto fields to bind
to; the form shows:

- Entity id (read-only, copyable).
- Vertex count (read-only).
- A "Convert to Lane" button that runs the entity through
  `entityOps.createEntity('lane', points)` and replaces the original.

::: info Drawing entities have no inspector schemas
There is no `polylineSchema` in `src/lib/schemas.ts`. Drawing entities are
geometric scaffolding, not user-tunable configuration; their fields don't
need form binding.
:::

## Adding a new entity type to the inspector

1. Add the new `entityType` discriminator to `MapEntity` in
   `src/types/entities.ts` (or to the Apollo union if it's an Apollo type).
2. Declare a zod schema in `src/lib/schemas.ts`.
3. Either add a new form file under `InspectorForms/` (for complex shapes)
   or extend `simpleForms.tsx` (for flat-scalar shapes).
4. Add the new case to the `EntityForm` switch in
   `InspectorForms.tsx:45-80`.

The form file pattern is mechanical:

```tsx
const formValuesFromEntity = (e: NewEntity): NewFormValues => ({ ... });
const applyFormToEntity = (e: NewEntity, v: NewFormValues): NewEntity => ({ ...e, ... });
const shouldPersist = (form, values) => {
  /* identity guard */
  return diffAgainstEntity(form, values, e).hasChanges;
};
```

## Cross-references

- [Anti-Corruption Layer](./anti-corruption-layer.md) — forms write back via
  `entityOps`, never via `apolloCompile` directly.
- [State Management](./state-management.md) — `mapStore.updateEntity` is
  the form's write target.
- [Action Registry](./action-registry.md) — connect-lanes mode is dispatched
  from inside lane forms.
- `/api/schemas` — auto-generated reference for every schema (other agents
  own that page).
