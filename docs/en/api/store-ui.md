---
title: Store / UI
description: src/store/uiStore.ts — drawing/scene mode, grid/snap, layer visibility, connect mode, cursor and zoom
---

# Store / UI

`src/store/uiStore.ts` holds the transient UI state for Apollo Map
Studio. It does not persist, does not hook into zundo, and does not
own map entities. For entity state see [Store / Map](/en/api/store-map).

## Exported symbols

```ts
import { create } from 'zustand';
import type { SnapTarget } from '@/core/geometry/snap';

export type AppMode = 'drawing' | 'scene';

interface LayerState {
  visible: boolean;
  locked: boolean;
}

interface UIState {
  appMode: AppMode;
  gridEnabled: boolean;
  snapEnabled: boolean;
  layerStates: Record<string, LayerState>;
  cursorLngLat: [number, number] | null;
  currentZoom: number;
  sidebarVisible: boolean;
  currentSnapTarget: SnapTarget | null;
  connectMode: { active: boolean; firstLaneId: string | null };
}

interface UIActions {
  setAppMode(mode: AppMode): void;
  toggleAppMode(): void;
  toggleGrid(): void;
  toggleSnap(): void;
  setLayerVisible(type: string, visible: boolean): void;
  setLayerLocked(type: string, locked: boolean): void;
  toggleLayerVisible(type: string): void;
  toggleLayerLocked(type: string): void;
  isLayerVisible(type: string): boolean;
  isLayerLocked(type: string): boolean;
  setCursorLngLat(pos: [number, number] | null): void;
  setCurrentZoom(zoom: number): void;
  toggleSidebar(): void;
  setSnapTarget(target: SnapTarget | null): void;
  toggleConnectMode(): void;
  exitConnectMode(): void;
  setConnectFirstLane(id: string | null): void;
}

type UIStore = UIState & UIActions;

export const useUIStore: import('zustand').UseBoundStore<UIStore>;
```

> Source: `src/store/uiStore.ts:29-202`.

## State fields

| Field               | Type                                               | Default                                | Description                     |
| ------------------- | -------------------------------------------------- | -------------------------------------- | ------------------------------- |
| `appMode`           | `'drawing' \| 'scene'`                             | `'drawing'`                            | Top-level mode                  |
| `gridEnabled`       | `boolean`                                          | `true`                                 | Reference grid                  |
| `snapEnabled`       | `boolean`                                          | `false`                                | Snap-while-drawing flag         |
| `layerStates`       | `Record<entityType, { visible, locked }>`          | all visible & unlocked                 | 13 default entity types         |
| `cursorLngLat`      | `[lng, lat] \| null`                               | `null`                                 | Mouse position for footer       |
| `currentZoom`       | `number`                                           | `18`                                   | Maplibre zoom                   |
| `sidebarVisible`    | `boolean`                                          | `true`                                 | Left sidebar visibility         |
| `currentSnapTarget` | `SnapTarget \| null`                               | `null`                                 | Live snap indicator             |
| `connectMode`       | `{ active: boolean; firstLaneId: string \| null }` | `{ active: false, firstLaneId: null }` | Two-click connect-lanes session |

The default `ENTITY_TYPES` array is: `lane`, `junction`,
`parkingSpace`, `signal`, `crosswalk`, `stopSign`, `speedBump`,
`polyline`, `catmullRom`, `bezier`, `arc`, `rect`, `polygon`. Adding a
new entity type does **not** require touching this default — unknown
types fall back to `{ visible: true, locked: false }`.

## Actions

### App mode

```ts
setAppMode(mode: AppMode): void
toggleAppMode(): void
```

### Grid / snap

```ts
toggleGrid(): void
toggleSnap(): void
```

### Layer visibility / lock

```ts
setLayerVisible(type, visible): void
setLayerLocked(type, locked): void
toggleLayerVisible(type): void
toggleLayerLocked(type): void
isLayerVisible(type): boolean    // unregistered → true
isLayerLocked(type): boolean     // unregistered → false
```

### Viewport telemetry

```ts
setCursorLngLat(pos): void
setCurrentZoom(zoom): number
```

`useMapEventRouter` calls these on `mousemove` and `zoom` events.

### Sidebar

```ts
toggleSidebar(): void
```

### Snap target

```ts
setSnapTarget(target: SnapTarget | null): void
```

Dedups against the previous target on `kind / entityId / point.x /
point.y`, so 60-fps mousemove ticks do not churn React subscribers.

### Connect mode

```ts
toggleConnectMode(): void
exitConnectMode(): void
setConnectFirstLane(id: string | null): void
```

Workflow:

1. `toggleConnectMode()` enters the mode and clears `firstLaneId`.
2. First lane click → `setConnectFirstLane(id)`.
3. Second lane click → `mapEventRouter.connectMode.handle` runs
   `planConnection` + `applyLaneConnection`, then calls
   `exitConnectMode()`.
4. ESC or a second toggle calls `exitConnectMode()` from any state.

## Usage patterns

```ts
// React (preferred)
const gridEnabled = useUIStore((s) => s.gridEnabled);
const toggleGrid = useUIStore((s) => s.toggleGrid);

// Non-React snapshot
const isLocked = useUIStore.getState().isLayerLocked('lane');

// Multi-field with shallow comparison
import { useShallow } from 'zustand/react/shallow';
const [zoom, cursor] = useUIStore(useShallow((s) => [s.currentZoom, s.cursorLngLat]));
```

## Invariants

- `layerStates` reference stability: setters return a new outer object
  only for the toggled key, so `useShallow` selectors keep their
  reference for unrelated layers.
- `connectMode.firstLaneId` is only meaningful when
  `connectMode.active === true`. UI must respect this when rendering
  affordances.
- `currentSnapTarget === oldTarget` (after dedup) implies no
  geometric change — subscribers can short-circuit.

## What is not in this store

- Selection state — held by the `editorMachine` XState actor;
- Hover state — hot/overlay layer locals;
- Persistent prefs (history limit, lane half width) —
  `settingsStore`.

## See also

- [Store / Map](/en/api/store-map) — the entity-state layer.
- `src/core/geometry/snap.ts` — `SnapTarget` shape.
- `src/components/layout/WorkspaceLayout.tsx` — wires sidebar and
  panel toggles into the menu/keybinding system.
