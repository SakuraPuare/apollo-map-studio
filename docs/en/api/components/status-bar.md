---
title: StatusBar
description: 24-pixel bottom status bar — surfaces app mode, FSM state, entity count, Apollo file info, Grid/Snap indicators, and the cursor lng/lat + zoom level.
---

# StatusBar

> Source: `src/components/layout/StatusBar.tsx`

## Purpose & UX role

`StatusBar` is the 24-pixel info strip at the very bottom of the workspace. It has no interactive affordance — **read-only display only**:

**Left half:**

- `Mode: Drawing / Scene` — current `appMode` from `useUIStore`
- FSM state indicator dot + label (`idle` / `Selected` / `Dragging` / `Draw: Polyline` …); under draw states the dot turns cyan + `animate-pulse`
- `Entities: N` — entity count
- If an Apollo map is loaded: `<FaMap /> {filename}` + `lane=N road=N`; hover shows the full PROJ string

**Right half:**

- Grid indicator: cyan/grey based on `uiStore.gridEnabled`
- Snap indicator: cyan/grey based on `uiStore.snapEnabled`
- Cursor lng/lat: `{lng.toFixed(6)}, {lat.toFixed(6)}` (only when the cursor is over the map)
- Zoom: `{currentZoom.toFixed(1)}x`

## Component API

```ts
interface StatusBarProps {
  mode?: string; // FSM state name
  entityCount?: number;
}
```

| Prop          | Type     | Default  | Description              |
| ------------- | -------- | -------- | ------------------------ |
| `mode`        | `string` | `'idle'` | FSM `s.value` string     |
| `entityCount` | `number` | `0`      | `mapStore.entities.size` |

`MODE_LABELS` constant map:

```ts
{
  idle: 'Idle',
  selected: 'Selected',
  editingPoint: 'Dragging',
  drawPolyline: 'Draw: Polyline',
  drawCatmullRom: 'Draw: CatmullRom',
  drawBezier: 'Draw: Bezier',
  drawArc: 'Draw: Arc',
  drawRotatedRect: 'Draw: Rectangle',
  drawPolygon: 'Draw: Polygon',
}
```

Unmapped values fall back to the raw string.

## Internal state

| Hook                         | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `useUIStore(s.cursorLngLat)` | Cursor lng/lat (`[lng, lat] \| null`)                |
| `useUIStore(s.currentZoom)`  | MapLibre current zoom                                |
| `useUIStore(s.gridEnabled)`  | Grid visibility                                      |
| `useUIStore(s.snapEnabled)`  | Snap toggle                                          |
| `useUIStore(s.appMode)`      | App mode (drawing/scene)                             |
| `useApolloMapStore(s.info)`  | Apollo import info (`null` hides the Apollo section) |

## Side effects

None. Pure derived display. The cursor lng/lat and zoom are written into `uiStore` by `useMapEventRouter` / `useMapLibreInit`; StatusBar only subscribes.

## Render anatomy

```jsx
<div className="h-6 bg-ams-bg-base border-t border-ams-border-subtle flex items-center px-2 text-[10px] text-ams-text-muted shrink-0">
  <div className="flex items-center gap-3">{/* left half */}</div>
  <div className="flex-1" />
  <div className="flex items-center gap-4">{/* right half */}</div>
</div>
```

## Performance notes

- **Granular selectors**: each `useUIStore(s => s.field)` only re-renders when that field changes; cursor moves do not redraw the grid block.
- **High-frequency `cursorLngLat`**: every mousemove updates the lng/lat field, but only the small StatusBar block re-renders — other components do not subscribe.
- **Design-token reference migration**: StatusBar and ActivityBar were the early adopters of the `ams-*` palette; see the [Architecture](/en/architecture/) "Design tokens" section.

## Known gaps

- **Hardcoded labels**: UI text such as `Mode:` and `Entities:` is defined directly in the component.
- **No error state**: FSM exceptions or worker failures do not turn the bar red.

## Source map

| Concern               | File location                    |
| --------------------- | -------------------------------- |
| Component body        | `StatusBar.tsx:22-122`           |
| `MODE_LABELS`         | `StatusBar.tsx:10-20`            |
| Left half             | `StatusBar.tsx:35-78`            |
| Right half            | `StatusBar.tsx:82-120`           |
| `cursorLngLat` writer | `src/hooks/useMapEventRouter.ts` |
| `currentZoom` writer  | `src/hooks/useMapLibreInit.ts`   |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — parent
- [`uiStore`](/en/api/store/store-ui) — `gridEnabled` / `snapEnabled` / `cursorLngLat` / `currentZoom` / `appMode`
- [`apolloMapStore`](/en/api/store/) — `info`
- [Architecture overview](/en/architecture/) — design tokens
