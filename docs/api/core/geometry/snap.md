# Core / geometry / snap

Source: `src/core/geometry/snap.ts`.

Snap logic collects candidate vertices and edges, converts pixel radius into
world distance for the current zoom/latitude, and returns the closest
`SnapTarget`.

See [Editing and snapping](/guide/editing-and-snapping) and
[useMapEventRouter](/api/hooks/use-map-event-router).
