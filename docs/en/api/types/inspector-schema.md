---
title: types/inspectorSchema — schema-driven Inspector form model
description: Data-driven SchemaForm rendering of Lane / Junction / etc. inspectors. FieldDef carries explicit read/write adapters; LaneInspectorSchema replaces the JSX-per-entity form with declarative data.
---

# `types/inspectorSchema` — schema-driven Inspector form model

> Source: `src/types/inspectorSchema.ts` · 541 lines · React + zod integration

## Purpose

Before this module, `InspectorForms.tsx` hardcoded a separate React form per entity type (Lane / Junction / Parking / Signal / StopSign). Adding an entity or a field touched five JSX files.

`inspectorSchema` introduces a data-driven model — one `EntitySchema` describes a panel, and the generic `SchemaForm` component renders any of them.

Design notes (verbatim from source comments):

1. **Adapter pattern over field path.** A naive `entity[fieldName] = value` cannot express `leftWidth` (uniform width across every leftSample) or `leftBoundaryType` (head element of a nested types array). Each FieldDef ships explicit `read` / `write` adapters.
2. **Double-generic typing `<TEntity, TFormValues>`.** `name` is constrained to `keyof TFormValues`, so the compiler catches typos.
3. **Validation gate preserved.** `validation` is the zod schema fed straight to `useForm`, retaining the LaneForm onChange behaviour.

## Public API

| Symbol                                 | Kind      | Summary                                              |
| -------------------------------------- | --------- | ---------------------------------------------------- |
| `NumberFieldDef<...>`                  | interface | Numeric input field                                  |
| `EnumFieldDef<...>`                    | interface | Enumerated select                                    |
| `FieldDef<TEntity, TFormValues, TKey>` | union     | NumberFieldDef \| EnumFieldDef                       |
| `AnyFieldDef<TEntity, TFormValues>`    | type      | Distributed FieldDef union                           |
| `ReadOnlyDef<TEntity>`                 | interface | Read-only derived row                                |
| `EntitySchema<TEntity, TFormValues>`   | interface | Full Inspector panel schema                          |
| `fieldBuilder<TEntity, TFormValues>()` | fn        | Curried builder (TKey inferred)                      |
| `LaneInspectorSchema`                  | const     | Lane panel schema                                    |
| `formValuesFromEntity`                 | fn        | Project entity → form values via `read`              |
| `diffFormAgainstEntity`                | fn        | Field pairs that drift from entity                   |
| `shouldPersistForm`                    | fn        | True when there is at least one diff                 |
| `applyFormValuesToEntity`              | fn        | Apply form values via `write`, mark `_userOverrides` |

## Detailed entries

### `NumberFieldDef<TEntity, TFormValues, TKey>`

```ts
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
  /** Pull form-side value out of the (post-derive) entity. */
  read: (entity: TEntity) => TFormValues[TKey];
  /** Apply form-side value back into the entity (with derivations). */
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
  /**
   * Entity field paths "owned" by this form field. Tagged into
   * `_userOverrides` after a successful write; derive rules whose
   * `owns` overlap will skip on later geometry edits. Defaults to `[name]`.
   */
  overridesPaths?: readonly string[];
}
```

Source: `inspectorSchema.ts:62-86`.

### `EnumFieldDef<TEntity, TFormValues, TKey>`

```ts
export interface EnumFieldDef<...> {
  kind: 'enum';
  name: TKey;
  label: string;
  section: string;
  options: readonly string[];
  enumCategory?: EnumCategory;  // for getEnumLabel
  read: (entity: TEntity) => TFormValues[TKey];
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
  overridesPaths?: readonly string[];
}
```

`enumCategory` lets the `<Select>` show localised labels while keeping the wire value untouched — single i18n hook.

### `FieldDef` & `AnyFieldDef`

```ts
export type FieldDef<...> = NumberFieldDef<...> | EnumFieldDef<...>;

export type AnyFieldDef<TEntity, TFormValues> = {
  [K in keyof TFormValues]-?: FieldDef<TEntity, TFormValues, K>;
}[keyof TFormValues];
```

`AnyFieldDef` is the _distributed_ union. Without distribution the array literal would widen `read` / `write` to "the union of every possible field type", defeating per-key narrowing.

### `ReadOnlyDef<TEntity>`

```ts
export interface ReadOnlyDef<TEntity extends MapEntity> {
  kind: 'readonly';
  label: string;
  section: string;
  compute: (entity: TEntity) => React.ReactNode;
}
```

No form binding, no validation — display only. Used for `Length` (m), `predecessorIds` lists, etc. `compute` may return any React node, e.g. `<LaneRefList>` with click-to-jump links.

### `EntitySchema<TEntity, TFormValues>`

```ts
export interface EntitySchema<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
> {
  id: string;
  fields: ReadonlyArray<AnyFieldDef<TEntity, TFormValues>>;
  readonly: ReadonlyArray<ReadOnlyDef<TEntity>>;
  validation: ZodType<TFormValues, TFormValues>;
  sectionOrder: ReadonlyArray<string>;
}
```

- `id` — React `key` for force-remount on entity-type switch
- `fields` — editable rows
- `readonly` — display-only rows
- `validation` — zod resolver passed to `useForm`
- `sectionOrder` — explicit section render order; unlisted sections render last

### `fieldBuilder<TEntity, TFormValues>()`

```ts
export function fieldBuilder<TEntity, TFormValues>() {
  return {
    field<TKey extends keyof TFormValues>(
      def: FieldDef<TEntity, TFormValues, TKey>,
    ): FieldDef<TEntity, TFormValues, TKey> {
      return def;
    },
  };
}
```

Why curried? `defineField<TEntity, TFormValues, TKey>(def)` would force the caller to supply `TKey` because TS cannot infer three generics from one argument when two are explicit. Pinning `TEntity, TFormValues` once at builder level leaves TKey to be inferred from the literal `name`.

```ts
const F = fieldBuilder<LaneEntity, LaneFormValues>();
F.field({ kind: 'number', name: 'speedLimit', read, write, ... });
```

### `LaneInspectorSchema`

```ts
export const LaneInspectorSchema: EntitySchema<LaneEntity, LaneFormValues> = {
  id: 'lane',
  validation: laneSchema,
  sectionOrder: ['Attributes', 'Boundaries', 'Topology'],
  fields: [
    LaneField.field({ kind: 'enum', name: 'type', label: 'Type', section: 'Attributes', ... }),
    LaneField.field({ kind: 'enum', name: 'turn', ... }),
    LaneField.field({ kind: 'enum', name: 'direction', ... }),
    LaneField.field({ kind: 'number', name: 'speedLimit', ... }),
    LaneField.field({ kind: 'number', name: 'leftWidth', read: readLeftWidth, write: writeLeftWidth, ... }),
    LaneField.field({ kind: 'number', name: 'rightWidth', ... }),
    LaneField.field({ kind: 'enum', name: 'leftBoundaryType', read: readLeftBoundary, write: writeLeftBoundary, ... }),
    LaneField.field({ kind: 'enum', name: 'rightBoundaryType', ... }),
  ],
  readonly: [
    { kind: 'readonly', label: 'ID', section: 'Attributes', compute: e => e.id },
    { kind: 'readonly', label: 'Length', section: 'Boundaries', compute: e => `${(e.length ?? 0).toFixed(2)} m` },
    { kind: 'readonly', label: 'L Virtual', ... },
    { kind: 'readonly', label: 'Junction', section: 'Topology',
      compute: e => createElement(LaneRef, { id: e.junctionId }) },
    { kind: 'readonly', label: 'Predecessors', section: 'Topology',
      compute: e => createElement(LaneRefList, { ids: e.predecessorIds }) },
    // ... 9 topology rows total
  ],
};
```

Eight editable fields + 12 readonly rows (ID, Length, plus seven topology lists). **Behaviourally identical** to the previous `LaneForm.tsx`.

#### Lane adapters

Module-private:

```ts
function applySampleWidth(samples, width, totalLength): LaneSampleAssociation[] {
  if (samples.length === 0) {
    return [
      { s: 0, width },
      { s: Math.max(0, totalLength), width },
    ];
  }
  return samples.map((sample) => ({ s: sample.s, width }));
}

const readLeftWidth = (e: LaneEntity): number => e.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;

const writeLeftWidth = (e: LaneEntity, width: number | undefined): LaneEntity => {
  const next = width ?? DEFAULT_LANE_HALF_WIDTH;
  return { ...e, leftSamples: applySampleWidth(e.leftSamples, next, e.length ?? 0) };
};
```

`leftWidth` is not a LaneEntity field — it is a virtual "uniform width applied to every leftSample". The adapter expands a scalar into the array on write and grabs the first sample on read.

### Schema-generic helpers

#### `formValuesFromEntity(schema, entity): TFormValues`

```ts
export function formValuesFromEntity(schema, entity): TFormValues {
  const result = {} as Record<string, unknown>;
  for (const field of schema.fields) {
    result[field.name as string] = field.read(entity);
  }
  return result as TFormValues;
}
```

Projects the entity through all `read` adapters into a react-hook-form initial values object.

#### `diffFormAgainstEntity(schema, current, entity): Array<[key, value]>`

Returns the `[key, nextValue]` pairs where `current[key]` differs from `formValuesFromEntity(schema, entity)[key]`. Used as the `updateEntity` gate.

#### `shouldPersistForm(schema, formValues, entity): boolean`

`diffFormAgainstEntity(...).length > 0`.

#### `applyFormValuesToEntity(schema, entity, values): TEntity`

```ts
export function applyFormValuesToEntity(schema, entity, values): TEntity {
  let next = entity;
  for (const field of schema.fields) {
    const key = field.name as keyof TFormValues;
    if (key in values) {
      const v = values[key];
      const prevValue = field.read(next);
      next = field.write(next, v);

      const newValue = field.read(next);
      if (prevValue !== newValue) {
        const paths = field.overridesPaths ?? [String(field.name)];
        for (const path of paths) {
          next = markUserOverride(next, path);
        }
      }
    }
  }
  return next;
}
```

Applies each `write` and **only** marks `_userOverrides` when the value actually changed — so a re-seed from `formValuesFromEntity` does not promote auto-derived values into manual overrides.

## Side effects

- `applyFormValuesToEntity` calls `markUserOverride` (from `core/elements/derive`, pure).
- Otherwise pure.

## Test coverage

Integration tests in `src/components/layout/panels/__tests__/SchemaForm.test.tsx` (when present) check Lane schema parity with the legacy `LaneForm`.

## Consumers

- `src/components/layout/panels/SchemaForm.tsx` — generic renderer
- `src/components/layout/panels/InspectorForms.tsx` + `src/components/layout/panels/InspectorForms/` — selects `LaneInspectorSchema` for `entityType === 'lane'`
- `src/components/layout/WorkspaceLayout.tsx` + `src/components/layout/WorkspaceLayout/lazyPanels.tsx` — Dockview container and lazy-panel assembly

## Source map

| Lines   | Content                   |
| ------- | ------------------------- |
| 36–58   | imports                   |
| 62–86   | `NumberFieldDef`          |
| 88–109  | `EnumFieldDef`            |
| 111–115 | `FieldDef`                |
| 117–126 | `AnyFieldDef`             |
| 130–138 | `ReadOnlyDef`             |
| 142–171 | `EntitySchema`            |
| 173–199 | `fieldBuilder`            |
| 202–247 | Lane adapters             |
| 251–435 | `LaneInspectorSchema`     |
| 437–456 | `formValuesFromEntity`    |
| 458–481 | `diffFormAgainstEntity`   |
| 483–493 | `shouldPersistForm`       |
| 495–540 | `applyFormValuesToEntity` |

## See also

- [`entities`](./entities.md) — `MapEntity` / `LaneEntity`
- [`apollo`](./apollo.md) — Lane source
- [`enumLabels`](../lib/enum-labels.md) — consumed via `enumCategory`
- `src/lib/schemas.ts` — `laneSchema`, `LaneFormValues`, option arrays
- `core/elements/derive` — `markUserOverride`
- `src/components/layout/panels/SchemaForm.tsx` — actual renderer
