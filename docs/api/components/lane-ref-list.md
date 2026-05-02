# LaneRefList

> Source: `src/components/layout/panels/LaneRefList.tsx`

## Overview

`LaneRefList` is a small clickable display component used inside the
Inspector and other panels to render a list of lane (or other entity)
ID references. Each ID becomes a navigable pill — clicking it sends
`SELECT_ENTITY` to the editor FSM, switching the canvas + inspector
to that entity. Missing references render disabled and struck-through
so the user can see broken FK pointers at a glance.

A single-id companion `<LaneRef>` covers cases like `junctionId` where
one optional reference needs the same pill treatment.

## Component props

```ts
interface LaneRefListProps {
  ids: readonly string[];
  /** Show short prefix only (e.g. last 6 chars) to avoid wrapping the row. */
  short?: boolean; // default true
}

export function LaneRefList(props: LaneRefListProps): JSX.Element;
export function LaneRef(props: { id: string | null | undefined }): JSX.Element;
```

| Prop    | Default  | Notes                                                        |
| ------- | -------- | ------------------------------------------------------------ |
| `ids`   | required | Empty array renders an em-dash placeholder                   |
| `short` | `true`   | Truncates to `…last 6 chars` for display when id length > 12 |

## Behavior

### Click navigation

```tsx
const handleClick = (id: string) => {
  if (!useMapStore.getState().entities.has(id)) return;
  actorRef.send({ type: 'SELECT_ENTITY', id });
};
```

Clicks go through the same FSM event as a canvas click or a layer
tree click, so selection state, inspector mount, and any side
effects all match.

### Existence check

```tsx
const exists = useMapStore.getState().entities.has(id);
```

Each pill checks whether the referenced id resolves. Non-existent
ids render with:

- Strike-through line.
- Greyed-out border / fill.
- `cursor-not-allowed`.
- `disabled` attribute on the button.

This makes broken successor / predecessor links visible without
needing to leave the inspector to verify.

### Display truncation

```tsx
const display = short && id.length > 12 ? `…${id.slice(-6)}` : id;
```

| `short` | Length | Render                   |
| ------- | ------ | ------------------------ |
| true    | ≤ 12   | full id                  |
| true    | > 12   | `…XXXXXX` (last 6 chars) |
| false   | any    | full id                  |

`title={id}` on every pill so the full id appears on hover regardless.

### Empty / single

`<LaneRefList ids={[]} />` renders an em-dash:

```tsx
<span className="text-zinc-500">—</span>
```

`<LaneRef id={null} />` does the same; passing a string delegates to
`<LaneRefList ids={[id]} />`.

### Visual state

```tsx
className={clsx(
  'px-1.5 py-0.5 rounded font-mono text-[10px] leading-none',
  'border transition-colors',
  exists
    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 cursor-pointer'
    : 'border-white/5 bg-zinc-800/40 text-zinc-500 cursor-not-allowed line-through',
)}
```

Cyan family for the existing case, neutral grey + strike-through for
broken refs.

## Examples

### Lane successors / predecessors in the inspector

```tsx
<Section title="Topology">
  <Value label="Successors" value={<LaneRefList ids={lane.successorIds} />} />
  <Value label="Predecessors" value={<LaneRefList ids={lane.predecessorIds} />} />
  <Value label="Junction" value={<LaneRef id={lane.junctionId} />} />
</Section>
```

### Showing a single optional id

```tsx
<LaneRef id={road.junctionId} /> // renders "—" when null
```

### Reading the FSM context after a click

```ts
import { useEditorActor } from '@/context/EditorContext';
const actorRef = useEditorActor();
useEffect(() => {
  const sub = actorRef.subscribe((s) => {
    console.log('selected:', s.context.selectedEntityId);
  });
  return () => sub.unsubscribe();
}, []);
```

## Related

- [editorMachine FSM](/api/core/editor-machine) — `SELECT_ENTITY` event
- [Inspector forms](/api/components/inspector-forms)
- [mapStore.entities](/api/store/store-map)
- [EditorContext](/api/context/editor-context)
