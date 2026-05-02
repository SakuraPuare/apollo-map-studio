---
title: useGridLayer
description: Metric reference grid that picks step size from current zoom and recomputes per-viewport bounds; when disabled, only flips visibility without recomputation.
---

# useGridLayer

> Source: `src/hooks/useGridLayer.ts`

`useGridLayer` is the layer where the toolstrip "G" toggle actually
lands. It picks a metric step from `map.getZoom()` (`metersForZoom`),
walks the current viewport bounds, and writes lat/lng lines into the
`grid` source backing the `grid-line` layer.

Design goals:

- **gridEnabled=false**: flip layer `visibility:none` only — no
  recompute, no `setData`.
- **gridEnabled=true**: apply once immediately, then subscribe to
  `moveend` / `zoomend` for live refresh.
- **No drift**: grid origin `Math.floor(south / stepLat) * stepLat`
  snaps to integer multiples of the step, so zoom/pan does not produce
  visible jitter.
- **Safety cap**: `MAX_LINES_PER_AXIS = 240` guards against extreme
  zoom-out producing tens of thousands of lines.

## Interaction with toolstrip / status bar

- The toolstrip G button → `execute('toggleGrid')` →
  `useUIStore.toggleGrid()` → flips `gridEnabled` → this hook re-runs.
- The status bar displays current zoom and "one cell = N metres",
  looked up from `metersForZoom`.
- Both the status bar and this hook consume the same
  `useUIStore.gridEnabled` for visual consistency.

## Signature

```ts
function useGridLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
): void;

export function metersForZoom(zoom: number): { step: number; majorEvery: number };
export const MAX_LINES_PER_AXIS = 240;
```

## Parameters

| Name           | Type                                | Role                                                      |
| -------------- | ----------------------------------- | --------------------------------------------------------- |
| `mapRef`       | `RefObject<maplibregl.Map \| null>` | MapLibre instance.                                        |
| `mapLoadedRef` | `RefObject<boolean>`                | Late-binding wait for the `grid-line` layer registration. |

## Returns

`void`. Operates on the `grid` source and `grid-line` layer.

## Sync with the global zoom state

```ts
// useMapEventRouter.ts:198-203
const onZoomEnd = () => {
  useUIStore.getState().setCurrentZoom(map.getZoom());
};
useUIStore.getState().setCurrentZoom(map.getZoom());
map.on('zoomend', onZoomEnd);
```

The router writes the current zoom to the store; the status bar and
this hook both consume it. The grid recompute path and status bar
update naturally align as a result.

## Data sources

- `useUIStore.gridEnabled` — main toggle, flipped by `toggleGrid` action
  in `useActionDispatcher`.
- `map.getZoom()` — picks step and major frequency.
- `map.getBounds()` — defines the lat/lng span to cover.

## Side effects

| Effect                                                  | Trigger                                                 | Cleanup                             |
| ------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| `map.setLayoutProperty('grid-line', 'visibility', ...)` | Every effect run                                        | —                                   |
| `src.setData(buildGrid(map))`                           | `apply()` (when enabled) and on every moveend / zoomend | —                                   |
| `map.on('moveend', onMove)`                             | `gridEnabled=true`                                      | `map.off('moveend', onMove)`        |
| `map.on('zoomend', onMove)`                             | `gridEnabled=true`                                      | `map.off('zoomend', onMove)`        |
| `map.once('load', apply)`                               | Map not yet loaded                                      | `map.off('load', apply)` in cleanup |

## `metersForZoom` table

```ts
// useGridLayer.ts:9-21
zoom >= 20 → step 0.5m / major 5m
zoom >= 19 → step 1m   / major 10m
zoom >= 18 → step 2m   / major 10m
zoom >= 17 → step 5m   / major 25m
zoom >= 16 → step 10m  / major 50m
zoom >= 15 → step 25m  / major 100m
zoom >= 14 → step 50m  / major 200m
zoom >= 13 → step 100m / major 500m
zoom >= 12 → step 250m / major 1km
zoom >= 11 → step 500m / major 2km
default    → step 1000m / major 5km
```

## Lifecycle

```
[gridEnabled, mapRef, mapLoadedRef] change → effect re-run
  ├── apply()
  │     ├── setLayoutProperty('grid-line', visibility: enabled ? 'visible' : 'none')
  │     └── src.setData(enabled ? buildGrid(map) : EMPTY_FC)
  ├── if !mapLoaded: map.once('load', apply)
  ├── if !enabled: cleanup early-return
  └── enabled:
        ├── map.on('moveend', onMove)
        └── map.on('zoomend', onMove)

cleanup
  ├── if pendingLoad: map.off('load', apply)
  └── if enabled: map.off('moveend' | 'zoomend', onMove)
```

## Invariants

### Disabled path skips subscription

```ts
// useGridLayer.ts:128-132
if (!gridEnabled) {
  return () => {
    if (pendingLoad) map.off('load', apply);
  };
}
```

Prevents recomputing GeoJSON on every pan while invisible.

### Grid origin snaps to step multiples

```ts
// useGridLayer.ts:42-43
const startLat = Math.floor(south / stepLat) * stepLat;
const startLng = Math.floor(west / stepLng) * stepLng;
```

Without this the grid lines would slide as you zoom or pan, making the
canvas feel slippery.

### Major lines indexed by absolute world coords

```ts
// useGridLayer.ts:48, 50, 52, 64
let latIdx = Math.floor(south / stepLat);
// ...
const major = latIdx % majorEvery === 0;
```

Modulo runs against absolute world coordinates so major lines always
fall on world-integer multiples — independent of where the viewport
starts.

### Safety cap

```ts
// useGridLayer.ts:25
export const MAX_LINES_PER_AXIS = 240;

// loop guard
for (let lat = startLat; lat <= north && countLat < MAX_LINES_PER_AXIS; ...)
```

Belt-and-suspenders against extreme zoom-out paired with a misconfigured
step.

## Call site

```tsx
// src/components/map/MapCanvas.tsx:40
useGridLayer(mapRef, mapLoadedRef);
```

`gridEnabled` is flipped by the `toggleGrid` action in
`useActionDispatcher`. Menu / toolstrip / status bar toggles all funnel
through `useUIStore.toggleGrid()`.

## Failure modes

| Symptom                 | Root cause                                                             | Fix                                                                                |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Toggle has no effect    | `grid-line` layer not yet registered                                   | `apply` returns early when `mapLoadedRef.current=false`; `once('load')` re-applies |
| Zoom-out stutter        | step bucket too small for span; single frame hits `MAX_LINES_PER_AXIS` | Re-tune `metersForZoom` thresholds                                                 |
| Grid drifts             | Missing `Math.floor` when computing `startLat`                         | See lines 42-43                                                                    |
| Recompute after disable | `enabled=false` did not early-return cleanup                           | See lines 128-132                                                                  |

## Tests

- `src/hooks/__tests__/useGridLayer.test.ts` — `metersForZoom`,
  `buildGrid` cap assertions

## See also

- [`useActionDispatcher`](./use-action-dispatcher.md) (`toggleGrid` dispatcher)
- [`useUIStore.gridEnabled`](../store/store-ui.md)
- [`mapLibreInit/layers.ts` — `grid-line`](./use-map-libre-init.md)

## Grid aesthetics

The `grid-line` paint in `mapLibreInit/layers.ts:14-23`:

```js
'line-color': ['case', ['==', ['get', 'major'], true],
  'rgba(255,255,255,0.18)',     // major: 18% white
  'rgba(255,255,255,0.07)'],    // minor: 7% white
'line-width': ['case', ['==', ['get', 'major'], true], 1, 0.5],
```

Low contrast is intentional — the grid is a reference, not a focal
point.

## Cooperation with cursorScheduler / status bar

`useUIStore.cursorLngLat` and `useUIStore.currentZoom` are written by
[`useMapEventRouter` cursorScheduler](./map-event-router-internals.md#cursorschedulerts)
and the `zoomend` handler. The status bar shows the current cursor
location in metric coordinates plus the current grid step (looked up
via `metersForZoom`), giving the user an intuition of "one cell = N
metres".

## Why these zoom thresholds

Steps progress by 5 / 10 / 25 / 50 / 100 multiples instead of evenly:

- Odd buckets like 15 m / 30 m look unnatural on the map.
- `majorEvery` is tuned per zoom so the major-line density stays
  independent of step.
- zoom 17 (5 m) ↔ zoom 16 (10 m) form a smooth pair — sliding between
  them changes density 2×, not jarringly more.

## Source map

| Concern                            | Lines                     |
| ---------------------------------- | ------------------------- |
| `metersForZoom`                    | `useGridLayer.ts:9-21`    |
| `MAX_LINES_PER_AXIS`               | `useGridLayer.ts:25`      |
| `buildGrid`                        | `useGridLayer.ts:27-88`   |
| `apply`                            | `useGridLayer.ts:107-116` |
| `gridEnabled=false` early return   | `useGridLayer.ts:128-132` |
| `moveend` / `zoomend` subscription | `useGridLayer.ts:135-141` |
| cleanup                            | `useGridLayer.ts:142-146` |
