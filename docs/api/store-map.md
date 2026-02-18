# store/mapStore

Zustand store for all map element state, with undo/redo via `zundo` temporal middleware.

## useMapStore

```ts
const useMapStore: UseBoundStore<StoreApi<MapState>>
```

Primary React hook for accessing map state.

```ts
// Read state
const lanes = useMapStore((s) => s.lanes)
const project = useMapStore((s) => s.project)

// Call actions
const { addElement, connectLanes } = useMapStore()
```

For event handlers (to avoid stale closures):

```ts
const state = useMapStore.getState()
state.addElement(newLane)
```

---

## State

```ts
interface MapState {
  project: ProjectConfig | null

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

All element collections are keyed by element ID.

---

## Actions

### setProject

```ts
setProject(config: ProjectConfig): void
```

Sets the project metadata (name, origin lat/lon, version, date).

---

### addElement

```ts
addElement(element: MapElement): void
```

Adds an element to the appropriate collection. For `lane` type, merges default lane properties before storing:

```ts
state.lanes[element.id] = { ...defaultLaneProps, ...element }
```

Default lane props: `width: 3.75`, `speedLimit: 13.89`, `laneType: CITY_DRIVING`, etc.

---

### updateElement

```ts
updateElement(element: MapElement): void
```

Merges updated properties into an existing element. Does nothing if the element ID does not exist.

```ts
Object.assign(state.lanes[element.id], element)
```

---

### removeElement

```ts
removeElement(id: string, type: MapElement['type']): void
```

Deletes the element and cleans up all cross-references:

- For lanes: removes `id` from every other lane's `predecessorIds`, `successorIds`, `leftNeighborIds`, `rightNeighborIds`

---

### connectLanes

```ts
connectLanes(fromId: string, toId: string): void
```

Establishes a successor/predecessor link:

- `lanes[fromId].successorIds` gains `toId`
- `lanes[toId].predecessorIds` gains `fromId`

Idempotent — duplicate IDs are not added.

---

### setLaneNeighbor

```ts
setLaneNeighbor(laneId: string, neighborId: string, side: 'left' | 'right'): void
```

Establishes a bilateral neighbor link:

- `side = 'left'`: `laneId.leftNeighborIds` ← `neighborId`, `neighborId.rightNeighborIds` ← `laneId`
- `side = 'right'`: `laneId.rightNeighborIds` ← `neighborId`, `neighborId.leftNeighborIds` ← `laneId`

---

### clear

```ts
clear(): void
```

Resets all element collections to `{}`. Does not reset `project`.

---

### loadState

```ts
loadState(state: Partial<MapState>): void
```

Bulk-assigns state fields. Used by the import flow to restore all collections at once:

```ts
loadState({
  lanes: Object.fromEntries(parsed.lanes.map(l => [l.id, l])),
  junctions: Object.fromEntries(...),
  // ...
})
```

---

## Undo / Redo

`useTemporalMapStore` is the temporal store exposed by `zundo`:

```ts
import { useMapStore } from './mapStore'
const useTemporalMapStore = (useMapStore as any).temporal

// In a component:
const { undo, redo, pastStates, futureStates } = useTemporalMapStore()
```

Each `set()` call inside any action creates a new history snapshot. The entire `MapState` is snapshotted — undo/redo is O(n) in state size, not O(diff).
