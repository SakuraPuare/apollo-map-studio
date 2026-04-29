/**
 * SchemaForm — generic, schema-driven inspector panel.
 *
 * Replaces the hardcoded `LaneForm` body. Given an `EntitySchema` and
 * the current entity, it:
 *
 *  1. Seeds react-hook-form's default values from the schema's `read`
 *     adapters.
 *  2. Re-seeds (`reset`) only when the entity ID changes, so mid-edit
 *     external store updates do not clobber the field the user is in.
 *  3. Cherry-picks same-id drift via `setValue` per field, mirroring
 *     what LaneForm did inline.
 *  4. Persists changes through the schema's `write` adapters,
 *     short-circuiting via `shouldPersistForm` to break the
 *     store→sync→watch→updateEntity cycle.
 *  5. Renders sections in `schema.sectionOrder`, with editable fields
 *     before read-only rows inside each section.
 *
 * Behavior contract: this component MUST preserve the validation
 * gate fix from commit 6a83d9d — `mode: 'onChange'` is the gate that
 * makes `formState.isValid` reflect the live keystroke status, which
 * the Lane regression test pins.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  useForm,
  FormProvider,
  type Resolver,
  type FieldValues,
  type Path,
  type PathValue,
  type DefaultValues,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMapStore } from '@/store/mapStore';
import { Input, Select, Section, Value } from '@/components/ui/form-fields';
import {
  type EntitySchema,
  type AnyFieldDef,
  type ReadOnlyDef,
  formValuesFromEntity,
  diffFormAgainstEntity,
  shouldPersistForm,
  applyFormValuesToEntity,
} from '@/types/inspectorSchema';
import type { MapEntity } from '@/types/entities';

// Zod 4 + @hookform/resolvers@5 overload-resolution shim — same
// rationale as the original InspectorForms.tsx: runtime is version-
// aware (checks `_zod` vs `_def.typeName`) but TS sees the v3
// overload for bare ZodObject inputs.
function zodResolverZ4<T extends FieldValues>(schema: unknown): Resolver<T> {
  return zodResolver(schema as never) as unknown as Resolver<T>;
}

interface SchemaFormProps<TEntity extends MapEntity, TFormValues extends FieldValues> {
  schema: EntitySchema<TEntity, TFormValues>;
  entity: TEntity;
}

export function SchemaForm<TEntity extends MapEntity, TFormValues extends FieldValues>({
  schema,
  entity,
}: SchemaFormProps<TEntity, TFormValues>) {
  const updateEntity = useMapStore((s) => s.updateEntity);

  // Always-latest entity ref so the watch subscription below reads
  // the current entity without tearing down on every store update.
  const entityRef = useRef(entity);
  entityRef.current = entity;

  const methods = useForm<TFormValues>({
    resolver: zodResolverZ4<TFormValues>(schema.validation),
    // onChange is non-negotiable — this is the gate that keeps
    // formState.isValid live per keystroke. The R1 regression
    // depends on it (commit 6a83d9d).
    mode: 'onChange',
    defaultValues: formValuesFromEntity(schema, entity) as DefaultValues<TFormValues>,
  });

  // Re-seed on entity ID swap only — mid-edit same-id updates are
  // handled by the cherry-pick effect below so we don't clobber the
  // field the user is typing into.
  useEffect(() => {
    methods.reset(formValuesFromEntity(schema, entity) as TFormValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  // Same-id drift sync — pushes only the fields whose store-side
  // value moved away from the form-side value (undo/redo, canvas
  // drag, etc.). The diff guard short-circuits the death loop after
  // the watch callback writes back into the store.
  useEffect(() => {
    const current = methods.getValues();
    const diffs = diffFormAgainstEntity(schema, current, entity);
    if (diffs.length === 0) return;
    for (const [key, value] of diffs) {
      methods.setValue(
        key as Path<TFormValues>,
        value as PathValue<TFormValues, Path<TFormValues>>,
        {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  // Auto-save on change. Single subscription per form lifetime — the
  // closure reads from `entityRef.current` so it cannot go stale.
  // `shouldPersistForm` is the dedupe gate that breaks the loop.
  useEffect(() => {
    const subscription = methods.watch((value) => {
      const liveEntity = entityRef.current;
      if (!shouldPersistForm(schema, value as Partial<TFormValues>, liveEntity)) return;
      const next = applyFormValuesToEntity(schema, liveEntity, value as Partial<TFormValues>);
      updateEntity(liveEntity.id, next);
    });
    return () => subscription.unsubscribe();
  }, [methods, updateEntity, schema]);

  // Group fields + readonly rows by section, then render in
  // schema.sectionOrder. Sections referenced but not in sectionOrder
  // render last in declaration order (defensive — the Lane schema
  // already lists every section explicitly).
  const sections = useMemo(() => groupBySections(schema), [schema]);

  return (
    <FormProvider {...methods}>
      <form>
        {sections.map(({ title, fields, readonly }) => (
          <Section key={title} title={title}>
            {fields.map((f) => renderField(f as AnyFieldDef<TEntity, TFormValues>))}
            {readonly.map((r) => (
              <Value key={`${title}:${r.label}`} label={r.label} value={r.compute(entity)} />
            ))}
          </Section>
        ))}
      </form>
    </FormProvider>
  );
}

// ─── Render helpers ────────────────────────────────────────

function renderField<TEntity, TFormValues extends Record<string, unknown>>(
  field: AnyFieldDef<TEntity, TFormValues>,
): React.ReactElement {
  if (field.kind === 'number') {
    return (
      <Input
        key={field.name as string}
        name={field.name as string}
        label={field.label}
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
      />
    );
  }
  // kind === 'enum'
  return (
    <Select
      key={field.name as string}
      name={field.name as string}
      label={field.label}
      options={field.options}
    />
  );
}

interface SectionGroup<TEntity, TFormValues extends Record<string, unknown>> {
  title: string;
  fields: ReadonlyArray<AnyFieldDef<TEntity, TFormValues>>;
  readonly: ReadonlyArray<ReadOnlyDef<TEntity>>;
}

function groupBySections<TEntity, TFormValues extends Record<string, unknown>>(
  schema: EntitySchema<TEntity, TFormValues>,
): Array<SectionGroup<TEntity, TFormValues>> {
  // Bucket by title, preserving declaration order for any sections
  // not listed in schema.sectionOrder.
  const buckets = new Map<string, SectionGroup<TEntity, TFormValues>>();
  const ensure = (title: string) => {
    let g = buckets.get(title);
    if (!g) {
      g = { title, fields: [], readonly: [] };
      buckets.set(title, g);
    }
    return g;
  };
  for (const f of schema.fields) {
    const g = ensure(f.section);
    (g.fields as AnyFieldDef<TEntity, TFormValues>[]).push(f);
  }
  for (const r of schema.readonly) {
    const g = ensure(r.section);
    (g.readonly as ReadOnlyDef<TEntity>[]).push(r);
  }
  // Order: explicit sectionOrder first, then any leftovers.
  const ordered: Array<SectionGroup<TEntity, TFormValues>> = [];
  const seen = new Set<string>();
  for (const title of schema.sectionOrder) {
    const g = buckets.get(title);
    if (g) {
      ordered.push(g);
      seen.add(title);
    }
  }
  for (const [title, g] of buckets) {
    if (!seen.has(title)) ordered.push(g);
  }
  return ordered;
}
