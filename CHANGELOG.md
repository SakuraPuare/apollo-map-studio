# Changelog

## [1.0.0] - 2026-05-02

### Features

- Added Electron desktop packaging for Linux, macOS, and Windows.
- Added offline activation with machine-bound licenses.
- Added worker-backed Apollo map import/export with progress UI.
- Expanded Apollo element inspection and metadata coverage.
- Preserved Apollo boundary curves, proto2 optional semantics, overlaps, and map metadata during round trips.
- Added performance-oriented cold layer rendering, spatial worker updates, and benchmark budgets.

### CI/CD

- Added pnpm-based CI for typecheck, lint, formatting, web build, docs build, tests, benchmarks, and desktop packaging.
- Added tag-triggered GitHub Release publishing for web and desktop artifacts.

### Documentation

- Restored README, license, changelog, and VitePress documentation scaffolding for the `v1` code line.

## [0.2.0] - 2026-02-25

### Features

- Added road grouping UI for lane-to-road assignment.
- Added map validation report and element list explorer.
- Added road properties panel with lane information.

### Bug Fixes

- Fixed import/export byte conversion issues.
- Fixed lane connection and junction polygon handling.

### Documentation

- Added the initial VitePress documentation site.

## [0.1.0] - 2026-02-18

### Features

- Initialized the Apollo Map Studio web editor.
- Added Apollo proto loading, binary map export, binary map import, and geometry utilities.
- Added Zustand stores, undo/redo support, MapLibre rendering, and basic editor UI.
