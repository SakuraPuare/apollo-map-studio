---
title: useCursorManager
description: Picks the MapLibre canvas CSS cursor from FSM state and connect-mode — crosshair / grabbing / default.
---

# useCursorManager

> Source: `src/hooks/useCursorManager.ts`

`useCursorManager` decides what `style.cursor` the MapLibre canvas
shows. The policy is simple but couples to multiple state sources:

- `connectMode.active` wins → `crosshair`
- Otherwise `editingPoint` → `grabbing`
- Otherwise `isDrawingState(currentState)` → `crosshair`
- Otherwise `''` (let MapLibre handle hover / grab itself)

It exists so cursor changes are decoupled from FSM transitions: no
event handler needs `canvas.style.cursor = ...`.

## Relationship with useDragPan

`useCursorManager` and [`useDragPan`](./use-drag-pan.md) both gate on
FSM state, but they manage different dimensions:

- cursorManager — only writes `canvas.style.cursor`
- dragPan — only flips `map.dragPan.disable / enable`

They subscribe to the same actor but don't depend on each other. The
two were once merged in a single hook, but cursor must also respond to
connectMode (uiStore) and dragPan must also respond to
`isDraggingHandle` (FSM context). The overlap was inconsistent enough
to justify splitting them.

## Cursor matrix

| FSM state          | connectMode | hot-points hit | Effective cursor | Writer                               |
| ------------------ | ----------- | -------------- | ---------------- | ------------------------------------ |
| `idle`             | false       | —              | `''` (default)   | `useCursorManager`                   |
| `idle`             | true        | —              | `crosshair`      | `useCursorManager`                   |
| `selected`         | false       | no             | `''`             | router writes empty                  |
| `selected`         | false       | yes            | `grab`           | `useMapEventRouter.onMouseMove`      |
| `selected`         | true        | —              | `crosshair`      | `useCursorManager` (higher priority) |
| `editingPoint`     | —           | —              | `grabbing`       | `useCursorManager`                   |
| `drawPolyline` etc | false       | —              | `crosshair`      | `useCursorManager`                   |

## Design retrospective

Historically several hooks wrote the cursor — router on hover, layer
hooks on load completion, cursorManager on FSM transitions. Result: the
cursor occasionally got clobbered at the wrong moment. After the early-
2025 P9 refactor the policy converged on:

1. `useCursorManager` is the default writer.
2. `useMapEventRouter` only writes `'grab'` / `''` while `selected`,
   based on a per-pixel query — overriding cursorManager's `''`
   (does not affect other states).
3. No third-party writers.

## Trigger frequency

`actorRef.subscribe` fires on every FSM transition; `useUIStore.subscribe`
only schedules when `connectMode.active` actually flips. `applyCursor`
reads a snapshot + store state and writes a cursor string; total cost
is < 10μs per call — a cheap operation.

## Detail: why `''`

`canvas.style.cursor = ''` is equivalent to "remove the inline style",
which lets MapLibre take over and use its own cursor logic. It is not
the same as `'auto'` / `'default'`:

- `'auto'` — browser decides; usually arrow, but can switch to `pointer`
  for images / links.
- `'default'` — forces arrow, overriding MapLibre's `grab`.
- `''` — removes the property; MapLibre takes over, switching grab /
  grabbing as panning starts.

## Why this hook exists

- **Avoid sprawl**: an earlier version had multiple hooks fighting over
  `canvas.style.cursor`.
- **Clear priority**: connect-mode is a UI-level modal that lives above
  the FSM, so it must come first.
- **Don't fight MapLibre's built-in hover**: the fallback returns `''`
  rather than `'default'` so MapLibre can take over (e.g. hovering over
  a draggable feature → `grab`).

## Signature

```ts
function useCursorManager(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
): void;

export function cursorForState(currentState: string, connectModeActive?: boolean): string;
```

## Parameters

| Name       | Type                                 | Role               |
| ---------- | ------------------------------------ | ------------------ |
| `mapRef`   | `RefObject<maplibregl.Map \| null>`  | MapLibre instance. |
| `actorRef` | `ActorRefFrom<typeof editorMachine>` | FSM actor.         |

## Side effects

| Effect                            | Trigger                                          | Cleanup                      |
| --------------------------------- | ------------------------------------------------ | ---------------------------- |
| `canvas.style.cursor = ...`       | Mount + actor / connectMode change               | —                            |
| `actorRef.subscribe(applyCursor)` | Mount                                            | `subscription.unsubscribe()` |
| `useUIStore.subscribe(...)`       | Mount; apply only on `connectMode.active` change | Returned unsub               |

## `cursorForState` logic

```ts
// useCursorManager.ts:8-15
export function cursorForState(currentState: string, connectModeActive = false): string {
  if (connectModeActive) return 'crosshair';
  if (currentState === 'editingPoint') return 'grabbing';
  if (isDrawingState(currentState)) return 'crosshair';
  return '';
}
```

| FSM state                                     | connectMode | Return        |
| --------------------------------------------- | ----------- | ------------- |
| Any                                           | `true`      | `'crosshair'` |
| `editingPoint`                                | `false`     | `'grabbing'`  |
| `drawPolyline` / `drawArc` / `drawBezier` / … | `false`     | `'crosshair'` |
| `idle` / `selected`                           | `false`     | `''`          |

## Lifecycle

```
mount
  ├── canvas = mapRef.current.getCanvas()
  ├── if !canvas: return
  ├── applyCursor() — write once with the current snapshot + uiStore
  ├── subscribe(actorRef, applyCursor)
  └── subscribe(useUIStore, prev/next: applyCursor on connectMode.active change)

unmount
  ├── actorSubscription.unsubscribe()
  └── unsubUI()
```

## Invariants

### connectMode wins over FSM

```ts
// useCursorManager.ts:11
if (connectModeActive) return 'crosshair';
```

connect-mode is a UI-level modal — even when the FSM is `selected`
(after the first lane click triggers SELECT_ENTITY), the cursor must
stay crosshair to advertise "pick the second lane".

### Default is empty string, not `'default'`

```ts
// useCursorManager.ts:14
return '';
```

`''` is "reset", letting MapLibre choose based on hover state (`grab`
on pannable area, `grabbing` while dragging). `'default'` would
override that.

### `selected` cursor is owned by the router

`useCursorManager` does not handle `selected`. When the user hovers
hot-points, `useMapEventRouter.onMouseMove` writes
`canvas.style.cursor = 'grab'` directly
(`useMapEventRouter.ts:137`).

That's a deliberate split — moving `selected` here would require
subscribing to mapStore and recomputing hot hits, not worth the
complexity.

## Call site

```tsx
// src/components/map/MapCanvas.tsx:42
useCursorManager(mapRef, actorRef);
```

## Failure modes

| Symptom                                   | Root cause                                                                   | Fix                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Cursor still default in connect-mode      | UI called `useUIStore.toggleConnectMode` but the store didn't emit prev≠next | Verify the store setter actually changed `connectMode.active` |
| Cursor doesn't switch to grabbing on drag | Never entered `editingPoint`                                                 | See router's `START_DRAG` path                                |
| Cursor stays crosshair after exiting draw | actor.subscribe missed the idle transition                                   | Should not happen — `applyCursor` runs on every actor change  |

## Tests

- `src/hooks/__tests__/useCursorManager.test.ts` — `cursorForState` truth table

## See also

- [`useMapEventRouter`](./use-map-event-router.md) (hot-points hover → `grab`)
- [`useDragPan`](./use-drag-pan.md) (disables MapLibre pan during drag)
- [Editor Machine](../core/editor-machine.md)
- [`uiStore.connectMode`](../store/store-ui.md)

## Boundary with the router's hover path

`useMapEventRouter.onMouseMove` (lines 135-143), inside the `selected`
state, runs a hot-points hit-test:

```ts
if (state === 'selected') {
  const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
  map.getCanvas().style.cursor = hotHits.length > 0 ? 'grab' : '';
  // ...
}
```

It writes the cursor directly because `cursorForState` has no
"hovering hot-points" dimension — that's a pixel query result depending
on mapStore + queryRenderedFeatures, outside the pure-function scope of
`cursorForState`.

Boundaries:

- `useCursorManager` — global cursor based on FSM / connect-mode
- `useMapEventRouter` — transient cursor override based on per-pixel
  hover results

Both write to the same `canvas.style.cursor`. Priority is router → cursorManager
(the router's mousemove fires more often, and "last write wins"). In
`selected`, that's exactly the desired behaviour: the FSM doesn't move,
the hover decides the cursor.

## Browser fallback

`return ''` hands control back to MapLibre, which gives:

- Pannable area + idle → `''` (default arrow)
- mousedown + drag → `grab` / `grabbing` (MapLibre's built-in dragPan
  handler writes them)

When dragPan is disabled by [`useDragPan`](./use-drag-pan.md), pan
behaviour is gone and the canvas stays at `''`, which looks like a
normal cursor — the expected appearance during `editingPoint` /
`drawBezier`.

## Source map

| Concern                          | Lines                       |
| -------------------------------- | --------------------------- |
| `cursorForState`                 | `useCursorManager.ts:8-15`  |
| `applyCursor`                    | `useCursorManager.ts:25-30` |
| Subscriptions to actor + uiStore | `useCursorManager.ts:33-36` |
| cleanup                          | `useCursorManager.ts:38-41` |
