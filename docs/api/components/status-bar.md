# StatusBar

> Source: `src/components/layout/StatusBar.tsx`

## Overview

`StatusBar` is the 24px-tall information strip pinned to the bottom of
the workspace. It surfaces:

- App mode (绘图 / 场景)
- Current FSM state with a pulsing dot for drawing states
- Entity count
- Imported Apollo map summary (filename, lane/road counts) with PROJ
  string in tooltip
- Grid / Snap toggles
- Cursor lng/lat (6 decimal precision)
- Map zoom level

License banner integration lives in `LicenseBanner` (separate
component, mounted between MenuBar and ToolStrip), but the status bar
is the user's persistent at-a-glance health surface.

## Component props

```ts
interface StatusBarProps {
  mode?: string; // FSM state value
  entityCount?: number;
}
```

| Prop          | Default  | Source                                |
| ------------- | -------- | ------------------------------------- |
| `mode`        | `'idle'` | `useSelector(actorRef, s => s.value)` |
| `entityCount` | `0`      | `useMapStore(s => s.entities.size)`   |

Other state is read from stores directly inside the component:
`uiStore.cursorLngLat`, `uiStore.currentZoom`, `uiStore.gridEnabled`,
`uiStore.snapEnabled`, `uiStore.appMode`, and `apolloMapStore.info`.

## Behavior

### Mode label table

```ts
const MODE_LABELS: Record<string, string> = {
  idle: 'Idle',
  selected: 'Selected',
  editingPoint: 'Dragging',
  drawPolyline: 'Draw: Polyline',
  drawCatmullRom: 'Draw: CatmullRom',
  drawBezier: 'Draw: Bezier',
  drawArc: 'Draw: Arc',
  drawRotatedRect: 'Draw: Rectangle',
  drawPolygon: 'Draw: Polygon',
};
```

Unknown modes fall through to the raw FSM state string.

### Drawing-state pulse

```tsx
const isDrawing = mode.startsWith('draw');
<div
  className={`w-1.5 h-1.5 rounded-full ${
    isDrawing ? 'bg-ams-accent animate-pulse' : 'bg-ams-text-disabled'
  }`}
/>;
```

The dot pulses cyan whenever the FSM is in any draw state, signalling
"the next click will commit a vertex".

### Apollo info section

Visible only when `apolloMapStore.info` is non-null (i.e. an Apollo
map has been imported):

```tsx
<div className="flex items-center gap-1.5" title={`PROJ: ${apolloInfo.projString}`}>
  <FaMap className="w-3 h-3 text-ams-accent" />
  <span>{apolloInfo.filename}</span>
  <span>
    lane={apolloInfo.counts.lane ?? 0} road={apolloInfo.counts.road ?? 0}
  </span>
</div>
```

Hovering shows the PROJ string used for the import — useful for
debugging coordinate mismatches.

### Grid / Snap indicators

Both indicators recolor based on `uiStore.gridEnabled` /
`uiStore.snapEnabled`:

```tsx
<div
  className={`flex items-center gap-1 ${gridEnabled ? 'text-ams-accent' : 'text-ams-text-disabled'}`}
>
  <FaTableCells className="w-3 h-3" />
  <span>Grid</span>
</div>
```

The status bar is read-only — clicking these does not toggle them.
Toggling lives on the ToolStrip and Action Registry.

### Cursor + zoom

```tsx
{
  cursorLngLat && (
    <span className="font-mono">
      {cursorLngLat[0].toFixed(6)}, {cursorLngLat[1].toFixed(6)}
    </span>
  );
}
<span className="font-mono">{currentZoom.toFixed(1)}x</span>;
```

`cursorLngLat` is updated via the RAF-coalesced
`createCursorScheduler` in `mapEventRouter/`. `currentZoom` updates on
`zoomend`.

### Design tokens

`StatusBar` is the second reference component for the `ams-*` token
migration (alongside `ActivityBar`). All colors route through the
semantic tokens — `text-ams-text-disabled` for labels,
`text-ams-text-secondary` for values, `text-ams-accent` for actives.

## Examples

### Mounting

```tsx
<StatusBar mode={currentState} entityCount={entityCount} />
```

`currentState` and `entityCount` come from `useSelector` and
`useMapStore` in `WorkspaceLayoutInner`.

### Reading the status bar's snapshot

```ts
const { cursorLngLat, currentZoom } = useUIStore.getState();
```

Same store the status bar uses — useful for headless tests.

## Related

- [License banner](/api/components/license-banner)
- [Tool strip](/api/components/tool-strip)
- [uiStore](/api/store/store-ui)
- [apolloMapStore](/api/store/apollo-map-store)
- [Map event router internals](/api/hooks/map-event-router-internals) — cursor scheduler
