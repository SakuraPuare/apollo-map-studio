# useApolloLayer

> Source: `src/hooks/useApolloLayer.ts`

## Overview

`useApolloLayer` registers a set of cyan-family MapLibre layers for
imported Apollo HD-map data — a viewer-only fallback that previously
showed the imported source data before the editor bridged Apollo
entities into `mapStore`. Today the sources stay empty (all entity
types are bridged into the cold layer), but the hook still:

- Adds the layer specs (kept valid for any future viewer-only mode).
- Calls `map.fitBounds(bounds)` so the camera jumps to the imported
  map's extents on first import.

The cyan palette is intentional — visually distinct from user-edited
geometry so a viewer at a glance can tell "imported" from "edited".

## Hook signature

```ts
function useApolloLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
): void;
```

## Behavior

### Layer registration

The hook installs layers exactly once per map instance, gated by
`installedRef.current`. Sources are added before layers, and layers
are inserted **below** the first `cold-*` layer so user edits sit on
top.

```ts
const beforeId = existingLayers.find((l) => l.id.startsWith('cold-'))?.id;
for (const spec of LAYERS) {
  if (!map.getLayer(spec.id)) map.addLayer(spec.layer, beforeId);
}
```

### Source list

| Source ID              | Purpose                         |
| ---------------------- | ------------------------------- |
| `apollo-lane-center`   | Lane center lines (cyan dashed) |
| `apollo-lane-boundary` | Lane boundary lines             |
| `apollo-road-boundary` | Road boundary lines             |
| `apollo-crosswalk`     | Crosswalk fills + outlines      |
| `apollo-junction`      | Junction fills                  |
| `apollo-signal`        | Signal points/lines             |
| `apollo-stop-sign`     | Stop sign lines                 |
| `apollo-clear-area`    | Clear area fills                |
| `apollo-parking-space` | Parking space fills             |
| `apollo-speed-bump`    | Speed bump lines                |

### Layer specs

| Layer ID                    | Type   | Color                                  |
| --------------------------- | ------ | -------------------------------------- |
| `apollo-junction-fill`      | fill   | `#0e7490`                              |
| `apollo-clear-area-fill`    | fill   | `#dc2626` (red 18% opacity)            |
| `apollo-parking-space-fill` | fill   | `#16a34a`                              |
| `apollo-crosswalk-fill`     | fill   | `#fbbf24`                              |
| `apollo-crosswalk-outline`  | line   | `#f59e0b`                              |
| `apollo-road-boundary-line` | line   | `#94a3b8`                              |
| `apollo-lane-boundary-line` | line   | `#cbd5e1`                              |
| `apollo-lane-center-line`   | line   | `#22d3ee`, dasharray `[2, 2]`          |
| `apollo-speed-bump-line`    | line   | `#a855f7`                              |
| `apollo-stop-sign-line`     | line   | `#dc2626`                              |
| `apollo-signal-circle`      | circle | `#facc15` (Point geometries only)      |
| `apollo-signal-line`        | line   | `#facc15` (LineString geometries only) |

### Bounds-driven camera fit

```ts
const bounds = useApolloMapStore((s) => s.bounds);

useEffect(() => {
  // ... ensure layers installed
  if (bounds) {
    map.fitBounds(bounds, { padding: 60, animate: true, duration: 600 });
  }
}, [bounds, mapRef, mapLoadedRef]);
```

`bounds` is computed in the Apollo IO worker during import and stored
in `apolloMapStore`. The animation makes the import feel snappy: drop
the file, watch the camera glide to fit.

### Why sources stay empty

The hook header notes:

> All Apollo entity types are bridged into mapStore and rendered by
> the cold layer. These viewer-layer sources stay empty; they exist
> only so the layer specs below remain valid.

Earlier versions populated these sources directly. The R2 entityOps
adapter promoted Apollo entities to first-class `MapEntity` instances,
so the cold-layer pipeline now owns the rendering. The Apollo viewer
layers are kept as inert scaffolding for two reasons:

1. A future "viewer-only / read-only diff" mode could repopulate them
   to compare imported vs. edited geometry.
2. Removing the layer specs would break any saved style snapshots that
   reference them.

## Examples

### Importing a map and seeing the camera fit

```tsx
import { useApolloLayer } from '@/hooks/useApolloLayer';

function MapCanvas() {
  // ...
  useApolloLayer(mapRef, mapLoadedRef);
  // After pickAndImportApollo() resolves, apolloMapStore.bounds is set,
  // and the next render of this hook fitBounds() the camera.
}
```

### Inspecting registered sources

```ts
for (const sourceId of Object.values(SOURCE)) {
  const src = map.getSource(sourceId);
  console.log(sourceId, src ? 'present' : 'missing');
}
```

## Related

- [apolloMapStore](/api/store/apollo-map-store)
- [Apollo IO pipeline](/api/io/import-parse-base-map)
- [useColdLayer](/api/hooks/use-cold-layer) — the actual entity rendering path
