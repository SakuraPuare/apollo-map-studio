# lib / schemas

Source: `src/lib/schemas.ts`.

Zod schemas and option arrays for Inspector forms. The file defines
lane, junction, parking, signal, stop sign, road, area and barrier
gate validation shapes plus enum option lists.

See [Types / inspectorSchema](/api/types/inspector-schema).

## Exports

### Common

- `pointSchema` — `z.object({ x, y, z? })`.

### Per-entity schemas

- `laneSchema` → `LaneFormValues`.
- `junctionSchema` → `JunctionFormValues`.
- `parkingSpaceSchema` → `ParkingSpaceFormValues`.
- `signalSchema` → `SignalFormValues`.
- `stopSignSchema` → `StopSignFormValues`.
- `roadSchema` → `RoadFormValues`.
- `areaSchema` → `AreaFormValues`.
- `barrierGateSchema` → `BarrierGateFormValues`.

### Option arrays (`as const` tuples)

`laneTypeOptions`, `laneTurnOptions`, `laneDirectionOptions`,
`boundaryTypeOptions`, `junctionTypeOptions`, `signalTypeOptions`,
`signInfoTypeOptions`, `subsignalTypeOptions`, `stopSignTypeOptions`,
`roadTypeOptions`, `areaTypeOptions`, `barrierGateTypeOptions`.

Each tuple doubles as the source of truth for both `z.enum([...])` and
`enumLabels.withLabels(...)`. UI dropdowns and Zod schemas stay in
lockstep.

## Lane Schema

```ts
laneSchema = z.object({
  type: z.enum(laneTypeOptions),
  turn: z.enum(laneTurnOptions),
  direction: z.enum(laneDirectionOptions),
  speedLimit: z.number().min(0).max(50), // m/s
  speedLimitKmh: z.number().min(0).max(180), // km/h, visual input
  leftWidth: z.number().min(0.5).max(10).optional(),
  rightWidth: z.number().min(0.5).max(10).optional(),
  leftBoundaryType: z.enum(boundaryTypeOptions),
  rightBoundaryType: z.enum(boundaryTypeOptions),
});
```

Numeric ranges encode editor invariants, not arbitrary UX caps:

- `speedLimit: 0..50` mirrors Apollo's plausible-speed envelope.
- `speedLimitKmh: 0..180` mirrors the visual km/h alias for the same stored m/s value.
- `leftWidth` / `rightWidth: 0.5..10` keeps lanes physically buildable.
  They are optional because lane width on the wire is encoded as a
  sample association `(s, width)[]` — not a scalar.

## Signal Schema

```ts
signalSchema = z.object({
  type: z.enum(signalTypeOptions),
  signInfo: z.array(z.enum(signInfoTypeOptions)),
});
```

`signInfo` is required (not `.default([])`) so the schema's input and
output types match — the form initialises `signInfo: []` in
`defaultValues`. `signInfoTypeOptions` excludes `'None'` because
Apollo treats absence of a flag as "none".

## Other Schemas

`junctionSchema`, `stopSignSchema`, `roadSchema`, `barrierGateSchema`
are all single-`type` enums. The pattern is intentional — inspector
forms stay shallow because the rest of the entity (geometry, ids) is
non-form state.

`parkingSpaceSchema` exposes `heading: -180..180` (degrees).
`areaSchema` adds an optional `name: z.string()`.

## Form-values type derivation

```ts
export type LaneFormValues = z.infer<typeof laneSchema>;
```

Components type their `useForm<LaneFormValues>(...)` against this
alias so the form, schema, and inspector input props stay aligned.

## Examples

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { laneSchema, laneTypeOptions, type LaneFormValues } from '@/lib/schemas';
import { withLabels } from '@/lib/enumLabels';

const form = useForm<LaneFormValues>({
  resolver: zodResolver(laneSchema),
  defaultValues: { /* ... */ signInfo: [] },
});

const options = withLabels('laneType', laneTypeOptions);
```

## Related

- [/api/lib/enum-labels](/api/lib/enum-labels) — paired display
  strings for every option array.
- [/api/io/proto-entity-bridge](/api/io/proto-entity-bridge) — wire ↔
  string enum conversion (the schemas mirror the entity union types).
- [/api/components/inspector-forms](/api/components/inspector-forms) —
  primary consumer.
