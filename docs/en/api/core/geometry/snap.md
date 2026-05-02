# Core / geometry / snap

Source: `src/core/geometry/snap.ts`.

Snap logic collects candidate vertices and edges, converts pixel radius into
world distance for the current zoom/latitude, and returns the closest
`SnapTarget`.

See [Editing and snapping](/en/guide/editing-and-snapping) and
[useMapEventRouter](/en/api/hooks/use-map-event-router).
