# 🚗 Apollo Map Studio

A browser-based HD map editor for the [Apollo](https://github.com/ApolloAuto/apollo) autonomous driving platform. Draw lanes, junctions, signals, and all other map elements visually, then export Apollo-compatible binary map files directly from your browser — no C++ toolchain required.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-green)

---

## Why

Apollo requires three binary map files to operate:

| File              | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `base_map.bin`    | Full HD map with all elements and metadata      |
| `sim_map.bin`     | Downsampled version for Dreamview visualization |
| `routing_map.bin` | Topological graph used by the routing module    |

Traditionally, generating these files requires the Apollo C++ build environment. **Apollo Map Studio** replaces that entire workflow with a web app — open it in a browser, draw your map, click Export.

---

## Features

- **Interactive drawing** — lanes, junctions, crosswalks, signals, stop signs, speed bumps, clear areas, parking spaces
- **Real-time boundary rendering** — left/right lane boundaries computed and rendered as you draw, with correct dash styles per boundary type
- **Lane topology editor** — connect predecessor/successor lanes, set left/right neighbors
- **Properties panel** — edit speed limit, lane type, turn direction, boundary types per element
- **Binary export** — produces all three Apollo `.bin` files in the browser via protobufjs
  - `base_map.bin` with full overlap computation (lane ↔ signal, crosswalk, junction, etc.)
  - `sim_map.bin` using the same downsampling algorithm as `sim_map_generator.cc`
  - `routing_map.bin` with node/edge costs matching `topo_creator` exactly
- **Binary import** — load an existing `base_map.bin` and continue editing it
- **Undo / Redo** — full history via Zustand temporal middleware
- **Layer toggles** — show/hide any element type
- **Offline capable** — blank map background, no tile server or external API needed

---

## Tech Stack

| Concern                | Library                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Map rendering          | [MapLibre GL](https://maplibre.org/)                                                                                              |
| Drawing tools          | [@mapbox/mapbox-gl-draw](https://github.com/mapbox/mapbox-gl-draw)                                                                |
| Spatial math           | [@turf/turf](https://turfjs.org/)                                                                                                 |
| Protobuf encode/decode | [protobufjs](https://protobufjs.github.io/protobuf.js/)                                                                           |
| Coordinate projection  | [proj4](https://github.com/proj4js/proj4js) (WGS84 ↔ ENU)                                                                         |
| State management       | [Zustand](https://zustand-demo.pmnd.rs/) + [immer](https://immerjs.github.io/immer/) + [zundo](https://github.com/charkour/zundo) |
| Build                  | [Vite](https://vitejs.dev/) + TypeScript                                                                                          |

---

## Getting Started

```bash
# Clone and install
git clone https://github.com/SakuraPuare/apollo-map-studio
cd apollo-map-studio
npm install

# Start dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

### First map

1. Click **New Project**, enter a name and the origin coordinates (lat/lon) of your map area
2. Select **Draw Lane** from the toolbar and click to place lane centerline points
3. Double-click to finish drawing a lane
4. Use the **Properties** panel on the right to set speed limit, type, boundary styles, etc.
5. Select **Connect Lanes** to link predecessor/successor relationships between lanes
6. Add junctions, signals, crosswalks, etc. using the corresponding toolbar buttons
7. Click **Export** to download `base_map.bin`, `sim_map.bin`, and `routing_map.bin`

### Import existing map

Click **Import** and drop a `base_map.bin` file. The editor will decode it and restore all elements for further editing.

---

## Project Structure

```
src/
├── types/
│   ├── apollo-map.ts        # Apollo proto type mirrors (Map, Lane, Road, ...)
│   ├── apollo-routing.ts    # Routing graph types (TopoNode, TopoEdge, ...)
│   └── editor.ts            # GeoJSON-based editor types (LaneFeature, ...)
│
├── store/
│   ├── mapStore.ts          # Map element state + actions (Zustand + immer + undo)
│   └── uiStore.ts           # Draw mode, selection, layer visibility
│
├── geo/
│   ├── projection.ts        # proj4: WGS84 ↔ ENU coordinate conversion
│   ├── laneGeometry.ts      # turf: boundary offset, width sampling, headings
│   └── overlapCalc.ts       # turf: lane/element intersection → Overlap proto
│
├── proto/
│   ├── loader.ts            # protobufjs: dynamic .proto loading
│   └── codec.ts             # encode/decode Map + Graph, download as .bin
│
├── export/
│   ├── buildBaseMap.ts      # Assemble full Apollo Map proto object
│   ├── buildSimMap.ts       # Downsample (port of sim_map_generator.cc)
│   └── buildRoutingMap.ts   # Build topo graph (port of topo_creator)
│
├── import/
│   └── parseBaseMap.ts      # Decode base_map.bin → editor GeoJSON state
│
└── components/
    ├── MapEditor/            # MapLibre GL container, draw control, layer rendering
    ├── Toolbar/              # Draw mode buttons
    ├── PropertiesPanel/      # Per-element attribute forms
    ├── NewProjectDialog/     # Project name + origin coordinate setup
    ├── ExportDialog/         # Export all three .bin files
    ├── ImportDialog/         # Import base_map.bin
    └── StatusBar/            # Status messages and undo/redo controls

public/proto/                 # Apollo .proto files served statically
```

---

## Export Accuracy

The export engine is a direct port of the Apollo C++ source:

- **`sim_map.bin`** — replicates the `DownsampleByAngle` + `DownsampleByDistance` passes from [`points_downsampler.h`](https://github.com/ApolloAuto/apollo/blob/master/modules/map/tools/sim_map_generator.cc)
- **`routing_map.bin`** — replicates node/edge cost formulas from [`node_creator.cc`](https://github.com/ApolloAuto/apollo/blob/master/modules/routing/topo_creator/node_creator.cc) and [`edge_creator.cc`](https://github.com/ApolloAuto/apollo/blob/master/modules/routing/topo_creator/edge_creator.cc):
  - Node cost: `length × √(base_speed / speed_limit)` + turn penalty
  - Lane-change edge cost: `500 × (changing_length / 50)^−1.5`
  - Lane changes only allowed across dotted boundaries

---

## Development

```bash
npm run dev          # start dev server with HMR
npm run build        # production build
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format all files
npm run format:check # Prettier check (CI)
```

Pre-commit hooks (Husky + lint-staged) run ESLint and Prettier automatically on every commit.

---

## Roadmap

- [ ] Road grouping UI (assign lanes to named roads)
- [ ] Snap-to-endpoint when connecting lanes
- [ ] Map validation report (orphan lanes, missing overlaps, ID conflicts)
- [ ] OSM tile background option
- [ ] Multi-select and bulk property editing
- [ ] Export to Apollo text proto format (`.txt`) for inspection

---

## License

MIT
