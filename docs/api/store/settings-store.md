# Store / settingsStore

Source: `src/store/settingsStore.ts`.

`settingsStore` persists scalar user preferences across sessions via
`localStorage`. Each setter writes through to `localStorage` so a
reload picks up the same value. None of these scalars are undoable.

See [Settings](/guide/settings) and
[Store / UI, Action and Panels API](/api/store-ui#settings-store).

## Persisted Keys

| `localStorage` key                   | Setting            | Default                     |
| ------------------------------------ | ------------------ | --------------------------- |
| `apollo-map-studio:historyLimit`     | `historyLimit`     | `100`                       |
| `apollo-map-studio:mapCenterLng`     | `mapCenterLng`     | `MAP_DEFAULT_CENTER[0]`     |
| `apollo-map-studio:mapCenterLat`     | `mapCenterLat`     | `MAP_DEFAULT_CENTER[1]`     |
| `apollo-map-studio:mapZoom`          | `mapZoom`          | `MAP_DEFAULT_ZOOM`          |
| `apollo-map-studio:laneHalfWidth`    | `laneHalfWidth`    | `DEFAULT_LANE_HALF_WIDTH`   |
| `apollo-map-studio:laneArrowSpacing` | `laneArrowSpacing` | `LANE_ARROW_SYMBOL_SPACING` |

## State Shape

```ts
interface SettingsState {
  historyLimit: number; // 10..1000
  mapCenterLng: number; // -180..180
  mapCenterLat: number; // -90..90
  mapZoom: number; // 1..22
  laneHalfWidth: number; // 0.5..10
  laneArrowSpacing: number; // 40..500
}
```

## Actions

```ts
interface SettingsActions {
  setHistoryLimit(value: number): void;
  setMapCenter(lng: number, lat: number): void;
  setMapZoom(value: number): void;
  setLaneHalfWidth(value: number): void;
  setLaneArrowSpacing(value: number): void;
}
```

Every setter clamps the input to its valid range before writing.
Failure to access `localStorage` (SSR, private mode) is silently
ignored; in-memory state still updates.

## Read Helpers

These exist so non-React consumers (the `mapStore` zundo limit, the
map-init effect, the lane-decoration symbol spacing) can read the
persisted value at module-load:

```ts
readHistoryLimit(): number
readMapCenter(): [number, number]
readMapZoom(): number
readLaneHalfWidth(): number
readLaneArrowSpacing(): number
```

`mapStore` uses `readHistoryLimit()` once at module construction time
to size the zundo history; subsequent `setHistoryLimit` calls only
take effect after the next page reload.

## Range Constants

```ts
DEFAULT_HISTORY_LIMIT = 100
MIN_HISTORY_LIMIT = 10        MAX_HISTORY_LIMIT = 1000
MIN_MAP_ZOOM = 1              MAX_MAP_ZOOM = 22
MIN_LANE_HALF_WIDTH = 0.5     MAX_LANE_HALF_WIDTH = 10
MIN_LANE_ARROW_SPACING = 40   MAX_LANE_ARROW_SPACING = 500
```

Re-exported for use in the Settings dialog inputs.

## Examples

```ts
// Update from the Settings dialog
useSettingsStore.getState().setLaneHalfWidth(2.0);

// Pre-populate a draw operation
const halfWidth = useSettingsStore.getState().laneHalfWidth;
```

## Related

- [/api/store/map-store](/api/store/map-store) — uses
  `readHistoryLimit()` to size zundo history.
- [/api/components/settings-dialog](/api/components/settings-dialog) —
  primary writer.
- [/api/config/map-constants](/api/config/map-constants) — defaults
  (`MAP_DEFAULT_CENTER`, `MAP_DEFAULT_ZOOM`,
  `DEFAULT_LANE_HALF_WIDTH`, `LANE_ARROW_SYMBOL_SPACING`).
