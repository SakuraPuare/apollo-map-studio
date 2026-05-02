# Extending the Inspector

The inspector is schema-driven: every editable field traces back to a
zod schema in `src/lib/schemas.ts`. Adding a field is a four-step
change — schema, form, dispatcher (auto), test — and never touches
the `EntityForm` switch unless you're adding a brand-new entity type.

The running example is adding a `friction` field (range `0..1`) to the
existing `Lane` inspector.

## File map

```text
src/lib/schemas.ts                                       # zod schemas
src/components/layout/panels/InspectorForms.tsx          # entityType → form dispatcher
src/components/layout/panels/InspectorForms/
  resolver.ts                                            # zod-resolver shim for react-hook-form
  lane.tsx                                               # split-out: lane form (large)
  overlap.tsx                                            # split-out: overlap form (large)
  pncJunction.tsx                                        # split-out: pnc junction form
  simpleForms.tsx                                        # everything else (junction, signal, …)
  DrawingForm.tsx                                        # generic geometry primitives
src/components/layout/panels/__tests__/InspectorForms.test.tsx
```

Three rules of thumb:

1. **One form per file** if it exceeds ~150 lines. Lane, overlap, and
   pnc junction earned their own files; junction / signal / etc.
   coexist in `simpleForms.tsx`.
2. **Schema drives the form** — never validate in `useEffect`. Add a
   constraint to the zod schema and let `zodResolverZ4` reject invalid
   input.
3. **Watch + persist** — every form subscribes to react-hook-form's
   `methods.watch(...)` and calls `mapStore.updateEntity` only when
   the value actually differs from the entity's current value.

## Step 1 — Extend the zod schema

```ts
// src/lib/schemas.ts
export const laneSchema = z.object({
  type: z.enum(laneTypeOptions),
  turn: z.enum(laneTurnOptions),
  direction: z.enum(laneDirectionOptions),
  speedLimit: z.number().min(0).max(50),
  leftWidth: z.number().min(0.5).max(10).optional(),
  rightWidth: z.number().min(0.5).max(10).optional(),
  leftBoundaryType: z.enum(boundaryTypeOptions),
  rightBoundaryType: z.enum(boundaryTypeOptions),
  // NEW:
  friction: z.number().min(0).max(1).optional(),
});

export type LaneFormValues = z.infer<typeof laneSchema>;
```

`LaneFormValues` is consumed by `LaneForm`, the cascade-delete tests,
and any persistence helper that diffs lane state — all picked up
automatically because the type is exported.

## Step 2 — Add the field to the entity type

If your field is not yet on the entity, add it to
`src/types/apollo.ts`:

```ts
export interface LaneEntity {
  // … existing fields …
  friction?: number;
}
```

Mirror Apollo proto2 optional semantics — use `?: number` rather than
`number | undefined` to match the round-trip behaviour the proto
bridge expects.

## Step 3 — Extend the form

Open `src/components/layout/panels/InspectorForms/lane.tsx` and add
the field. Three places to update:

### 3a. `defaultValues`

```ts
const methods = useForm<LaneFormValues>({
  resolver: zodResolverZ4<LaneFormValues>(laneSchema),
  mode: 'onChange',
  defaultValues: {
    // … existing defaults …
    friction: entity.friction ?? 0.7,
  },
});
```

### 3b. The reset / sync `useEffect`

```ts
useEffect(() => {
  methods.reset({
    // … existing fields …
    friction: entity.friction ?? 0.7,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [entity.id]);
```

The `entity.id` dependency ensures the form resets when the user
selects a different lane, but stays in place when the same lane's
fields shift externally (cold layer recompile, undo, etc.).

### 3c. The watch + persist subscription

`lane.tsx` already centralises diffing in
`diffLaneFormAgainstEntity` / `shouldPersistLaneForm`. Extend those
helpers to compare the new field:

```ts
function diffLaneFormAgainstEntity(values: LaneFormValues, entity: LaneEntity) {
  // … existing comparisons …
  if (values.friction !== entity.friction) {
    return { ...entity, friction: values.friction };
  }
  return null;
}
```

### 3d. Render the field

Use the shared form primitives from `@/components/ui/form-fields`:

```tsx
<Section title="Surface">
  <Input name="friction" label="Friction" type="number" min={0} max={1} step={0.05} />
</Section>
```

Pick the field component that matches the data type:

| Component | Use for                                |
| --------- | -------------------------------------- |
| `Input`   | numeric / text input                   |
| `Select`  | enum, takes `options` + `enumCategory` |
| `Value`   | read-only display (computed/derived)   |
| `Section` | groups fields under a title            |

## Step 4 — Tests

`src/components/layout/panels/__tests__/InspectorForms.test.tsx` has
a render-and-edit pattern you can extend:

```tsx
it('persists friction edits to the entity', () => {
  const updateEntity = vi.fn();
  vi.mocked(useMapStore).mockImplementation((sel) => sel({ updateEntity /* … */ } as any));

  const lane: LaneEntity = makeLane({ friction: 0.5 });
  render(<LaneForm entity={lane} />);

  const input = screen.getByLabelText('Friction') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '0.8' } });

  expect(updateEntity).toHaveBeenCalledWith(lane.id, expect.objectContaining({ friction: 0.8 }));
});
```

Add at least one happy-path edit test and one schema-rejection test
(e.g. `friction = 1.5` should not call `updateEntity`).

## Adding a new entity to the dispatcher

If you're adding a form for a brand-new entity type — not just
extending an existing one — also touch the dispatcher in
`src/components/layout/panels/InspectorForms.tsx`:

```tsx
case 'tollGate':
  return <TollGateForm entity={entity as TollGateEntity} />;
```

That switch is the only place in the inspector subsystem that
hard-codes entity types. Everything else is schema- or registry-driven.

## Patterns and pitfalls

### Pattern: optional-with-fallback

Apollo proto fields are usually optional. The form needs a non-undefined
default to render. Standard idiom:

```ts
defaultValues: {
  type: entity.type ?? UNKNOWN_FALLBACK;
}
```

And on persist, **don't** write the fallback back to the entity if the
entity originally had no value:

```ts
function shouldSkipOptionalEnumWrite<T extends string>(
  next: T | undefined,
  current: T | undefined,
  fallback: T,
): boolean {
  return next === undefined || next === current || (current === undefined && next === fallback);
}
```

This helper in `simpleForms.tsx` is already shared across
JunctionForm, StopSignForm, and RoadForm. Reuse it for new optional
enum fields.

### Pattern: shallow array equality

Forms with `signInfo: string[]` use `arraysShallowEqual` to avoid
spurious `updateEntity` calls when the watch fires with the same
value:

```ts
function arraysShallowEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
```

### Pitfall: forgetting `entityRef`

react-hook-form's `methods.watch(...)` callback closes over the
`entity` value at subscription time. If the user edits while a stale
closure runs, you'll spread a stale entity. Always:

```ts
const entityRef = useRef(entity);
entityRef.current = entity;
// ...
methods.watch((value) => {
  const live = entityRef.current;
  // ... use `live`, not `entity`
});
```

Every form in `simpleForms.tsx` follows this pattern — copy it.

### Pitfall: writing during a watch causes reset loops

Inside the `methods.watch` callback, never call `methods.setValue`.
Setting a value re-fires watch, which calls `updateEntity`, which
re-renders, which re-runs the sync `useEffect`, which calls
`setValue`… infinite loop. Use the diff-based pattern:

```ts
useEffect(() => {
  const sub = methods.watch((value) => {
    const live = entityRef.current;
    if (value.foo === live.foo) return;
    updateEntity(live.id, { ...live, foo: value.foo });
  });
  return () => sub.unsubscribe();
}, [methods, updateEntity]);
```

## Verification

1. `pnpm typecheck` — schema and form types align.
2. `pnpm test --filter InspectorForms` — pass.
3. `pnpm dev`:
   - Select a lane, observe the new field.
   - Edit it; observe canvas decoration / cold-layer update.
   - Undo (`Ctrl+Z`); the field reverts.
   - Click a different lane and back; the value persists.

## Cross-references

- [/architecture/overview](../architecture/overview.md) — schema-driven inspector
- [/api/lib](../api/lib/) — schemas and form helpers
- [adding-a-new-element](./adding-a-new-element.md) — when adding a brand-new entity type
