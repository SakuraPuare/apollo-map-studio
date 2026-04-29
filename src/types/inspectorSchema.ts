/**
 * Inspector Schema — schema-driven property panel definitions.
 *
 * Background: prior to this module, `InspectorForms.tsx` hardcoded a
 * separate React form per entity type (Lane / Junction / Parking /
 * Signal / StopSign). Adding a new entity type or a new field to an
 * existing one meant patching JSX in five different places.
 *
 * This file defines the data model that lets a single generic
 * `SchemaForm` component render any of those panels. Lane is the
 * pilot — Junction/Parking/Signal/StopSign keep their bespoke forms
 * for now, but each can be migrated by writing one schema constant
 * and flipping a single line in InspectorForms.tsx.
 *
 * Design decisions:
 *
 * 1. Adapter pattern, not field path. Naive schema-driven libraries
 *    assume `entity[fieldName] = value`. That cannot express
 *    `leftWidth` (a uniform width applied to every leftSample) or
 *    `leftBoundaryType` (the head element of a nested types array).
 *    Each FieldDef therefore carries explicit `read`/`write`
 *    adapters that translate between the form value and the
 *    structurally-real entity shape.
 *
 * 2. Double-generic typing. `EntitySchema<TEntity, TFormValues>`
 *    pins both the domain entity (LaneEntity) and the form values
 *    type (LaneFormValues, which is the zod-inferred shape). The
 *    `name` of every FieldDef is constrained to `keyof TFormValues`
 *    so the compiler catches typos against the validation schema.
 *
 * 3. Validation gate preserved. The `validation` field carries the
 *    zod schema that the SchemaForm passes to `useForm`, keeping
 *    the onChange validation gate fix from commit 6a83d9d intact.
 */

import type { ZodType } from 'zod';
import type {
  LaneEntity,
  LaneType,
  LaneTurn,
  LaneDirection,
  BoundaryLineType,
  LaneSampleAssociation,
} from '@/types/apollo';
import {
  laneSchema,
  laneTypeOptions,
  laneTurnOptions,
  laneDirectionOptions,
  boundaryTypeOptions,
  type LaneFormValues,
} from '@/lib/schemas';
import { DEFAULT_LANE_HALF_WIDTH } from '@/config/mapConstants';

// ─── FieldDef ──────────────────────────────────────────────

/** Numeric input rendered as `<Input type="number">`. */
export interface NumberFieldDef<TEntity, TFormValues, TKey extends keyof TFormValues> {
  kind: 'number';
  name: TKey;
  label: string;
  section: string;
  min?: number;
  max?: number;
  step?: number;
  /** Pull the form-side value out of the entity (post-derivation). */
  read: (entity: TEntity) => TFormValues[TKey];
  /** Apply the form-side value back into the entity (with derivations). */
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
}

/** Enumerated select rendered as `<Select>`. */
export interface EnumFieldDef<TEntity, TFormValues, TKey extends keyof TFormValues> {
  kind: 'enum';
  name: TKey;
  label: string;
  section: string;
  options: readonly string[];
  read: (entity: TEntity) => TFormValues[TKey];
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
}

export type FieldDef<TEntity, TFormValues, TKey extends keyof TFormValues = keyof TFormValues> =
  | NumberFieldDef<TEntity, TFormValues, TKey>
  | EnumFieldDef<TEntity, TFormValues, TKey>;

/**
 * Distributes FieldDef over each key of TFormValues so the resulting
 * union narrows `name` ↔ `read`/`write` together. Without this, an
 * array literal like `[{name:'leftWidth', read:..., write:...}]`
 * widens the value type of `read` to the union of every possible
 * field type, defeating per-field type safety.
 */
export type AnyFieldDef<TEntity, TFormValues> = {
  [K in keyof TFormValues]-?: FieldDef<TEntity, TFormValues, K>;
}[keyof TFormValues];

/**
 * Read-only display row (no form binding, no validation). Renders as
 * `<Value>`. Used for derived/topology summaries like "Length" or
 * "Predecessors" that LaneForm previously hardcoded.
 */
export interface ReadOnlyDef<TEntity> {
  kind: 'readonly';
  label: string;
  section: string;
  compute: (entity: TEntity) => React.ReactNode;
}

// ─── EntitySchema ──────────────────────────────────────────

/**
 * `EntitySchema<TEntity, TFormValues>` describes one inspector panel.
 *
 * - `fields`: editable rows backed by react-hook-form. Their `name`s
 *   collectively must cover every key of TFormValues so `useForm`
 *   default values are well-formed (enforced by `assertSchemaCovers`).
 * - `readonly`: derived/topology rows displayed but not editable.
 * - `validation`: the zod schema fed to react-hook-form's resolver.
 * - `sectionOrder`: render order for sections; any sections referenced
 *   by fields/readonly that are not listed here render last in the
 *   order they were declared.
 */
export interface EntitySchema<TEntity, TFormValues extends Record<string, unknown>> {
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
  validation: ZodType<TFormValues>;
  /** Section render order. */
  sectionOrder: ReadonlyArray<string>;
}

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
export function fieldBuilder<TEntity, TFormValues extends Record<string, unknown>>() {
  return {
    field<TKey extends keyof TFormValues>(
      def: FieldDef<TEntity, TFormValues, TKey>,
    ): AnyFieldDef<TEntity, TFormValues> {
      // The per-key narrowed FieldDef is structurally a member of the
      // distributed AnyFieldDef union — TS cannot prove the variance
      // automatically when TKey is a free generic, hence the explicit
      // unknown bridge. Each call site retains full type safety.
      return def as unknown as AnyFieldDef<TEntity, TFormValues>;
    },
  };
}

// ─── Lane: read/write adapters ─────────────────────────────

// Re-implement the same derivation rules LaneForm used inline. These
// helpers are private to this module — the public surface is the
// LaneInspectorSchema constant. Pure functions so they are trivially
// testable and safe to call from React effects.

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

// ─── LaneInspectorSchema ───────────────────────────────────

/**
 * Bound to LaneEntity + LaneFormValues so each `.field(...)` below
 * infers TKey from the `name` literal.
 */
const LaneField = fieldBuilder<LaneEntity, LaneFormValues>();

/**
 * Schema for the Lane inspector panel. The eight editable fields
 * mirror exactly what LaneForm rendered before this refactor — the
 * intent is behavior parity, with the JSX-per-entity duplication
 * replaced by data.
 */
export const LaneInspectorSchema: EntitySchema<LaneEntity, LaneFormValues> = {
  id: 'lane',
  validation: laneSchema as ZodType<LaneFormValues>,
  sectionOrder: ['Attributes', 'Boundaries', 'Topology'],
  fields: [
    LaneField.field({
      kind: 'enum',
      name: 'type',
      label: 'Type',
      section: 'Attributes',
      options: laneTypeOptions,
      read: (e) => e.type,
      write: (e, v) => ({ ...e, type: v as LaneType }),
    }),
    LaneField.field({
      kind: 'enum',
      name: 'turn',
      label: 'Turn',
      section: 'Attributes',
      options: laneTurnOptions,
      read: (e) => e.turn,
      write: (e, v) => ({ ...e, turn: v as LaneTurn }),
    }),
    LaneField.field({
      kind: 'enum',
      name: 'direction',
      label: 'Direction',
      section: 'Attributes',
      options: laneDirectionOptions,
      read: (e) => e.direction,
      write: (e, v) => ({ ...e, direction: v as LaneDirection }),
    }),
    LaneField.field({
      kind: 'number',
      name: 'speedLimit',
      label: 'Speed (m/s)',
      section: 'Attributes',
      min: 0,
      max: 50,
      step: 0.5,
      read: (e) => e.speedLimit,
      write: (e, v) => ({ ...e, speedLimit: v ?? 0 }),
    }),
    LaneField.field({
      kind: 'number',
      name: 'leftWidth',
      label: 'Left Width (m)',
      section: 'Boundaries',
      min: 0.5,
      max: 10,
      step: 0.1,
      read: readLeftWidth,
      write: writeLeftWidth,
    }),
    LaneField.field({
      kind: 'number',
      name: 'rightWidth',
      label: 'Right Width (m)',
      section: 'Boundaries',
      min: 0.5,
      max: 10,
      step: 0.1,
      read: readRightWidth,
      write: writeRightWidth,
    }),
    LaneField.field({
      kind: 'enum',
      name: 'leftBoundaryType',
      label: 'Left Type',
      section: 'Boundaries',
      options: boundaryTypeOptions,
      read: readLeftBoundary,
      write: (e, v) => writeLeftBoundary(e, v as BoundaryLineType),
    }),
    LaneField.field({
      kind: 'enum',
      name: 'rightBoundaryType',
      label: 'Right Type',
      section: 'Boundaries',
      options: boundaryTypeOptions,
      read: readRightBoundary,
      write: (e, v) => writeRightBoundary(e, v as BoundaryLineType),
    }),
  ],
  readonly: [
    {
      kind: 'readonly',
      label: 'Length',
      section: 'Boundaries',
      compute: (e) => `${e.length.toFixed(2)} m`,
    },
    {
      kind: 'readonly',
      label: 'Predecessors',
      section: 'Topology',
      compute: (e) => e.predecessorIds.length || '—',
    },
    {
      kind: 'readonly',
      label: 'Successors',
      section: 'Topology',
      compute: (e) => e.successorIds.length || '—',
    },
    {
      kind: 'readonly',
      label: 'Junction',
      section: 'Topology',
      compute: (e) => e.junctionId ?? '—',
    },
  ],
};

// ─── Schema-generic helpers (used by SchemaForm + tests) ───

/**
 * Project an entity through the schema's `read` adapters into a
 * canonical form-values object. Mirrors the old
 * `laneFormValuesFromEntity` semantics, generalized.
 */
export function formValuesFromEntity<TEntity, TFormValues extends Record<string, unknown>>(
  schema: EntitySchema<TEntity, TFormValues>,
  entity: TEntity,
): TFormValues {
  const result = {} as Record<string, unknown>;
  for (const field of schema.fields) {
    // `field.read` is the union of per-key readers; calling it with the
    // entity yields the union value type which we slot into the result
    // by string key. Type safety is preserved at the FieldDef site.
    result[field.name as string] = (field.read as (e: TEntity) => unknown)(entity);
  }
  return result as TFormValues;
}

/**
 * Compute the (fieldName, nextValue) pairs where the form-side value
 * has drifted from what the entity would produce. Empty array means
 * the form is already in sync (the dedupe gate that breaks the
 * store→reset→watch→updateEntity loop).
 */
export function diffFormAgainstEntity<TEntity, TFormValues extends Record<string, unknown>>(
  schema: EntitySchema<TEntity, TFormValues>,
  current: Partial<TFormValues>,
  entity: TEntity,
): Array<[keyof TFormValues, TFormValues[keyof TFormValues]]> {
  const desired = formValuesFromEntity(schema, entity);
  const diffs: Array<[keyof TFormValues, TFormValues[keyof TFormValues]]> = [];
  for (const field of schema.fields) {
    const key = field.name as keyof TFormValues;
    if (current[key] !== desired[key]) {
      diffs.push([key, desired[key]]);
    }
  }
  return diffs;
}

/** True iff at least one field differs — gate for `updateEntity`. */
export function shouldPersistForm<TEntity, TFormValues extends Record<string, unknown>>(
  schema: EntitySchema<TEntity, TFormValues>,
  formValues: Partial<TFormValues>,
  entity: TEntity,
): boolean {
  return diffFormAgainstEntity(schema, formValues, entity).length > 0;
}

/**
 * Apply every form value through the schema's `write` adapters,
 * folding them into a single updated entity. Order does not matter
 * for Lane (each adapter touches disjoint fields), but the contract
 * is explicit so future schemas can rely on left-to-right reduction.
 */
export function applyFormValuesToEntity<TEntity, TFormValues extends Record<string, unknown>>(
  schema: EntitySchema<TEntity, TFormValues>,
  entity: TEntity,
  values: Partial<TFormValues>,
): TEntity {
  let next = entity;
  for (const field of schema.fields) {
    const key = field.name as keyof TFormValues;
    if (key in values) {
      const v = values[key];
      // The write adapter is the per-key union; we have already
      // checked `key in values`, so call through after a cast that
      // matches the union's call signature shape.
      const writer = field.write as (e: TEntity, value: unknown) => TEntity;
      next = writer(next, v);
    }
  }
  return next;
}
