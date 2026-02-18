# store/uiStore

Zustand store for transient UI state. Not wrapped with temporal middleware — UI changes are not undoable.

## useUIStore

```ts
const useUIStore: UseBoundStore<StoreApi<UIState>>
```

```ts
const { drawMode, setDrawMode } = useUIStore()
const selectedIds = useUIStore((s) => s.selectedIds)
```

---

## State

```ts
interface UIState {
  drawMode: DrawMode
  selectedIds: string[]
  hoveredId: string | null

  showNewProjectDialog: boolean
  showExportDialog: boolean
  showImportDialog: boolean

  connectFromId: string | null // first lane picked in connect_lanes mode

  layerVisibility: Record<string, boolean>
  statusMessage: string
}
```

### Initial values

| Field                  | Initial value                             |
| ---------------------- | ----------------------------------------- |
| `drawMode`             | `'select'`                                |
| `selectedIds`          | `[]`                                      |
| `hoveredId`            | `null`                                    |
| `showNewProjectDialog` | `true` (dialog opens immediately on load) |
| `showExportDialog`     | `false`                                   |
| `showImportDialog`     | `false`                                   |
| `connectFromId`        | `null`                                    |
| `layerVisibility`      | all layers `true`                         |
| `statusMessage`        | `'Ready'`                                 |

---

## Actions

### setDrawMode

```ts
setDrawMode(mode: DrawMode): void
```

Sets the active draw mode and resets `connectFromId` to `null`.

---

### setSelected / addSelected / clearSelected

```ts
setSelected(ids: string[]): void
addSelected(id: string): void
clearSelected(): void
```

Manage the selection set. `addSelected` appends one ID without clearing existing selections (for future multi-select support).

---

### setHovered

```ts
setHovered(id: string | null): void
```

Tracks the element under the mouse cursor. Used for hover highlighting in `MapEditor`.

---

### setConnectFromId

```ts
setConnectFromId(id: string | null): void
```

Stores the first lane ID in a two-step `connect_lanes` operation. Reset automatically by `setDrawMode`.

---

### toggleLayer / setLayerVisible

```ts
toggleLayer(layerId: string): void
setLayerVisible(layerId: string, visible: boolean): void
```

Control MapLibre layer visibility. Layer IDs:

```
lanes · boundaries · junctions · signals · crosswalks
stopSigns · clearAreas · speedBumps · parkingSpaces · connections
```

---

### setStatus

```ts
setStatus(msg: string): void
```

Updates the status bar message. Used throughout `MapEditor` to give action feedback:

```ts
setStatus('Lane added')
setStatus('Select the destination lane')
setStatus('Lanes connected')
```

---

## DrawMode values

| Value                  | Tool                              |
| ---------------------- | --------------------------------- |
| `'select'`             | Select / move / edit vertices     |
| `'draw_lane'`          | Draw lane centerline (LineString) |
| `'draw_junction'`      | Draw junction polygon             |
| `'draw_crosswalk'`     | Draw crosswalk polygon            |
| `'draw_clear_area'`    | Draw clear area polygon           |
| `'draw_speed_bump'`    | Draw speed bump line              |
| `'draw_parking_space'` | Draw parking space polygon        |
| `'draw_signal'`        | Draw signal stop line             |
| `'draw_stop_sign'`     | Draw stop sign line               |
| `'connect_lanes'`      | Two-click lane topology connector |
