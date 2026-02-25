## [0.2.0] - 2026-02-25

### 🚀 Features

- _(ui)_ Add road grouping UI for lane-to-road assignment
- _(ui)_ Add welcome intro and onboarding to new project dialog
- _(ui)_ Improve global styles, properties panel, and status bar
- _(ui)_ Redesign toolbar with SVG icons and improved layout
- _(ui)_ Improve header with logo, version badge, and branding
- Add lane endpoint snapping on connect
- Add map validation report dialog
- Add element list explorer panel with selection highlighting
- Add road properties panel with name, type, and lane info

### 🐛 Bug Fixes

- Prevent lane self-connection in connectLanes and setLaneNeighbor
- Center grid layer on project origin coordinates
- _(import)_ Remove single-lane road filter and add import logging
- _(import)_ Close junction polygon ring for valid GeoJSON
- _(export)_ Encode header bytes fields as Uint8Array
- _(import)_ Decode proto bytes header fields to UTF-8 strings
- _(export)_ Convert header bytes to string for routing graph

### 🚜 Refactor

- _(toolbar)_ Replace inline SVGs with lucide-react icons
- _(dialogs)_ Migrate to shadcn Dialog, Button and Checkbox
- _(properties)_ Replace inline styles with shadcn Button and tailwind
- _(dialogs)_ Add DialogDescription to all dialogs

### 📚 Documentation

- _(changelog)_ Update for v0.2.0
- Update README for v0.2.0
- _(guide)_ Fix keyboard shortcuts and update guides
- _(arch)_ Update architecture and API reference

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for v0.1.2
- Clean up dependencies and fix changelog formatting
- Add shadcn/ui, tailwind css and design token infrastructure
- _(release)_ Bump version to 0.2.0

## [0.1.2] - 2026-02-18

### ⚙️ Miscellaneous Tasks

- Update package-lock.json to reflect version 0.1.1
- Replace npm ci with npm install in CI workflows for consistency
- _(release)_ Bump version to 0.1.2
- _(changelog)_ Update for v0.1.2

## [0.1.1] - 2026-02-18

### 📚 Documentation

- Rewrite README and rename package to apollo-map-studio
- Add full VitePress documentation site with guide, architecture, and API reference
- Update README with new repository link and add emoji to title

### ⚙️ Miscellaneous Tasks

- Add GitHub Actions workflows, release script, and Dependabot config
- Update package-lock and package.json for version 0.1.0, adjust ESLint and TypeScript dependencies, and enhance CI workflows with Node version matrix
- Enhance package.json with project description and keywords for better discoverability
- _(release)_ Bump version to 0.1.1
- _(changelog)_ Update for v0.1.1

## [0.1.0] - 2026-02-18

### 🚀 Features

- _(types)_ Define Apollo HD Map and editor type system
- _(proto)_ Add protobuf loader and binary codec for Apollo map files
- _(store)_ Add Zustand state stores with undo/redo support
- _(geo)_ Add coordinate projection and spatial geometry utilities
- _(export)_ Add Apollo binary export engine for base_map, sim_map, and routing_map
- _(import)_ Add base_map.bin parser to restore editor state
- _(editor)_ Add MapLibre GL interactive map editor with draw controls and layer rendering
- _(ui)_ Add toolbar and properties panel for map element editing
- _(ui)_ Add new project dialog, export/import dialogs, and status bar
- Wire up app entry point and global styles

### ⚙️ Miscellaneous Tasks

- Init Vite + React + TypeScript project
- Configure ESLint, Prettier, and Husky pre-commit hooks
- _(release)_ Add CHANGELOG and git-cliff config for v0.1.0
