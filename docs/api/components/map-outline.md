# MapOutline + SidebarPanel + SchemaForm + MapMetadataForm

> Source: `src/components/layout/panels/MapOutline.tsx`, `src/components/layout/panels/SidebarPanel.tsx`, `src/components/layout/panels/SchemaForm.tsx`, `src/components/layout/panels/MapMetadataForm.tsx`

## Overview

This page covers the four pieces that make up the left sidebar's
content layer:

- **`SidebarPanel`** — the Dockview panel host that switches between
  Outline / Layers / Search / Timeline based on the activity bar tab.
- **`MapOutline`** — read-only structural summary of the current map:
  per-type counts, orphan / unparented checks, plus the imported
  Apollo header.
- **`SchemaForm`** — the schema-driven form engine reused across
  Inspector and any future schema-based panel.
- **`MapMetadataForm`** — read-only display of the imported Apollo
  `Map.header` fields.

## SidebarPanel

```ts
interface SidebarPanelContentProps {
  /** Hook to open the global Settings modal when the user clicks the settings tab. */
  onOpenSettings(): void;
}
export function SidebarPanelContent(props: SidebarPanelContentProps): JSX.Element;
```

### Behavior

The component reads `activeTab` from `SidebarContext` and renders one
of four lazy panels:

| Tab        | Component               |
| ---------- | ----------------------- |
| `explorer` | `MapOutline`            |
| `layers`   | `LayerTree`             |
| `search`   | `SearchPanel`           |
| `timeline` | `TimelinePanel`         |
| `settings` | (modal — handled below) |

Selection is forwarded into the FSM:

```ts
const handleSelect = useCallback(
  (id: string | null) => {
    if (id) actorRef.send({ type: 'SELECT_ENTITY', id });
  },
  [actorRef],
);
```

This callback is passed to `LayerTree` and `SearchPanel` so a click
in either panel selects the entity through the same code path as a
canvas click.

### Settings tab is a modal trigger

```ts
useEffect(() => {
  if (activeTab === 'settings') {
    onOpenSettings();
    setActiveTab('explorer');
  }
}, [activeTab, onOpenSettings, setActiveTab]);
```

Clicking the Settings activity-bar icon opens the modal and snaps
back to Outline so the sidebar isn't left blank — the modal is
_not_ a sidebar panel.

## MapOutline

`MapOutline` reads `mapStore.entities` and computes:

```ts
interface OutlineStats {
  apolloCounts: Map<string, number>;
  drawingCount: number;
  unparentedLanes: number;
  orphanedJunctionRefs: number;
}
```

### Health checks

- **Unparented Lanes** — lanes whose `junctionId` doesn't resolve **and**
  that aren't claimed by any `RoadSection.laneIds`. These are
  un-discoverable in the layer tree's Roads/Junctions hierarchy.
- **Dangling junction_id** — entities (lane/road/rsu) whose
  `junctionId` references a non-existent entity. Surfaced as an
  amber-tinted count.

Both counts render via the inline `<Row warn>` styling — green on
zero, amber when non-zero.

### Sections

```
Apollo HD-Map (per-type counts)
Drawing Primitives (single total)
Health (warn rows)
Map Metadata (read-only Apollo header)
```

### TYPE_LABELS

The component carries its own label map to title-case entity types
("Stop Signs", "PNC Junctions"). This duplicates the `LayerTree`
constants — kept inline because each panel cares about a different
subset.

## SchemaForm

```ts
interface SchemaFormProps<TEntity extends MapEntity, TFormValues extends FieldValues> {
  schema: EntitySchema<TEntity, TFormValues>;
  entity: TEntity;
}
export function SchemaForm<...>(props: SchemaFormProps): JSX.Element;
```

### Five-step contract

The component's docstring spells out the contract explicitly:

1. Seed `react-hook-form` defaults via `formValuesFromEntity(schema,
entity)`.
2. **Re-seed on entity ID change** via `methods.reset(...)` — keeps
   mid-edit external store updates from clobbering the active field.
3. **Cherry-pick same-id drift** via `setValue` per field for fields
   whose store-side value moved away from the form-side value.
4. Persist changes through `applyFormValuesToEntity(...)`,
   short-circuited by `shouldPersistForm(...)` to break the
   store→sync→watch→update loop.
5. Render sections in `schema.sectionOrder` — editable fields first,
   read-only rows after.

::: warning Behavior contract
`mode: 'onChange'` is **non-negotiable**. It's the gate that makes
`formState.isValid` reflect live keystroke status — the LaneForm
regression test (commit 6a83d9d) pins this.
:::

### Internal helpers

```ts
function renderField<TEntity, TFormValues>(field: AnyFieldDef): React.ReactElement;
function groupBySections<TEntity, TFormValues>(schema): Array<SectionGroup>;
```

`renderField` switches on `field.kind`:

- `number` → `<Input type="number" min max step />`
- `enum` → `<Select options enumCategory />`

`groupBySections` buckets schema fields and read-only definitions by
section title, ordered first by `schema.sectionOrder` and then by
declaration order for any leftovers.

### Used by

- `LaneForm` (`InspectorForms/lane.tsx`) — the only production
  consumer today.

Future inspector forms can opt into the schema engine by exporting an
`EntitySchema` from `inspectorSchema.ts` and substituting a one-line
`<SchemaForm schema={...} entity={entity} />`.

## MapMetadataForm

`MapMetadataForm` is the read-only viewer for `apolloMapStore.header`.

### Why read-only

The component's leading comment explains:

> The current `apolloMapStore` is a read-after-import bucket — it has
> no `setHeader(...)` mutator and `mapStore` doesn't carry a header at
> all. Wiring an editable header would require: (1) adding an
> `updateHeader` action to `apolloMapStore`, OR (2) promoting
> `MapHeader` into `mapStore` proper (so undo/redo/zundo see header
> edits as part of history), AND (3) threading header writes back
> through the export adapter.

All three touch cross-cutting concerns and were out of scope for the
introducing patch.

### Coercion helpers

```ts
function asString(value: unknown): string | null;
function asNumber(value: unknown): number | null;
function fmt(s: string | null): string; // null → '—'
function fmtNum(n: number | null, digits?): string;
```

`asString` decodes `Uint8Array` via `TextDecoder` so proto-decoded
binary fields surface as text. Both helpers tolerate missing values
and snake-case ↔ camelCase variants (`rev_major` and `revMajor` both
resolve).

### Sections

| Section | Fields                                                                             |
| ------- | ---------------------------------------------------------------------------------- |
| Source  | filename, imported timestamp, PROJ used                                            |
| Header  | version, date, district, generation, rev_major, rev_minor, vendor, projection.proj |
| Bounds  | left, top, right, bottom (numeric, 6-digit precision)                              |

A footer note reminds that header editing is gated.

## Examples

### Mounting the sidebar

```tsx
<SidebarPanelContent onOpenSettings={() => setSettingsOpen(true)} />
```

### Building a SchemaForm-driven inspector

```tsx
import { SchemaForm } from '@/components/layout/panels/SchemaForm';
import { CrosswalkInspectorSchema } from '@/types/inspectorSchema';

export function CrosswalkForm({ entity }: { entity: CrosswalkEntity }) {
  return <SchemaForm schema={CrosswalkInspectorSchema} entity={entity} />;
}
```

### Reading outline stats programmatically

```ts
// (No public API — but the helpers can be lifted out for testing)
import { computeStats } from './MapOutline'; // not exported, but trivially extractable
```

For now, the stats are component-local. Promoting `computeStats` to a
`lib/` helper would let CI / scripts audit map health pre-export.

## Related

- [Inspector forms](/api/components/inspector-forms)
- [Layer tree](/api/components/layer-tree)
- [Search panel](/api/components/search-panel)
- [Timeline panel](/api/components/timeline-panel)
- [apolloMapStore](/api/store/apollo-map-store)
- [mapStore](/api/store/store-map)
- [Inspector schema](/api/types/inspector-schema)
