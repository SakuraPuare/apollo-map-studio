---
layout: home

hero:
  name: Apollo Map Studio
  text: HD Map Editor for Apollo
  tagline: Import, visualise, edit, derive topology, recompute overlaps, and export Apollo base_map data — across Web and Electron desktop, in binary and text protobuf round-trip.
  image:
    src: /logo.svg
    alt: Apollo Map Studio
  actions:
    - theme: brand
      text: Get Started
      link: /en/guide/getting-started
    - theme: alt
      text: Import Your First Map
      link: /en/guide/import
    - theme: alt
      text: Architecture Overview
      link: /en/architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/SakuraPuare/apollo-map-studio

features:
  - icon: 🗺️
    title: Full Apollo Element Coverage
    details: Edit every base_map entity — Lane, Junction, PNC Junction, ParkingSpace, Crosswalk, Signal, StopSign, SpeedBump, YieldSign, ClearArea, Boundary, Region — with first-class visual tooling.

  - icon: ✏️
    title: Powerful Drawing Toolbox
    details: Polyline, Catmull-Rom, Bezier, Arc, Rotated Rect, and Polygon tools — plus click-to-draw, double-click / Enter to commit, control point dragging, Alt smooth-toggle, centre dragging, multi-target alignment and snapping.

  - icon: 🔗
    title: Automatic Topology Derivation
    details: Predecessor / successor / neighbor / self_reverse / junction_id are recomputed from lane endpoint coincidence, geometric adjacency, reverse twins, and junction polygon intersection — incrementally on edit.

  - icon: 🧬
    title: Overlap Recomputation
    details: overlap_id values are maintained from geometric truth across import / edit / export. Lane × crosswalk region overlaps can be pinned in the Inspector to survive recomputation.

  - icon: 📦
    title: Apollo Round-Trip IO
    details: Imports and exports .bin, .txt, and .pb.txt protobuf encodings; preserves header, projection metadata, and untouched fields so a third-party Apollo tool can re-consume the result.

  - icon: 🪟
    title: Photoshop-Style Workbench
    details: Menubar, ToolStrip, Activity Bar, resettable Dockview workspace, Outline, Layer Tree, Search, Inspector, Timeline, and StatusBar — every panel can be docked, floated, or rearranged.

  - icon: ⚡
    title: Cold / Hot Layered Rendering
    details: The Cold Layer maintains a spatial index, decoration cache, and RBush in a Web Worker; the Hot Layer redraws live previews per frame on the main thread. Phase E incremental decoration only re-renders affected lanes.

  - icon: 🖥️
    title: Web & Desktop, One Codebase
    details: Vite-powered web editor for development; Electron shell for desktop, with cross-platform packaging into Linux AppImage, macOS DMG, and Windows NSIS installers.

  - icon: 🔑
    title: Offline Machine-Bound Licensing
    details: The desktop build ships an offline activation flow bound to machine fingerprint; edit actions are uniformly intercepted by editableGuard until activated.

  - icon: 🧠
    title: XState 5 Finite State Machine
    details: editorMachine is the single source of truth for editor interaction, covering idle / drawing / editing states, working hand in hand with useDrawCommit and useActionDispatcher to keep undo / redo and mid-draw cancel coherent.

  - icon: 🧱
    title: Strict Layering & Anti-Corruption
    details: components → hooks → store → lib → core, one-way imports. The entityOps anti-corruption layer shields the UI from Apollo proto v2 upgrade risk — UI code sees only the abstract MapEntity model.

  - icon: 🧪
    title: Complete CI Pipeline
    details: typecheck, ESLint, Prettier, Vitest, benchmarks with regression budgets, husky + lint-staged pre-commit — performance regressions are auto-blocked at PR time.
---

<div class="vp-doc" style="max-width: 1152px; margin: 4rem auto 0; padding: 0 2rem;">

## Where to start

| If you want to…                          | Start here                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Try Apollo Map Studio for the first time | [Quick Start](/en/guide/getting-started)                                            |
| Import an Apollo base_map                | [Import](/en/guide/import) → [Import Deep Dive](/en/guide/importing)                |
| Draw lanes and connect them              | [Drawing Tools](/en/guide/drawing-tools) → [Drawing Lanes](/en/guide/drawing-lanes) |
| Understand coordinates & projection      | [Coordinate System](/en/guide/coordinate-system)                                    |
| Edit attributes in the Inspector         | [Inspector](/en/guide/inspector)                                                    |
| Export the map back to Apollo            | [Export](/en/guide/export) → [Export Deep Dive](/en/guide/exporting)                |
| Activate a desktop license               | [License Activation](/en/guide/license-activation)                                  |
| Hack on internals                        | [Architecture Overview](/en/architecture/overview)                                  |
| Add a new action / tool / element        | [Recipes](/en/recipes/adding-a-new-action)                                          |
| Contribute via PR                        | [Development Setup](/en/contributing/development-setup)                             |

## Key concepts

- **base_map** — the source HD map format from Apollo; the editor's input and output reference.
- **MapEntity** — internal entity abstraction, kept proto-agnostic by `entityOps`.
- **Cold / Hot Layer** — committed geometry (cold) and in-flight drawing / editing geometry (hot) flow through different render pipelines.
- **FSM** — XState 5 `editorMachine`, the single truth source for interaction.
- **Junction Graph** — endpoint-dependency graph used for incremental decoration.
- **Overlap** — N : N references between geometrically overlapping elements (e.g. lane × signal, lane × crosswalk).

## Status

- **Current version**: `v1.0.0` — released.
- **License**: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
- **Changelog**: [Changelog](/en/changelog).

</div>
