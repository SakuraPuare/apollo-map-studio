# Architecture Overview

## Core design principles

1. **No backend** — all computation (geometry, projection, protobuf encoding) runs in the browser
2. **GeoJSON as the canonical editor format** — all elements are stored as GeoJSON features in WGS84; ENU conversion only happens at export time
3. **Apollo proto types as the target format** — TypeScript interfaces mirror the `.proto` definitions exactly, making the export layer a straightforward translation
4. **Libraries for everything geometric** — `turf.js` for spatial math, `proj4` for projection, `protobufjs` for encoding; no custom geometry code

## High-level data flow

```
User interaction
      │
      ▼
mapbox-gl-draw
(GeoJSON Feature creation / editing)
      │
      ▼
Zustand mapStore                    ←── uiStore (draw mode, selection)
(LaneFeature, JunctionFeature, …)
      │
      ├── real-time ──→ MapLibre GL layers
      │                 (boundaries, fills, icons, arrows)
      │
      └── on Export ──→ buildBaseMap()
                              │
                              ├── proj4: WGS84 → ENU
                              ├── turf: length, samples, headings
                              ├── turf: overlap detection
                              │
                              ▼
                        apollo.hdmap.Map (JS object)
                              │
                              ├── protobufjs → base_map.bin
                              ├── buildSimMap() → protobufjs → sim_map.bin
                              └── buildRoutingMap() → protobufjs → routing_map.bin
```

## Layer architecture

```
┌──────────────────────────────────────────────────────────┐
│  React components (App.tsx)                              │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  MapEditor  │  │   Toolbar     │  │  Properties   │  │
│  │  (MapLibre) │  │   (uiStore)   │  │  (mapStore)   │  │
│  └──────┬──────┘  └───────────────┘  └───────────────┘  │
│         │                                                │
│  ┌──────▼────────────────────────────────────────────┐  │
│  │  Zustand stores                                   │  │
│  │  mapStore: lanes, junctions, signals, ...         │  │
│  │  uiStore:  drawMode, selectedIds, layerVisibility │  │
│  └──────┬────────────────────────────────────────────┘  │
│         │                                                │
│  ┌──────▼──────────────────────────────────────────┐    │
│  │  geo/  ·  proto/  ·  export/  ·  import/        │    │
│  │  (pure TypeScript utility modules)               │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## Module responsibilities

| Module                            | Responsibility                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `src/types/`                      | TypeScript interfaces mirroring Apollo proto definitions; editor-internal GeoJSON types |
| `src/store/mapStore`              | Single source of truth for all map elements; undo/redo history                          |
| `src/store/uiStore`               | Transient UI state (draw mode, hover, selection, layer visibility)                      |
| `src/geo/projection`              | WGS84 ↔ ENU conversion via proj4                                                        |
| `src/geo/laneGeometry`            | Lane boundary computation, width sampling, heading                                      |
| `src/geo/overlapCalc`             | Spatial intersection detection → Overlap proto objects                                  |
| `src/geo/snapEndpoints`           | Lane endpoint snapping for connect mode                                                 |
| `src/validation/mapValidator`     | Pre-export map validation rules (orphan lanes, missing connections)                     |
| `src/proto/loader`                | Dynamic `.proto` loading from `public/proto/` via protobufjs                            |
| `src/proto/codec`                 | Encode/decode `apollo.hdmap.Map` and `apollo.routing.Graph`                             |
| `src/export/buildBaseMap`         | Translate editor state → full `apollo.hdmap.Map` proto object                           |
| `src/export/buildSimMap`          | Downsample a base map for Dreamview                                                     |
| `src/export/buildRoutingMap`      | Build routing topology graph from lane connectivity                                     |
| `src/import/parseBaseMap`         | Decode `base_map.bin` → restore editor GeoJSON state                                    |
| `src/components/MapEditor`        | MapLibre GL map + draw controls + all rendering layers                                  |
| `src/components/Toolbar`          | Draw mode selection buttons (lucide-react icons)                                        |
| `src/components/PropertiesPanel`  | Per-element attribute editing forms (including road properties)                         |
| `src/components/ElementListPanel` | Filterable element browser with selection highlighting                                  |
| `src/components/ValidationDialog` | Map validation report dialog                                                            |
| `src/components/*Dialog`          | New project / Export / Import modal dialogs                                             |
| `src/components/StatusBar`        | Mode indicator, undo/redo controls                                                      |
| `src/components/ui/`              | shadcn/ui base components (Button, Dialog, Input, Select, etc.)                         |

## Dependency graph (simplified)

```
App
 ├── MapEditor
 │    ├── mapStore (read)
 │    ├── uiStore  (read + write)
 │    ├── geo/laneGeometry (boundary computation)
 │    └── maplibre-gl + @mapbox/mapbox-gl-draw
 │
 ├── Toolbar  → uiStore (write drawMode)
 │
 ├── PropertiesPanel → mapStore (write element)
 │
 ├── ElementListPanel → mapStore (read), uiStore (write selection)
 │
 ├── ValidationDialog → mapStore (read), validation/mapValidator
 │
 └── ExportDialog
      ├── mapStore (read all elements)
      ├── geo/projection
      ├── export/buildBaseMap → geo/laneGeometry, geo/overlapCalc
      ├── export/buildSimMap
      ├── export/buildRoutingMap
      └── proto/codec → proto/loader → protobufjs
```

## Proto file strategy

Apollo `.proto` files are copied verbatim from the Apollo repository to `public/proto/` and served as static assets. `protobufjs` fetches and parses them at runtime using its `load()` API with a custom `resolvePath` function that strips Apollo's deep path prefix:

```ts
// proto/loader.ts
root.resolvePath = (_origin, target) => {
  const filename = target.split('/').pop()!
  return `/proto/${filename}`
}
```

This avoids bundling proto definitions at build time and keeps them easy to update independently.
