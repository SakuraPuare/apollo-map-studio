# Rendering Pipeline

Apollo Map Studio renders map elements as MapLibre GL layers, reacting to Zustand store changes.

## Map initialization

`MapEditor.tsx` initializes MapLibre with a blank dark background style (no tile server):

```ts
const style: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1a1a2e' } }],
}
```

After the `load` event fires:

1. Pattern images are registered (`addImage`) for crosswalk zebra, clear-area cross-hatch, speed-bump bars, parking-space grid
2. Icon images are registered for the signal light, stop-sign `×`, direction chevron, parking `P`
3. All GeoJSON sources and layers are added via `addMapElementLayers()`
4. `mapbox-gl-draw` is initialized and its event handlers are wired up

## Source → layer mapping

Each element type gets a dedicated GeoJSON source that is updated on every store change.

| Source ID              | Content                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `lanes-center`         | Lane centerline `LineString` features                         |
| `lanes-fill`           | Lane polygon features (centerline buffered to width)          |
| `lanes-left-boundary`  | Left boundary `LineString` features                           |
| `lanes-right-boundary` | Right boundary `LineString` features                          |
| `junctions`            | Junction `Polygon` features                                   |
| `signals`              | Signal `Point` features (position) + `LineString` (stop line) |
| `stop-signs`           | Stop sign `LineString` features                               |
| `crosswalks`           | Crosswalk `Polygon` features                                  |
| `clear-areas`          | Clear area `Polygon` features                                 |
| `speed-bumps`          | Speed bump `LineString` features                              |
| `parking-spaces`       | Parking space `Polygon` features                              |
| `connections`          | Synthetic `LineString` features from lane topology            |
| `lane-midpoints`       | Lane midpoint `Point` features for direction arrows           |

## Layer stack (bottom to top)

```
background (dark blue-grey fill)
│
├── lanes-fill          fill, color per LaneType, opacity 0.25
├── crosswalks-fill     fill-pattern: zebra canvas image
├── clear-areas-fill    fill-pattern: cross-hatch canvas image
├── parking-fill        fill-pattern: grid canvas image
│
├── junctions-fill      fill, orange, opacity 0.3
├── junctions-outline   line, orange, width 1.5
│
├── lanes-left-boundary  line, color/dash per BoundaryType
├── lanes-right-boundary line, color/dash per BoundaryType
├── speed-bumps          line, yellow, width 4
│
├── signals-stop-line    line, red, dashed
├── stop-signs-line      line, red, width 2
│
├── connections          line, cyan, dashed arrows
├── lane-direction       symbol, chevron icon rotated to heading
│
├── signals-icon         symbol, traffic-light icon
├── stop-signs-icon      symbol, × icon
└── parking-icon         symbol, P icon
```

## Reactive updates

`MapEditor` subscribes to `mapStore` with a selector that returns a serialized snapshot of all elements. When the snapshot changes (deep equality via Zustand's `subscribeWithSelector`), the component calls `map.getSource(id).setData(geojson)` for each affected source.

```ts
useEffect(() => {
  const unsub = useMapStore.subscribe(
    (s) => s.lanes, // selector
    () => updateLaneSources(map),
    { equalityFn: shallow }
  )
  return unsub
}, [map])
```

Separate subscriptions for each element collection mean only the relevant sources are updated on each edit, not the entire map.

## Canvas pattern images

Pattern images for fills are generated at runtime using the browser Canvas API:

```ts
function makeCrosswalkPattern(size = 32): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff22'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#ffffffcc'
  ctx.lineWidth = 3
  // Draw horizontal stripes
  for (let y = 4; y < size; y += 8) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, size, size)
}

map.addImage('crosswalk-pattern', makeCrosswalkPattern())
```

This approach requires no image assets and keeps the editor fully self-contained.

## mapbox-gl-draw integration

`MapEditor` initializes `MapboxDraw` in `simple_select` mode and casts it to `IControl` for MapLibre compatibility:

```ts
const draw = new MapboxDraw({ displayControlsDefault: false })
map.addControl(draw as unknown as maplibregl.IControl)
```

The draw instance is stored in a ref. When `uiStore.drawMode` changes, `MapEditor` calls:

```ts
switch (drawMode) {
  case 'draw_lane':
    draw.changeMode('draw_line_string')
    break
  case 'draw_junction':
    draw.changeMode('draw_polygon')
    break
  case 'select':
    draw.changeMode('simple_select')
    break
  // ...
}
```

On `draw.create` events, the new GeoJSON feature is wrapped into the appropriate editor type and dispatched to `mapStore.addElement()`.
