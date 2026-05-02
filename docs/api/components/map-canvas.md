# Components / MapCanvas

Source: `src/components/map/MapCanvas.tsx`.

`MapCanvas` is the map composition point. It owns the map container ref, creates
one `SpatialWorkerBridge`, initializes MapLibre with `useMapLibreInit`, then
mounts the rendering and interaction hooks.

## Mounted Hooks

- `useDrawCommit`
- `useMapEventRouter`
- `useOverlayLayer`
- `useColdLayer`
- `useHotLayer`
- `useGridLayer`
- `useApolloLayer`
- `useCursorManager`
- `useDragPan`

The component does not render controls itself; it returns only the full-size
map `<div>`. Workspace controls live in layout components around it.
