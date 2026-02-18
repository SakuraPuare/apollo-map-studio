# Getting Started

## Prerequisites

- Node.js 18+
- npm 9+

## Installation

```bash
git clone https://github.com/yourname/apollo-map-studio
cd apollo-map-studio
npm install
```

## Start the dev server

```bash
npm run dev
```

Open `http://localhost:5173`. The editor loads immediately with no external dependencies.

## Create your first project

When the editor opens, a **New Project** dialog appears automatically.

| Field                | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| **Project name**     | Human-readable label for this map (stored in `MapHeader.district`) |
| **Origin latitude**  | WGS84 latitude of the map's local ENU origin                       |
| **Origin longitude** | WGS84 longitude of the map's local ENU origin                      |

The origin is the reference point for the ENU coordinate system used internally by Apollo. For a city map, use a central intersection. For a test track, use the geometric center.

::: tip Choosing an origin
Pick a point near the center of your intended map area. Apollo's ENU projection uses a Transverse Mercator with this point as the false origin, so accuracy degrades noticeably beyond ~50 km from it.
:::

## Interface overview

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar (left)  │         Map Canvas         │  Panel (right) │
│                  │                            │                │
│  [Select]        │   MapLibre GL viewport     │  Properties    │
│  [Draw Lane]     │   with custom GeoJSON      │  of selected   │
│  [Draw Junction] │   layers for all element   │  element       │
│  [Draw Signal]   │   types                    │                │
│  [...]           │                            │  Layer         │
│  [Connect Lanes] │                            │  toggles       │
├──────────────────┴────────────────────────────┴────────────────┤
│  Status bar: current mode · selected element · status message  │
└─────────────────────────────────────────────────────────────────┘
```

- **Toolbar** — switch between draw modes and the connect-lanes tool
- **Canvas** — draw and select elements; scroll to zoom, drag to pan
- **Properties panel** — edit attributes of the selected element
- **Status bar** — shows current draw mode, selection, and action feedback

## Build for production

```bash
npm run build        # outputs to dist/
npm run preview      # serve the dist/ build locally
```

## Build the docs site

```bash
npm run docs:dev     # VitePress dev server
npm run docs:build   # build static docs to docs/.vitepress/dist/
```
