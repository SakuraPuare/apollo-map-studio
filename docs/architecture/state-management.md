# State Management

The editor uses two Zustand stores with clear separation of concerns.

## mapStore

`src/store/mapStore.ts` — owns all map content. Wrapped with `immer` for mutation-style updates and `zundo` (temporal middleware) for undo/redo.

```
temporal(
  immer(
    (set) => ({ ... })
  )
)
```

### State shape

```ts
interface MapState {
  project: ProjectConfig | null

  // Element collections (keyed by ID)
  lanes: Record<string, LaneFeature>
  junctions: Record<string, JunctionFeature>
  signals: Record<string, SignalFeature>
  stopSigns: Record<string, StopSignFeature>
  crosswalks: Record<string, CrosswalkFeature>
  clearAreas: Record<string, ClearAreaFeature>
  speedBumps: Record<string, SpeedBumpFeature>
  parkingSpaces: Record<string, ParkingSpaceFeature>
}
```

### Actions

| Action                                      | Description                                               |
| ------------------------------------------- | --------------------------------------------------------- |
| `setProject(config)`                        | Set project name, origin coordinates, version, date       |
| `addElement(element)`                       | Add any `MapElement`; merges default lane props for lanes |
| `updateElement(element)`                    | Partial-update an existing element by ID + type           |
| `removeElement(id, type)`                   | Delete element; cleans up cross-references in other lanes |
| `connectLanes(fromId, toId)`                | Bidirectional successor/predecessor link                  |
| `setLaneNeighbor(laneId, neighborId, side)` | Bidirectional left/right neighbor link                    |
| `clear()`                                   | Reset all collections to empty                            |
| `loadState(partial)`                        | Bulk-assign state (used by import)                        |

### Default lane properties

`addElement` for lanes applies these defaults before merging the provided data:

```ts
{
  width: 3.75,
  speedLimit: 13.89,          // 50 km/h
  laneType: LaneType.CITY_DRIVING,
  turn: LaneTurn.NO_TURN,
  direction: LaneDirection.FORWARD,
  leftBoundaryType: BoundaryType.DOTTED_WHITE,
  rightBoundaryType: BoundaryType.DOTTED_WHITE,
  predecessorIds: [],
  successorIds: [],
  leftNeighborIds: [],
  rightNeighborIds: [],
}
```

### Undo / Redo

`zundo` wraps the entire store in a temporal history. The `StatusBar` component exposes:

```ts
const { undo, redo, pastStates, futureStates } = useTemporalMapStore()
```

Every call to `set()` inside any action creates a new snapshot. The history is stored in-memory (no persistence between page reloads).

### removeElement cascade

When a lane is deleted, `removeElement` iterates all remaining lanes and removes the deleted ID from every `predecessorIds`, `successorIds`, `leftNeighborIds`, and `rightNeighborIds` array. This prevents dangling references in the topology.

---

## uiStore

`src/store/uiStore.ts` — owns transient UI state. Not wrapped with temporal (UI changes are not undoable).

### State shape

```ts
interface UIState {
  drawMode: DrawMode // current draw tool
  selectedIds: string[] // IDs of selected elements
  hoveredId: string | null // ID under cursor
  connectFromId: string | null // first lane in a connect-lanes operation
  layerVisibility: Record<string, boolean>
  statusMessage: string

  showNewProjectDialog: boolean
  showExportDialog: boolean
  showImportDialog: boolean
}
```

### Draw modes

```ts
type DrawMode =
  | 'select'
  | 'draw_lane'
  | 'draw_junction'
  | 'draw_crosswalk'
  | 'draw_clear_area'
  | 'draw_speed_bump'
  | 'draw_parking_space'
  | 'draw_signal'
  | 'draw_stop_sign'
  | 'connect_lanes'
```

Switching draw mode resets `connectFromId` to `null`.

### Layer visibility

The `layerVisibility` record controls MapLibre layer visibility. Default state:

```ts
{
  lanes: true, boundaries: true, junctions: true,
  signals: true, crosswalks: true, stopSigns: true,
  clearAreas: true, speedBumps: true, parkingSpaces: true,
  connections: true,
}
```

`toggleLayer(layerId)` flips the boolean; `setLayerVisible(layerId, visible)` sets it directly.

---

## Avoiding stale closures in MapEditor

MapLibre event handlers are registered once during map initialization. Accessing Zustand state inside them via a React hook would produce stale closure values. The `MapEditor` component instead calls the store's `getState()` method directly:

```ts
// Inside a maplibre 'click' handler registered in useEffect:
const { drawMode, connectFromId } = useUIStore.getState()
const { addElement } = useMapStore.getState()
```

This pattern ensures handlers always see the current state without needing to be re-registered on every render.
