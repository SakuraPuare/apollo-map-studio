---
title: Hooks Index
description: src/hooks/* — one-line summary of every React hook and its role in event routing / layer scheduling
---

# Hooks Index

`src/hooks/` centralises the React 19 + maplibre + XState + Zustand
plumbing. Each hook follows a "subscribe to a store / forward to
maplibre or FSM / expose the smallest controlled API" pattern.

## Top-level

| Hook                  | File                     | Role                                                  |
| --------------------- | ------------------------ | ----------------------------------------------------- |
| `useMapLibreInit`     | `useMapLibreInit.ts`     | Boot the maplibre instance + dark style + base layers |
| `useApolloLayer`      | `useApolloLayer.ts`      | Project `apolloMapStore.rawMap` into a preview source |
| `useColdLayer`        | `useColdLayer.ts`        | Compile `mapStore.entities` into the cold GeoJSON     |
| `useHotLayer`         | `useHotLayer.ts`         | Render FSM in-flight draw / drag preview              |
| `useOverlayLayer`     | `useOverlayLayer.ts`     | Selection, snap indicator, editPoints overlay         |
| `useGridLayer`        | `useGridLayer.ts`        | Adaptive metric reference grid                        |
| `useCursorManager`    | `useCursorManager.ts`    | FSM-driven CSS cursor on the maplibre canvas          |
| `useDragPan`          | `useDragPan.ts`          | Disable maplibre dragPan during entity drag           |
| `useActionDispatcher` | `useActionDispatcher.ts` | Unified entry for undo/redo/delete/tool switch (R1)   |
| `useDrawCommit`       | `useDrawCommit.ts`       | Commit FSM draw state into `mapStore.addEntity`       |
| `useMapEventRouter`   | `useMapEventRouter.ts`   | maplibre events → FSM events, with dblclick dedup     |
| `useLicenseSync`      | `useLicense.ts`          | Sync license bridge state into `licenseStore`         |

## Sub-directories

`src/hooks/mapLibreInit/`:

- `assets.ts` — `EMPTY_FC`, `DARK_STYLE`, `registerRuntimeImages(map)`
- `layers.ts` — `addEditorLayers(map)` registers every cold / hot /
  overlay layer

`src/hooks/mapEventRouter/`:

- `inputDedup.ts` — `sampleInput(e)` and
  `isDuplicateInput(prev, next)` filter duplicate clicks around
  double-click;
- `keyboard.ts` — `handleMapKeyDown(...)` translates keydown to FSM
  events;
- `selectionDrag.ts` — `handleSelectedMouseDown(...)` initiates entity
  drag;
- `cursorScheduler.ts` — `createCursorScheduler()` RAF-coalesces
  cursor changes;
- `connectMode.ts` — `handleConnectModeClick(...)` finalises a
  connect-mode pair on the second click;
- `snap.ts` — `applySnap(...)` projects cursor to a `SnapTarget`;
- `hitTest.ts` — `toLngLat`, `hitBbox`, `pixelToRadius`,
  `workerHitTest`.

## `useActionDispatcher`

```ts
export interface ActionDispatcher {
  dispatch(actionId: ActionId): void;
  undo(): void;
  redo(): void;
  deleteSelected(): void;
  setDrawTool(tool: DrawTool): void;
  cancelFsm(): void;
}

export function useActionDispatcher(options: {
  actorRef: ActorRefFrom<typeof editorMachine>;
}): ActionDispatcher;
```

R1 closure (`useActionDispatcher.ts:76-82`): undo dispatches `CANCEL`
to the FSM before invoking `temporal.undo()`. Without it, mid-draw
rollbacks corrupt FSM `drawPoints`.

## `useDrawCommit`

```ts
export function hasGeometryForState(state): boolean;
export function useDrawCommit(actorRef: ActorRefFrom<typeof editorMachine>): void;
```

Subscribes to FSM transitions and calls `mapStore.addEntity` when a
draw state transitions to `idle`. Reads the **post-transition**
snapshot so the DOUBLE_CLICK `removeLastPoint` guard does not
off-by-one.

## `useColdLayer`

```ts
export function groupFeaturesByEntity(features): Map<string, GeoJSON.Feature[]>;
export function flattenEntityFeatures(/* ... */): GeoJSON.Feature[];
export function diffEntities(prev, next): { added; removed; changed };
export function hasEntityChanges(diff): boolean;
export function useColdLayer(map: maplibregl.Map | null): void;
```

Subscribes to `mapStore.entities`, RAF-coalesces, sends
INCREMENTAL/SYNC to the spatial worker, then applies the returned
cold GeoJSON via `setData`.

## `useHotLayer`

```ts
export type HotRenderState = {
  /* in-flight FSM draw / drag */
};
export function samePoint(a: LngLat | null, b: LngLat | null): boolean;
export function sameHotRenderState(a, b): boolean;
export function useHotLayer(map: maplibregl.Map | null /* ... */): void;
```

Does not go through the worker; mutates `setData` per frame.

## `useOverlayLayer`

```ts
export type OverlayRenderState = {
  /* selection, snap, editPoints */
};
export function buildOverlayFeatures(state: OverlayRenderState): GeoJSON.Feature[];
export function useOverlayLayer(/* ... */): void;
```

## `useGridLayer`

```ts
export function metersForZoom(zoom: number): { step: number; majorEvery: number };
export const MAX_LINES_PER_AXIS: 240;
export function useGridLayer(map: maplibregl.Map | null): void;
```

## `useCursorManager`

```ts
export function cursorForState(currentState: string, connectModeActive?: boolean): string;
export function useCursorManager(/* ... */): void;
```

Maps FSM state name to a CSS cursor (`crosshair`, `grab`, `pointer`,
`not-allowed`…). `connectModeActive` overrides to `pointer`.

## `useDragPan`

```ts
export function shouldDisableDragPan(currentState: string, isDraggingHandle: boolean): boolean;
export function useDragPan(/* ... */): void;
```

Disables maplibre's built-in dragPan while a vertex or whole entity
is being dragged.

## `useMapEventRouter`

```ts
export { isDuplicateInput };
export function useMapEventRouter(/* ... */): void;
```

Translates maplibre mouse / keydown events into FSM events. The
double-click dedup logic uses `isDuplicateInput` over a sliding
sample window.

## `useApolloLayer`

```ts
export function useApolloLayer(map: maplibregl.Map | null): void;
```

Subscribes to `apolloMapStore.rawMap` (imported-but-unedited Apollo
map) and emits a `apollo-base` GeoJSON source for the import
preview layer.

## `useLicenseSync`

```ts
export function useLicenseSync(): void;
```

Mounted on `App.tsx`; pushes Tauri / Web license bridge state into
`licenseStore`.

## Invariants

- Hooks never mutate `mapStore.entities` directly — all writes go via
  `useActionDispatcher` or store actions.
- Hooks assume maplibre is ready (`useMapLibreInit` finished). The
  top-level `App.tsx` gates rendering on that flag.
