---
title: LaneRefList
description: Clickable lane-id pill list used inside the inspector — routes navigation through the SELECT_ENTITY FSM event, auto-detects dangling references, and disables their buttons.
---

# LaneRefList

> Source: `src/components/layout/panels/LaneRefList.tsx`

## Purpose & UX role

`LaneRefList` upgrades fields like "successors / predecessors / leftNeighbors / rightNeighbors" from a flat number ("Successors: 1") to a **clickable pill list**. Each pill:

- Shows the last 6 characters of the lane id (so it never overflows the inspector).
- Carries a `title` tooltip with the full id.
- Click fires `actorRef.send({ type: 'SELECT_ENTITY', id })` — taking the **same code path as a canvas click**, which keeps the store state, inspector remount, and layer-tree highlight consistent.
- A dangling target (deleted lane) is rendered as a struck-through grey pill that cannot be clicked.

It is **reused** across InspectorForms — `LaneForm` invokes it via `LaneInspectorSchema.readonly` with `compute(entity) => <LaneRefList ids={…} />`.

## Component API

```ts
interface LaneRefListProps {
  ids: readonly string[];
  short?: boolean; // default true: show only the last 6 chars
}

export function LaneRefList(props: LaneRefListProps): JSX.Element;

// Single-id variant
export function LaneRef({ id }: { id: string | null | undefined }): JSX.Element;
```

| Prop    | Type                | Default | Description                                           |
| ------- | ------------------- | ------- | ----------------------------------------------------- |
| `ids`   | `readonly string[]` | —       | Lane ids to display.                                  |
| `short` | `boolean`           | `true`  | Whether to show only the last 6 characters (no wrap). |

`LaneRef` wraps `LaneRefList` for "at most one" fields like `junctionId`.

## Internal state

| Hook                              | Purpose                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useEditorActor()`                | Grabs the XState actor in order to dispatch `SELECT_ENTITY`.                                                                                               |
| `useMapStore.getState().entities` | **Synchronous, unsubscribed** lookup at click / render to decide whether the target exists; deliberately does not subscribe to avoid cascading re-renders. |

::: warning Design tradeoff
`useMapStore.getState()` is **not** a subscription. If a lane id is deleted elsewhere, `LaneRefList` will not automatically re-render to update its "disabled" state — that only happens when the `ids` prop changes. This is **intentional**: subscribing here would force every LaneRefList in the inspector to re-render on every store change. The parent `InspectorForms` re-renders the whole panel on entity update, which refreshes everything in practice.
:::

## Side effects

None. `onClick` fires the FSM event via `useEditorActor().send`.

## Render anatomy

Empty list:

```jsx
<span className="text-zinc-500">—</span>
```

Non-empty:

```jsx
<div className="flex flex-wrap gap-1">
  {ids.map((id) => (
    <button
      onClick={() => handleClick(id)}
      disabled={!exists}
      title={id}
      className={cn(
        'px-1.5 py-0.5 rounded font-mono text-[10px] leading-none border transition-colors',
        exists
          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 cursor-pointer'
          : 'border-white/5 bg-zinc-800/40 text-zinc-500 cursor-not-allowed line-through',
      )}
    >
      {short && id.length > 12 ? `…${id.slice(-6)}` : id}
    </button>
  ))}
</div>
```

## Performance notes

- **Lightweight component**: a typical lane's successors/predecessors are ≤ 4 — no virtualization needed.
- **Closure-per-click**: a fresh closure per render is fine; children are not memoized.
- **No store subscription**: a deliberate optimization (see warning above).

## Known constraints

- After a target lane is deleted, the UI continues to show the disabled pill until the inspector re-renders because the parent entity changed. In practice the deletion cascades through reconcile, which updates the current lane's successors list within the same tick, so users do not see the stale pill.
- No reverse-reference navigation ("who lists me in successors?") — that would require a full-graph scan and is out of scope here.

## Source map

| Concern             | File location                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| Main `LaneRefList`  | `LaneRefList.tsx:20-58`                                                       |
| Single-id `LaneRef` | `LaneRefList.tsx:65-68`                                                       |
| `useEditorActor`    | `src/context/EditorContext.tsx`                                               |
| Schema usage        | `src/types/inspectorSchema.ts` (lane successors / predecessors readonly defs) |

## Cross-references

- [InspectorForms](./inspector-forms.md) — caller
- [`editorMachine`](/en/api/core/) — `SELECT_ENTITY` event
- [`mapStore`](/en/api/store/store-map) — `entities` lookup
