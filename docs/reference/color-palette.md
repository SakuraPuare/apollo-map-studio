# Color Palette

The editor has two distinct color domains:

1. **Chrome / surfaces** — semantic `ams-*` design tokens used by every
   React component. Driven from the `@theme` block in `src/index.css`.
   See [Design Tokens](/reference/design-tokens) for the per-token
   reference.
2. **Map data** — per-entity colors used by MapLibre layers to render
   compiled GeoJSON. Driven from `src/core/elements.ts` and
   `src/hooks/mapLibreInit/layers.ts`.

This page summarises both domains and lists accessibility notes.

## Chrome palette (`ams-*`)

The chrome aesthetic targets a "Precision Cartography Lab" look: a
single low-saturation neutral spine with one high-chroma accent.

### Backgrounds (`bg-ams-bg-*`)

| Token         | Value     | Where it shows up                          |
| ------------- | --------- | ------------------------------------------ |
| `bg-base`     | `#09090b` | Window root, dockview backdrop, tool strip |
| `bg-elevated` | `#18181b` | Inspector cards, popovers, command palette |

### Surfaces (`bg-ams-surface-*`)

Translucent overlays applied on top of `bg-base` or `bg-elevated`.

| Token            | Value                     | State                      |
| ---------------- | ------------------------- | -------------------------- |
| `surface-hover`  | `rgb(255 255 255 / 0.05)` | Mouseover, non-destructive |
| `surface-active` | `rgb(255 255 255 / 0.10)` | Selected / pressed         |

### Borders (`border-ams-border-*`)

| Token           | Value                     | Use                            |
| --------------- | ------------------------- | ------------------------------ |
| `border-subtle` | `rgb(255 255 255 / 0.07)` | Default separators             |
| `border-strong` | `rgb(255 255 255 / 0.10)` | Section headings, modal frames |

### Text (`text-ams-text-*`)

| Token            | Value     | Tier             | Contrast vs `bg-base`                  |
| ---------------- | --------- | ---------------- | -------------------------------------- |
| `text-primary`   | `#e4e4e7` | Body / values    | ~14.4:1 (AAA large+small)              |
| `text-secondary` | `#a1a1aa` | Data labels      | ~7.7:1 (AAA large, AA small)           |
| `text-muted`     | `#71717a` | Captions / hints | ~4.5:1 (AA large, borderline AA small) |
| `text-disabled`  | `#52525b` | Inactive icons   | ~2.8:1 (decorative only)               |

> The disabled tier intentionally drops below WCAG AA — the design
> system promises "looks disabled". Never use `text-disabled` for
> actionable copy.

### Accent (`*-ams-accent`)

| Token    | Value     | Use                                                               |
| -------- | --------- | ----------------------------------------------------------------- |
| `accent` | `#22d3ee` | Drawing-state ribbon, active-tab underline, dockview drag overlay |

Pairing `text-ams-accent` (`#22d3ee`) on `bg-ams-bg-base` (`#09090b`)
yields ~9.4:1 — comfortably AAA for both small and large text.

## Map-data palette (per-entity colors)

Source: `src/core/elements.ts` (`MAP_ELEMENTS` table).

| Entity type    | Color     | Geometry | Default draw tool | UI label |
| -------------- | --------- | -------- | ----------------- | -------- |
| `lane`         | `#4a9eff` | line     | `drawBezier`      | 车道     |
| `junction`     | `#ffcc00` | polygon  | `drawPolygon`     | 路口     |
| `pncJunction`  | `#ff9933` | polygon  | `drawPolygon`     | PNC 路口 |
| `parkingSpace` | `#7c5cbf` | polygon  | `drawRotatedRect` | 车位     |
| `crosswalk`    | `#ffffff` | polygon  | `drawRotatedRect` | 人行横道 |
| `signal`       | `#22cc44` | line     | `drawBezier`      | 信号灯   |
| `stopSign`     | `#ff0000` | line     | `drawBezier`      | 停车标志 |
| `speedBump`    | `#ffaa00` | line     | `drawBezier`      | 减速带   |
| `yieldSign`    | `#ff6600` | line     | `drawBezier`      | 让行标志 |
| `clearArea`    | `#ff4466` | polygon  | `drawRotatedRect` | 禁停区   |
| `barrierGate`  | `#aa66ff` | line     | `drawBezier`      | 道闸     |
| `area`         | `#66aaff` | polygon  | `drawPolygon`     | 区域     |

Crosswalks render with the `zebra-stripe` fill pattern and clear areas
render with the `red-hatch` pattern; the per-entity color is the line
fallback in both cases.

### Lane subtypes (`laneTypeColor`)

`laneTypeColor(type)` overrides the default `lane` color when the lane's
`type` enum is set:

| `LaneType`       | Color     | Rationale                          |
| ---------------- | --------- | ---------------------------------- |
| `CITY_DRIVING`   | `#4a9eff` | Default / motor vehicle main lane  |
| `BIKING`         | `#22cc44` | Green-mobility (matches signal)    |
| `SIDEWALK`       | `#cfd4dc` | Neutral light grey                 |
| `PARKING`        | `#7c5cbf` | Mirrors `parkingSpace` purple      |
| `SHOULDER`       | `#ffaa00` | Amber warning                      |
| `SHARED`         | `#66aaff` | Light blue (mixed-use)             |
| `NONE` / unknown | `#4a9eff` | Falls through to CITY_DRIVING blue |

### MapLibre layer constants

| Layer id              | Source / paint highlight                                       |
| --------------------- | -------------------------------------------------------------- |
| `grid-line`           | `rgba(255,255,255,0.18)` major, `rgba(255,255,255,0.07)` minor |
| `cold-fill`           | `['get', 'color']` from compiled feature                       |
| `cold-fill-crosswalk` | `fill-pattern: 'zebra-stripe'`, opacity 0.8                    |
| `cold-fill-cleararea` | `fill-pattern: 'red-hatch'`, opacity 0.7                       |
| `cold-line`           | `['get', 'color']`                                             |
| `cold-line-dotted`    | `['get', 'color']`, `line-dasharray: [0.01, 2.2]`              |
| `cold-line-dashed`    | `['get', 'color']`, `line-dasharray: [3, 3]`                   |
| `cold-labels`         | `LANE_ARROW_COLOR = '#ffffff'`, halo `rgba(0,0,0,0.4)`         |
| `hover-fill`          | `#ff4444`, opacity 0.12                                        |
| `selection-handles`   | `#ffcc00` rim with white stroke                                |
| `topology-overlay`    | `#ff66cc` magenta                                              |
| `edit-vertex`         | `#00d4ff` cyan, white stroke                                   |

`LANE_ARROW_COLOR` (and friends) are kept out of the design-token
catalogue because they are intrinsically tied to the map render loop,
not the chrome theme. They live in `src/config/mapConstants.ts`.

## Accessibility notes

- The chrome palette ships in dark mode only. WCAG AA is met by all
  text tiers except `text-disabled` (intentionally decorative).
- Map-data colors are tuned for _distinguishability_ on the dark
  basemap. They are not WCAG-rated against `bg-ams-bg-base` — labels
  are always rendered with a black halo (`rgba(0,0,0,0.4)`) and white
  fill so they remain legible on top of any line color.
- Several similar hues (`#ff4466` clear area vs `#ff0000` stop sign vs
  `#ff6600` yield) coexist intentionally — they are differentiated by
  geometry (polygon vs line) and icon, not color alone.
- The `accent` cyan (`#22d3ee`) and the lane-type cyan/blue range
  (`#4a9eff`, `#66aaff`) are visually distinct enough that drawing
  feedback is unambiguous; verified with simulated deuteranopia.
- Color-blind users should rely on the icon registry
  (`src/components/ui/icon-registry.ts`) for entity-type identification
  rather than color alone.

## See also

- [Design Tokens](/reference/design-tokens) — full `ams-*` reference
  with migration policy
- [Architecture overview](/architecture/overview) — where the design
  system sits in the layering rules
- `src/core/elements.ts` — element registry source of truth
- `src/hooks/mapLibreInit/layers.ts` — MapLibre layer setup
