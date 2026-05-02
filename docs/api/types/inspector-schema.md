# `types/inspectorSchema`

> Source: [`src/types/inspectorSchema.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/src/types/inspectorSchema.ts)

Schema descriptors that let a single generic `<SchemaForm>` component
render any inspector panel. Lane is the pilot — Junction / Parking /
Signal / StopSign keep their bespoke React forms for now and migrate
opportunistically.

## Why a schema layer

Pre-refactor, `InspectorForms.tsx` hardcoded a separate React form per
entity type. Adding a field to a Lane meant editing five JSX files in
parallel; adding a new entity type meant cloning ~200 lines of JSX.

`inspectorSchema.ts` replaces that with a data model:

- **Adapter pattern, not field path.** Naive schema-driven libraries
  assume `entity[fieldName] = value`. That cannot express
  `leftWidth` (a uniform width across `leftSamples[]`) or
  `leftBoundaryType` (head element of a nested types array). Each
  `FieldDef` carries explicit `read` / `write` adapters.
- **Double-generic typing.** `EntitySchema<TEntity, TFormValues>` pins
  both the domain entity (`LaneEntity`) and the form-values type
  (`LaneFormValues`, the zod-inferred shape). `FieldDef.name` is
  constrained to `keyof TFormValues` so the compiler catches typos.
- **Validation gate preserved.** The `validation` field carries the
  zod schema that `SchemaForm` passes to `useForm`, keeping the
  onChange validation gate intact.

## `FieldDef` family

### `NumberFieldDef`

```ts
/** Numeric input rendered as `<Input type="number">`. */
export interface NumberFieldDef<
  TEntity extends MapEntity,
  TFormValues,
  TKey extends keyof TFormValues,
> {
  kind: 'number';
  name: TKey;
  label: string;
  section: string;
  min?: number;
  max?: number;
  step?: number;
  read: (entity: TEntity) => TFormValues[TKey];
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
  /**
   * Entity field paths this form field "owns". Tagged into
   * `_userOverrides` after a write so derive rules whose `owns`
   * overlap will skip on subsequent geometry edits. Defaults to
   * `[name]` when unset.
   */
  overridesPaths?: readonly string[];
}
```

### `EnumFieldDef`

```ts
/** Enumerated select rendered as `<Select>`. */
export interface EnumFieldDef<
  TEntity extends MapEntity,
  TFormValues,
  TKey extends keyof TFormValues,
> {
  kind: 'enum';
  name: TKey;
  label: string;
  section: string;
  options: readonly string[];
  /**
   * Display-label dictionary key. The Select shows
   * `getEnumLabel(enumCategory, value)` while keeping the raw enum
   * value on the wire — single hook for future i18n.
   */
  enumCategory?: EnumCategory;
  read: (entity: TEntity) => TFormValues[TKey];
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
  overridesPaths?: readonly string[];
}
```

### `FieldDef` union

```ts
export type FieldDef<
  TEntity extends MapEntity,
  TFormValues,
  TKey extends keyof TFormValues = keyof TFormValues,
> = NumberFieldDef<TEntity, TFormValues, TKey> | EnumFieldDef<TEntity, TFormValues, TKey>;
```

### `AnyFieldDef` distribution

```ts
/**
 * Distributes FieldDef over each key of TFormValues so the resulting
 * union narrows `name` ↔ `read`/`write` together. Without this, an
 * array literal like `[{name:'leftWidth', read:..., write:...}]`
 * widens the value type of `read` to the union of every possible
 * field type, defeating per-field type safety.
 */
export type AnyFieldDef<TEntity extends MapEntity, TFormValues> = {
  [K in keyof TFormValues]-?: FieldDef<TEntity, TFormValues, K>;
}[keyof TFormValues];
```

### `ReadOnlyDef`

```ts
/**
 * Read-only display row (no form binding, no validation). Renders as
 * `<Value>`. Used for derived/topology summaries like "Length" or
 * "Predecessors" that LaneForm previously hardcoded.
 */
export interface ReadOnlyDef<TEntity extends MapEntity> {
  kind: 'readonly';
  label: string;
  section: string;
  compute: (entity: TEntity) => React.ReactNode;
}
```

## `EntitySchema`

```ts
export interface EntitySchema<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
> {
  /**
   * Stable identifier; useful for keying React re-renders when the
   * panel switches between entity kinds (lane → junction → ...).
   */
  id: string;
  /** Editable form rows. */
  fields: ReadonlyArray<AnyFieldDef<TEntity, TFormValues>>;
  /** Read-only derived rows. */
  readonly: ReadonlyArray<ReadOnlyDef<TEntity>>;
  /** Zod validation schema (must produce TFormValues on parse). */
  validation: ZodType<TFormValues, TFormValues>;
  /** Section render order. */
  sectionOrder: ReadonlyArray<string>;
}
```

| Member         | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| `id`           | Stable React key when the panel switches entity kinds |
| `fields`       | Editable rows — backed by react-hook-form             |
| `readonly`     | Derived rows — display-only React nodes               |
| `validation`   | Zod schema fed to `useForm`'s resolver                |
| `sectionOrder` | Render order; unmentioned sections render last        |

## `fieldBuilder`

```ts
/**
 * Curried builder. The naive `defineField<TEntity, TFormValues>(...)`
 * shape forces the caller to also pass `TKey`, which TS cannot infer
 * from a single argument when two earlier generics are explicit. By
 * pinning `TEntity`/`TFormValues` once at the builder level, every
 * subsequent `.field({...})` call infers `TKey` from the `name`
 * literal — so each FieldDef stays per-key narrowed (read/write
 * signatures match the actual key) while the schema's `fields`
 * array stores the distributed-union form for generic iteration.
 *
 * Usage:
 *   const F = fieldBuilder<LaneEntity, LaneFormValues>();
 *   F.field({ kind: 'number', name: 'speedLimit', read, write, ... })
 */
export function fieldBuilder<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
>() {
  return {
    field<TKey extends keyof TFormValues>(
      def: FieldDef<TEntity, TFormValues, TKey>,
    ): FieldDef<TEntity, TFormValues, TKey> {
      return def;
    },
  };
}
```

## Lane adapters

Private to the module — public surface is the `LaneInspectorSchema`
constant. Pure functions, trivially testable, safe to call from React
effects.

```ts
/** Apply a uniform width across all sample points (seeds two anchors when empty). */
function applySampleWidth(
  samples: readonly LaneSampleAssociation[],
  width: number,
  totalLength: number,
): LaneSampleAssociation[] {
  if (samples.length === 0) {
    return [
      { s: 0, width },
      { s: Math.max(0, totalLength), width },
    ];
  }
  return samples.map((sample) => ({ s: sample.s, width }));
}

const readLeftWidth = (e: LaneEntity): number => e.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
const readRightWidth = (e: LaneEntity): number =>
  e.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
const readLeftBoundary = (e: LaneEntity): BoundaryLineType =>
  e.leftBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN';
const readRightBoundary = (e: LaneEntity): BoundaryLineType =>
  e.rightBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN';

const writeLeftWidth = (e: LaneEntity, width: number | undefined): LaneEntity => {
  const next = width ?? DEFAULT_LANE_HALF_WIDTH;
  return { ...e, leftSamples: applySampleWidth(e.leftSamples, next, e.length ?? 0) };
};
const writeRightWidth = (e: LaneEntity, width: number | undefined): LaneEntity => {
  const next = width ?? DEFAULT_LANE_HALF_WIDTH;
  return { ...e, rightSamples: applySampleWidth(e.rightSamples, next, e.length ?? 0) };
};
const writeLeftBoundary = (e: LaneEntity, type: BoundaryLineType): LaneEntity => ({
  ...e,
  leftBoundary: { ...e.leftBoundary, boundaryType: [{ s: 0, types: [type] }] },
});
const writeRightBoundary = (e: LaneEntity, type: BoundaryLineType): LaneEntity => ({
  ...e,
  rightBoundary: { ...e.rightBoundary, boundaryType: [{ s: 0, types: [type] }] },
});
```

`leftWidth` / `rightWidth` re-apply a uniform width across every
`LaneSampleAssociation` rather than mutating a single sample — Apollo
Lane width is encoded as a series of (s, width) samples, not a scalar.
Boundary writes only touch the head of `boundaryType`; downstream type
runs are preserved.

## `LaneInspectorSchema`

The eight editable fields mirror exactly what `LaneForm` rendered
before the refactor; the intent is behaviour parity with
JSX-per-entity duplication replaced by data.

### Editable rows

| Section    | Field               | Kind   | Range / options                                    |
| ---------- | ------------------- | ------ | -------------------------------------------------- |
| Attributes | `type`              | enum   | `laneTypeOptions`, category `'laneType'`           |
| Attributes | `turn`              | enum   | `laneTurnOptions`, category `'laneTurn'`           |
| Attributes | `direction`         | enum   | `laneDirectionOptions`, category `'laneDirection'` |
| Attributes | `speedLimit`        | number | min 0, max 50, step 0.5 (m/s)                      |
| Boundaries | `leftWidth`         | number | min 0.5, max 10, step 0.1 (m)                      |
| Boundaries | `rightWidth`        | number | min 0.5, max 10, step 0.1 (m)                      |
| Boundaries | `leftBoundaryType`  | enum   | `boundaryTypeOptions`, category `'boundaryType'`   |
| Boundaries | `rightBoundaryType` | enum   | `boundaryTypeOptions`, category `'boundaryType'`   |

### Read-only rows

| Section    | Label             | Compute                                           |
| ---------- | ----------------- | ------------------------------------------------- |
| Attributes | ID                | `e.id`                                            |
| Boundaries | Length            | `${(e.length ?? 0).toFixed(2)} m`                 |
| Boundaries | L Virtual         | `e.leftBoundary.virtual ? 'Yes' : 'No'`           |
| Boundaries | R Virtual         | `e.rightBoundary.virtual ? 'Yes' : 'No'`          |
| Topology   | Junction          | `<LaneRef id={e.junctionId} />`                   |
| Topology   | Predecessors      | `<LaneRefList ids={e.predecessorIds} />`          |
| Topology   | Successors        | `<LaneRefList ids={e.successorIds} />`            |
| Topology   | L Neighbors (fwd) | `<LaneRefList ids={e.leftNeighborForwardIds} />`  |
| Topology   | R Neighbors (fwd) | `<LaneRefList ids={e.rightNeighborForwardIds} />` |
| Topology   | L Neighbors (rev) | `<LaneRefList ids={e.leftNeighborReverseIds} />`  |
| Topology   | R Neighbors (rev) | `<LaneRefList ids={e.rightNeighborReverseIds} />` |
| Topology   | Self-Reverse      | `<LaneRefList ids={e.selfReverseLaneIds} />`      |
| Topology   | Overlaps          | `<LaneRefList ids={e.overlapIds} />`              |

```ts
export const LaneInspectorSchema: EntitySchema<LaneEntity, LaneFormValues> = {
  id: 'lane',
  validation: laneSchema,
  sectionOrder: ['Attributes', 'Boundaries', 'Topology'],
  fields: [
    /* … see source … */
  ],
  readonly: [
    /* … see source … */
  ],
};
```

The full literal lives in
[`src/types/inspectorSchema.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/src/types/inspectorSchema.ts).

## Schema-generic helpers

These three functions are the contract `<SchemaForm>` uses to drive
react-hook-form against any `EntitySchema`. They are exported so unit
tests can verify behaviour without rendering React.

### `formValuesFromEntity`

```ts
/**
 * Project an entity through the schema's `read` adapters into a
 * canonical form-values object. Mirrors the old
 * `laneFormValuesFromEntity` semantics, generalized.
 */
export function formValuesFromEntity<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
>(schema: EntitySchema<TEntity, TFormValues>, entity: TEntity): TFormValues;
```

Builds the canonical "what would the form show right now" object by
running each field's `read` adapter against the entity. Per-key type
safety is preserved at the FieldDef site; the loop body works through
the union value type.

### `diffFormAgainstEntity`

```ts
/**
 * Compute the (fieldName, nextValue) pairs where the form-side value
 * has drifted from what the entity would produce. Empty array means
 * the form is already in sync (the dedupe gate that breaks the
 * store→reset→watch→updateEntity loop).
 */
export function diffFormAgainstEntity<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
>(
  schema: EntitySchema<TEntity, TFormValues>,
  current: Partial<TFormValues>,
  entity: TEntity,
): Array<[keyof TFormValues, TFormValues[keyof TFormValues]]>;
```

Empty array → form is already in sync with the store. Non-empty array
→ each entry is a `[fieldKey, desiredValue]` pair that the controller
should `setValue()` into the form. This is the dedupe gate that
breaks the `store → reset → watch → updateEntity` infinite loop.

### `shouldPersistForm`

```ts
/** True iff at least one field differs — gate for `updateEntity`. */
export function shouldPersistForm<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
>(
  schema: EntitySchema<TEntity, TFormValues>,
  formValues: Partial<TFormValues>,
  entity: TEntity,
): boolean;
```

Companion gate on the persist side: skip the store write if the form
hasn't actually drifted.

### `applyFormValuesToEntity`

```ts
/**
 * Apply every form value through the schema's `write` adapters,
 * folding them into a single updated entity. For each field whose
 * value differs from the previous entity reading, the field's
 * `overridesPaths` (default: `[name]`) are tagged into
 * `_userOverrides` — derive rules whose `owns` intersect that set
 * are skipped on subsequent geometry edits, so manual values are
 * not clobbered by auto-recomputation.
 *
 * Order: writes apply left-to-right; override tagging is appended
 * after each write so the next field sees the updated entity.
 */
export function applyFormValuesToEntity<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
>(
  schema: EntitySchema<TEntity, TFormValues>,
  entity: TEntity,
  values: Partial<TFormValues>,
): TEntity;
```

The override-tagging logic ensures that **redundant writes do not
promote auto-derived values into manual overrides** — the previous
and post-write reading are compared, and `_userOverrides` is appended
only when the value actually changed.

## Migrating a panel

To convert a bespoke React form to a schema:

1. Define `<EntityName>FormValues` via a zod schema in `src/lib/schemas.ts`.
2. Build a `fieldBuilder<<EntityName>Entity, <EntityName>FormValues>()`.
3. Add one `F.field({...})` per editable row, with `read` and `write`
   adapters; default `overridesPaths` is `[name]`.
4. Add one `{ kind: 'readonly', label, section, compute }` per derived
   row.
5. Export the constant as `<EntityName>InspectorSchema`.
6. Flip the `<EntityName>Form` import in
   `src/components/layout/panels/InspectorForms.tsx` to use
   `<SchemaForm schema={<EntityName>InspectorSchema} />`.
7. Delete the old bespoke React form.

## See also

- [`types/apollo`](/api/types/apollo) — Apollo entity shapes the
  adapters read and write
- [`types/entities`](/api/types/entities) — `MapEntity` constraint on
  schema generics
- [`types/editor`](/api/types/editor) — adjacent runtime types
- [Enum Mappings](/reference/enum-mappings) — `EnumCategory` values
  available to `EnumFieldDef.enumCategory`
- `src/lib/schemas.ts` — zod schemas + option lists referenced by
  every inspector schema
- `src/core/elements/derive.ts` — `markUserOverride` consumed by
  `applyFormValuesToEntity`
- `src/components/layout/panels/InspectorForms.tsx` — the consumer
- `src/components/layout/panels/LaneRefList.tsx` — `LaneRef` /
  `LaneRefList` used by the Topology readonly rows
