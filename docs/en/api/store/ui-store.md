# Store / uiStore

Source: `src/store/uiStore.ts`.

`uiStore` holds session UX preferences that should NOT be in history:
viewport state, layer visibility, snap toggles, app-mode switch, and
connect-mode bookkeeping. Mutations bypass `zundo` entirely so a user
can toggle a layer without burning an undo step.

See [/api/store/store-ui](/en/api/store/store-ui) for the legacy
compatibility entry.

## State Shape

```ts
type AppMode = 'drawing' | 'scene';

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
```

`layerStates` is initialised with one entry per
`'lane' | 'junction' | 'parkingSpace' | 'signal' | 'crosswalk' |
'stopSign' | 'speedBump' | 'polyline' | 'catmullRom' | 'bezier' | 'arc' |
'rect' | 'polygon'`, all `{ visible: true, locked: false }`.

## Actions

```ts
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
```

### Snap-target identity guard

`setSnapTarget` short-circuits when the new target is structurally
equal to the current one (same `kind` + `entityId` + `point.x` /
`point.y`). The overlay layer subscribes to this slice and the guard
prevents a render every mousemove.

### Connect mode

A two-click flow used to wire two lane endpoints together:

1. `toggleConnectMode()` activates and clears `firstLaneId`.
2. The first lane click calls `setConnectFirstLane(id)`.
3. The second lane click commits and `exitConnectMode()` resets.

ESC anywhere triggers `exitConnectMode()` so the user is never stuck.

## Examples

```ts
// Toggle a layer's visibility from the layers panel
useUIStore.getState().toggleLayerVisible('lane');

// Read current cursor in a component
const cursor = useUIStore((s) => s.cursorLngLat);

// Enter connect mode
useUIStore.getState().toggleConnectMode();
```

## Related

- [/api/store/map-store](/en/api/store/map-store) — undoable counterpart.
- [/api/store/settings-store](/en/api/store/settings-store) — persisted
  scalar preferences.
- [/api/core/geometry/snap](/en/api/core/geometry/snap) — `SnapTarget`
  type.
