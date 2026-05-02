# Inspector

The Inspector is the right-side panel that shows the selected entity's
properties. It uses a **schema-driven** form for the Lane (the migration
pilot) and bespoke forms for every other entity type. This page covers the
field-level semantics, the validation pipeline, and the user-override
system that protects manual edits from auto-derivation.

## Source map

| Concern                                      | File                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| Schema definition pattern                    | `src/types/inspectorSchema.ts`                                |
| Lane form (schema-driven)                    | `src/components/layout/panels/InspectorForms/lane.tsx`        |
| Junction / Parking / Signal / StopSign forms | `src/components/layout/panels/InspectorForms/simpleForms.tsx` |
| PNC junction form                            | `src/components/layout/panels/InspectorForms/pncJunction.tsx` |
| Overlap form (read-only)                     | `src/components/layout/panels/InspectorForms/overlap.tsx`     |
| Drawing-primitive form                       | `src/components/layout/panels/InspectorForms/DrawingForm.tsx` |
| Generic schema renderer                      | `src/components/layout/panels/SchemaForm.tsx`                 |
| Form-resolver router                         | `src/components/layout/panels/InspectorForms/resolver.tsx`    |
| Zod schemas                                  | `src/lib/schemas.ts`                                          |
| Enum label dictionary                        | `src/lib/enumLabels.ts`                                       |
| Derive-rule engine                           | `src/core/elements/derive/`                                   |

## What you see when you select an entity

The resolver in `InspectorForms/resolver.tsx` dispatches by `entityType`:

| Selected entity                                                   | Form                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `lane`                                                            | LaneForm (schema-driven via `LaneInspectorSchema`) |
| `junction`                                                        | JunctionForm (`simpleForms.tsx`)                   |
| `pncJunction`                                                     | PNCJunctionForm                                    |
| `parkingSpace`                                                    | ParkingForm (`simpleForms.tsx`)                    |
| `signal`                                                          | SignalForm (`simpleForms.tsx`)                     |
| `stopSign`                                                        | StopSignForm (`simpleForms.tsx`)                   |
| `overlap`                                                         | OverlapForm (read-only)                            |
| `polyline` / `bezier` / `arc` / `rect` / `polygon` / `catmullRom` | DrawingForm                                        |
| Other Apollo types                                                | Read-only id + entityType (no form yet)            |

Multi-select renders nothing — by design. Bulk edits are not supported in
1.0; use scripts that read the round-tripped `.txt` proto instead.

## Schema-driven Lane form

The Lane form is built from **data**, not JSX. Its schema lives in
`src/types/inspectorSchema.ts:263`:

```ts
export const LaneInspectorSchema: EntitySchema<LaneEntity, LaneFormValues> = {
  id: 'lane',
  validation: laneSchema,
  sectionOrder: ['Attributes', 'Boundaries', 'Topology'],
  fields: [
    LaneField.field({ kind: 'enum', name: 'type', section: 'Attributes', … }),
    LaneField.field({ kind: 'enum', name: 'turn', section: 'Attributes', … }),
    LaneField.field({ kind: 'enum', name: 'direction', section: 'Attributes', … }),
    LaneField.field({ kind: 'number', name: 'speedLimit', section: 'Attributes', … }),
    LaneField.field({ kind: 'number', name: 'leftWidth', section: 'Boundaries', … }),
    LaneField.field({ kind: 'number', name: 'rightWidth', section: 'Boundaries', … }),
    LaneField.field({ kind: 'enum', name: 'leftBoundaryType', section: 'Boundaries', … }),
    LaneField.field({ kind: 'enum', name: 'rightBoundaryType', section: 'Boundaries', … }),
  ],
  readonly: [/* ID, Length, Virtual flags, Junction, Predecessors, … */],
};
```

`SchemaForm` (in `panels/SchemaForm.tsx`) reads this schema and renders the
form generically. There is no per-entity-type JSX for Lane.

### Editable fields

All eight Lane editables, with their adapter logic:

| Field             | Kind   | Backing entity field(s)                      | Notes                                                                                              |
| ----------------- | ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Type              | enum   | `lane.type: LaneType`                        | `CITY_DRIVING`, `BIKING`, `SIDEWALK`, `PARKING`, `SHOULDER`, `SHARED`, `NONE`                      |
| Turn              | enum   | `lane.turn: LaneTurn`                        | `NO_TURN`, `LEFT_TURN`, `RIGHT_TURN`, `U_TURN`                                                     |
| Direction         | enum   | `lane.direction: LaneDirection`              | `FORWARD`, `BACKWARD`, `BIDIRECTION`                                                               |
| Speed Limit (m/s) | number | `lane.speedLimit ?? 0`                       | Range 0–50, step 0.5                                                                               |
| Left Width (m)    | number | `lane.leftSamples[*].width` (uniform)        | Range 0.5–10, step 0.1 — **applies to every sample**                                               |
| Right Width (m)   | number | `lane.rightSamples[*].width` (uniform)       | Same                                                                                               |
| L Boundary        | enum   | `lane.leftBoundary.boundaryType[0].types[0]` | `UNKNOWN`, `DOTTED_YELLOW`, `DOTTED_WHITE`, `SOLID_YELLOW`, `SOLID_WHITE`, `DOUBLE_YELLOW`, `CURB` |
| R Boundary        | enum   | same as L                                    |                                                                                                    |

::: warning Width adapters are not naive
Setting `Left Width = 1.75` does **not** write `lane.leftWidth = 1.75` — there
is no such field. The adapter (`writeLeftWidth` in `inspectorSchema.ts:232`)
maps every existing `LaneSampleAssociation` in `leftSamples` to use the new
width. If `leftSamples` is empty, it seeds two anchors at `s=0` and
`s=length`. This is the kind of structural translation the schema's
`read`/`write` adapters exist to express.
:::

### Read-only fields

| Field                     | Source                                                          |
| ------------------------- | --------------------------------------------------------------- |
| ID                        | `entity.id`                                                     |
| Length                    | `entity.length` (rounded to 0.01 m)                             |
| L / R Virtual             | `entity.leftBoundary.virtual`, `rightBoundary.virtual`          |
| Junction                  | `entity.junctionId` (clickable LaneRef)                         |
| Predecessors / Successors | `entity.predecessorIds`, `successorIds` (clickable LaneRefList) |
| L / R Neighbors (fwd/rev) | `entity.{left,right}Neighbor{Forward,Reverse}Ids`               |
| Self-Reverse              | `entity.selfReverseLaneIds`                                     |
| Overlaps                  | `entity.overlapIds`                                             |

Topology fields are clickable: clicking a lane id selects that lane. Clicking
a Junction id selects the junction. The clickable links use `LaneRef` /
`LaneRefList` from `panels/LaneRefList.tsx`.

::: tip Length is computed, not stored
`entity.length` is recomputed by the derive engine on every geometry edit.
Don't try to set it — it would be overwritten on the next centerline change.
:::

## Validation pipeline

Source: `src/lib/schemas.ts` + react-hook-form's zod resolver.

```
┌──────────────┐   onChange    ┌──────────────────┐    parse     ┌──────────────┐
│  <input>     │ ───────────▶  │  RHF form state  │ ──────────▶  │  zod schema  │
└──────────────┘               └──────────────────┘   reject     └──────────────┘
                                       │ valid? Yes
                                       ▼
                       ┌──────────────────────────────┐
                       │  applyFormValuesToEntity     │
                       │  (write adapters per field)  │
                       └──────────────────────────────┘
                                       │
                                       ▼
                                useMapStore.updateEntity
```

`laneSchema` (in `lib/schemas.ts`) defines the per-field constraints (number
ranges, enum membership). React-hook-form's `resolver: zodResolver(laneSchema)`
runs the parse on every change. Invalid values block the write — the field
shows a red border and an error message, but the entity is unchanged.

::: warning onChange validation gate
The fix in commit `6a83d9d` ensures the resolver runs on `onChange`, not
just `onSubmit`. Without this, an invalid value would silently round-trip
through the `useEffect` watch and corrupt the entity. The
`shouldPersistForm` helper in `inspectorSchema.ts:484` is the diff gate
that breaks the store→reset→watch→update loop.
:::

## User overrides

A core concept: when you manually set Left Width, the editor should
**remember that you set it manually**. Subsequent geometry edits — dragging
the centerline, recomputing topology, re-stitching boundaries — should not
clobber your manual value.

This is implemented via `_userOverrides` on the entity:

```ts
applyFormValuesToEntity(schema, entity, values)
  ─▶ for each field in values where prevValue !== newValue:
       overridesPaths = field.overridesPaths ?? [field.name]
       for path in overridesPaths:
         next = markUserOverride(next, path)
```

The derive engine (`src/core/elements/derive/`) checks `_userOverrides`
before recomputing each field. If `leftWidth` is in the override set, the
auto-derive skips that path on the next geometry edit.

::: tip Default override set is `[fieldName]`
If you don't set `overridesPaths` in the field def, the override path is
the field's `name`. That works for simple cases. Set
`overridesPaths: ['leftSamples']` if the form field maps to a deeper entity
path.
:::

::: warning Resetting overrides
There is no UI to clear `_userOverrides` today. To regain auto-derivation
for a field, edit the entity in a way that flips the value back to what
the auto-derive would produce, or manually delete `_userOverrides[<field>]`
in dev tools. A future "Reset to derived" button is on the roadmap.
:::

## Bespoke forms (Junction / Signal / etc.)

These follow the older pattern: a per-entity React component that wires
react-hook-form directly. Each is scheduled for migration to a schema, but
behavior parity is the priority — when the migration lands, the JSX is
deleted and replaced by a schema constant.

The current set of bespoke forms covers:

| Form         | Editable fields                                                 |
| ------------ | --------------------------------------------------------------- |
| Junction     | `type` (`OPEN`, `INTERSECTION`, `DEAD_END`)                     |
| ParkingSpace | `heading` (radians), parking-style flags                        |
| Signal       | `type` (`UNKNOWN`, `MIX_2_HORIZONTAL`, …), `subSignals[*].type` |
| StopSign     | `type` (`UNKNOWN`, `ONE_WAY`, …)                                |
| PNCJunction  | `type`, `passageGroup` info                                     |
| Overlap      | none — read-only enumeration of cross-references                |

For Apollo types not yet covered (`speedBump`, `yieldSign`, `clearArea`,
`barrierGate`, `area`, `rsu`), the inspector currently shows just the id
and entity type. Edit those entities by importing/exporting the `.txt`
proto for now.

## DrawingForm

Source: `panels/InspectorForms/DrawingForm.tsx`

For the six geometric primitives (`polyline`, `catmullRom`, `bezier`,
`arc`, `rect`, `polygon`), the inspector shows id, type, and basic
geometric stats (number of points / anchors, bounding box). No editable
fields — geometry is edited on the canvas via [drag and snap](/guide/editing-and-snapping).

The intent is that drawing primitives are scratch geometry; you'd
typically convert them to an Apollo type (manually copying coordinates
into a Lane / Junction / Crosswalk draw flow) before exporting.

## Sectioning

Each `EntitySchema` has a `sectionOrder: string[]`. Fields with a `section`
matching one of these strings are grouped under that header. Fields whose
section isn't listed render after, in declaration order. The Lane schema
uses three sections:

```
[Attributes]
  Type, Turn, Direction, Speed Limit, ID

[Boundaries]
  Left Width, Right Width, L Boundary, R Boundary,
  Length, L Virtual, R Virtual

[Topology]
  Junction, Predecessors, Successors,
  L/R Neighbors (fwd/rev), Self-Reverse, Overlaps
```

Section headers render as small uppercase mono text (the same
`text-[10px] uppercase tracking-widest text-zinc-500` pattern used
elsewhere in the editor).

## Adding a field to the Lane form

1. Add the form-side type to `LaneFormValues` in `src/lib/schemas.ts`.
2. Add the zod constraint to `laneSchema` so the resolver enforces it.
3. Open `src/types/inspectorSchema.ts:267` and append a `LaneField.field({…})`
   call to `LaneInspectorSchema.fields`.
4. Provide `read` (entity → form value) and `write` (form value → next
   entity) adapters. If the form field doesn't map 1:1, set
   `overridesPaths` to the entity-path strings the field "owns".
5. Done. SchemaForm picks it up; tests in `inspectorSchema.test.ts` and
   the Lane form's own tests will fail loudly if you missed a field.

## Where to next

- [Layer tree](/guide/layer-tree) — selection feeds the Inspector.
- [Map elements](/guide/map-elements) — full enumeration of every entity
  type.
- [Architecture / Schema-driven inspector](/architecture/inspector-schema)
  — design rationale and migration status.
- [Architecture / Derive engine](/architecture/derive-engine) — how
  `_userOverrides` interact with auto-derived values.
