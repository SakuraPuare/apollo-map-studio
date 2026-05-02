---
title: useMapEventRouter
description: Routes MapLibre pointer / keyboard / zoom events to high-level actions (START_DRAG / SELECT_ENTITY / MOUSE_DOWN / DOUBLE_CLICK …) based on FSM state; centralises connect-mode, snap, dblclick dedup, and cursor throttling.
---

# useMapEventRouter

> Source: `src/hooks/useMapEventRouter.ts` · Submodules: [Map Event Router internals](./map-event-router-internals.md)

`useMapEventRouter` is Apollo Map Studio's primary input router. It
mounts once inside `MapCanvas` and dispatches every pointer / keyboard /
zoom event from the `maplibregl.Map` instance to high-level actions
based on the current FSM state:

- **`drawBezier` & other drawing states**: `mousedown` / `click` /
  `mousemove` → `MOUSE_DOWN` / `MOUSE_MOVE`, with `isDuplicateInput`
  swallowing the synthetic click that a dblclick generates.
- **`selected`**: delegates to `handleSelectedMouseDown` for
  `START_DRAG` decisions; non-handle clicks go through hit-test →
  `SELECT_ENTITY` / `DESELECT`.
- **`editingPoint`**: mousemove → `DRAG_MOVE`; mouseup → `updateEntity`
  - `DRAG_END`; center drag uses `centerGrabOffset` to lock the cursor-
    to-center delta.
- **`idle`**: click hit-test → `SELECT_ENTITY` if hit; mousemove only
  updates cursor and snap target.
- **connect-mode**: intercepts click via `handleConnectModeClick`.
- **Keyboard**: `Escape` / `Enter` / `Delete` go through
  `handleMapKeyDown`.
- **zoomend**: writes `useUIStore.setCurrentZoom`, driving status bar
  and grid recompute.

Each path's implementation is split into the `mapEventRouter/`
submodules; this hook is **dispatch-only**.

## Design goals

- **State-driven**: `actorRef.getSnapshot().value` is the single source
  of routing decisions — no scattered ifs in event handlers.
- **Click dedup**: a `mousedown` + `dblclick` pair in MapLibre yields a
  synthetic `click`; `isDuplicateInput` filters via px+ms windows.
- **Drag/edit isolation**: `editingPoint` short-circuits other paths to
  prevent selection logic from stealing pointer events.

## Signature

```ts
function useMapEventRouter(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
): void;

export { isDuplicateInput };
```

## Parameters

| Name        | Type                                     | Role                                                                |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------- |
| `mapRef`    | `RefObject<maplibregl.Map \| null>`      | MapLibre instance.                                                  |
| `actorRef`  | `ActorRefFrom<typeof editorMachine>`     | FSM actor.                                                          |
| `bridgeRef` | `RefObject<SpatialWorkerBridge \| null>` | Spatial worker bridge; `workerHitTest` sends `HIT_TEST` through it. |

## Side effects

| Effect                                                                                  | Trigger                                      | Cleanup                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------- |
| `map.on('mousedown' / 'click' / 'mousemove' / 'mouseup' / 'dblclick' / 'zoomend', ...)` | Mount                                        | Symmetric `map.off(...)`      |
| `window.addEventListener('keydown', onKeyDown)`                                         | Mount                                        | `removeEventListener`         |
| `useUIStore.subscribe(...)` watching `snapEnabled` flips                                | Mount                                        | Returned `unsubSnap()`        |
| `cursorScheduler.dispose()`                                                             | Unmount                                      | —                             |
| `bridge.send({ type: 'HIT_TEST' })`                                                     | `hitTest()` (idle / selected / connect mode) | Promise drops stale responses |
| `useUIStore.getState().setSnapTarget(...)`                                              | Inside `applySnap`                           | —                             |
| `map.dragPan.disable() / enable()`                                                      | START_DRAG / DRAG_END                        | —                             |
| `useMapStore.getState().updateEntity(...)`                                              | `mouseup` commit                             | —                             |

## Routing table

| FSM state           | Event                    | Action                                                                |
| ------------------- | ------------------------ | --------------------------------------------------------------------- |
| `selected`          | `mousedown` (hot-points) | `handleSelectedMouseDown` → `START_DRAG` or `TOGGLE_SMOOTH`           |
| `selected`          | `mousedown` (hot-fill)   | Computes `centerGrabOffset` → `START_DRAG{ index:-2, type:'center' }` |
| `selected`          | `click` (hot-points)     | Skipped (don't steal drag)                                            |
| `selected`          | `click` (other)          | hitTest → `SELECT_ENTITY` or `DESELECT`                               |
| `selected`          | `mousemove`              | Maintains cursor `grab` / clears snap target                          |
| `idle`              | `click`                  | hitTest → `SELECT_ENTITY` or stay idle                                |
| `idle`              | `mousemove`              | Only clears snap target                                               |
| `editingPoint`      | `mousemove`              | applySnap (excludeId) → `DRAG_MOVE`                                   |
| `editingPoint`      | `mouseup`                | applySnap → updateEntity + `DRAG_END`                                 |
| `editingPoint`      | `mousedown`              | Short-circuit (no nested drag)                                        |
| `drawBezier`        | `mousedown`              | dedup → applySnap → `MOUSE_DOWN`                                      |
| Other draw          | `click`                  | dedup → applySnap → `MOUSE_DOWN`                                      |
| Any                 | `mousemove`              | applySnap → `MOUSE_MOVE`                                              |
| Any                 | `dblclick`               | applySnap → `DOUBLE_CLICK` (clears `lastDrawInput`)                   |
| Any                 | `keydown`                | `handleMapKeyDown` (Esc / Enter / Del / Backspace)                    |
| Any                 | `zoomend`                | `setCurrentZoom(map.getZoom())`                                       |
| connect-mode active | `click`                  | `handleConnectModeClick` intercepts                                   |

## Dblclick dedup

```mermaid
sequenceDiagram
    participant User
    participant Map as maplibre
    participant Router as useMapEventRouter
    participant FSM

    User->>Map: dblclick
    Map->>Router: mousedown #1
    Router->>Router: sample = {x,y,ts}; not dup → emit MOUSE_DOWN
    Map->>Router: click #1 (synthetic)
    Note over Router: state !== 'drawBezier'<br/>isDuplicateInput(prev, sample)?
    Router-->>Map: true → swallow
    Map->>Router: mousedown #2
    Router-->>Map: dedup window holds → swallow<br/>(still updates lastDrawInput)
    Map->>Router: dblclick
    Router->>Router: lastDrawInput = null
    Router->>FSM: send DOUBLE_CLICK
```

`isDuplicateInput` (`mapEventRouter/inputDedup.ts`) uses px<4 + ms<350
windows. It must update `lastDrawInput` immediately after each handled
`mousedown` / `click` so the next dblclick's synthetic click is rejected
correctly.

## Click distance threshold

```ts
// useMapEventRouter.ts:67-69
if (mouseDownScreenPos) {
  const dx = e.point.x - mouseDownScreenPos.x;
  const dy = e.point.y - mouseDownScreenPos.y;
  if (Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) return;
}
```

When the cursor moves significantly between mousedown and mouseup
(panning), `click` should not route to selection. This kills the
"select while panning" UX bug.

## connect-mode priority

```ts
// useMapEventRouter.ts:72
if (handleConnectModeClick(actorRef, hitTest, e)) return;
```

`handleConnectModeClick` checks `useUIStore.connectMode.active`. While
active it eats every click for lane connection; later branches never
fire.

## Keyboard

`handleMapKeyDown` covers:

- `Escape` — exit connect-mode + `CANCEL`
- `Enter` — `CONFIRM`
- `Delete` / `Backspace` — in `selected`: vertex deletes a point
  (entity preserved); otherwise `DELETE_ENTITY` + `removeEntity`

## Center grab offset

```ts
// useMapEventRouter.ts:117-130
if (state === 'editingPoint') {
  const excludeId = snap.context.selectedEntityId ?? null;
  let pt = applySnap(toLngLat(e), excludeId);
  if (snap.context.dragPointType === 'center' && centerGrabOffset) {
    pt = [pt[0] - centerGrabOffset[0], pt[1] - centerGrabOffset[1]];
  }
  actorRef.send({ type: 'DRAG_MOVE', point: pt });
  return;
}
```

`centerGrabOffset` is captured at drag-start as the lng/lat difference
between the pointer and the entity center. Subtracting it on each
mousemove keeps the grabbed point glued to the cursor instead of
snapping the centroid under it.

## Call site

```tsx
// src/components/map/MapCanvas.tsx:36
useMapEventRouter(mapRef, actorRef, bridgeRef);
```

`MapCanvas` is the only caller.

## Failure modes

| Symptom                                     | Root cause                                                          | Fix                                                 |
| ------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Dblclick fires a stray `MOUSE_DOWN`         | `isDuplicateInput` thresholds too strict                            | Tune `DBLCLICK_PX_TOLERANCE` / `DBLCLICK_MS_WINDOW` |
| Click on empty area still selects an entity | `idle` branch's hitTest sees `current.value !== 'idle'` after async | See lines 96-103 — the value guard before sending   |
| Selecting after a pan                       | `CLICK_THRESHOLD_PX` too low                                        | See `config/mapConstants.ts`                        |
| Esc fails to exit connect-mode              | `handleMapKeyDown` missing `exitConnectMode`                        | See `mapEventRouter/keyboard.ts`                    |
| dragPan not disabled during drag            | `useDragPan` not mounted                                            | See [`useDragPan`](./use-drag-pan.md)               |

## Tests

- `src/hooks/__tests__/useMapEventRouter.test.ts`
- `src/components/map/__tests__/entityMutations.test.ts` — pure-function
  layer that mouseup ultimately writes through

## See also

- [Map Event Router internals](./map-event-router-internals.md)
- [`useDrawCommit`](./use-draw-commit.md)
- [`useCursorManager`](./use-cursor-manager.md)
- [`useDragPan`](./use-drag-pan.md)
- [`SpatialWorkerBridge`](../core/spatial-bridge.md)

## Performance notes

- `cursorScheduler` coalesces 60Hz `mousemove` into one RAF flush —
  prevents store-write churn from jittering map render.
- `applySnap` runs on every mousemove, but its internal
  `findSnapTarget` uses an RBush index + radius filter, so it stays
  O(log n + k).
- `workerHitTest` is an async promise; click paths in the same frame
  are gated on `current.value === 'idle' / 'selected'` so stale
  responses don't fire SELECT_ENTITY.
- The dblclick dedup window is intentionally tight; if a user has a
  slow trackpad, raising `DBLCLICK_MS_WINDOW` is the right knob.

## Boundaries with sibling hooks

| Concern                          | Owning hook                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| Dispatching FSM events           | useMapEventRouter                                                     |
| Persisting entities              | useDrawCommit                                                         |
| Canvas cursor                    | useCursorManager (the router still writes `grab` on hot-points hover) |
| dragPan disable/enable           | useDragPan (the router also disables once as a backstop)              |
| FSM → cold/hot/overlay rendering | useColdLayer / useHotLayer / useOverlayLayer                          |
| store ↔ FSM                      | `actorRef.send` / `subscribe`                                         |

## Source map

| Concern                            | Lines                          |
| ---------------------------------- | ------------------------------ |
| Closure-scoped state               | `useMapEventRouter.ts:29-39`   |
| `onMouseDown` routing              | `useMapEventRouter.ts:41-63`   |
| Click distance threshold           | `useMapEventRouter.ts:65-69`   |
| connect-mode priority              | `useMapEventRouter.ts:72`      |
| `idle` / `selected` click branches | `useMapEventRouter.ts:74-104`  |
| `onMouseMove` three branches       | `useMapEventRouter.ts:117-153` |
| `onMouseUp` commit                 | `useMapEventRouter.ts:155-184` |
| `onDblClick`                       | `useMapEventRouter.ts:186-190` |
| `onKeyDown` delegation             | `useMapEventRouter.ts:192-196` |
| `zoomend` sync                     | `useMapEventRouter.ts:198-201` |
| Event subscription + cleanup       | `useMapEventRouter.ts:205-231` |
