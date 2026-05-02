# Cold / Hot Layers

The renderer separates committed data from live interaction previews.

## Cold Layer

The cold layer is the committed map:

```text
mapStore.entities
  -> useColdLayer
  -> SpatialWorkerBridge
  -> spatial.worker
  -> cold GeoJSON source
```

It is worker-backed because Apollo maps can contain tens of thousands of
entities and feature generation includes lane boundary decoration, labels,
polygon fills and hit-test indexing.

## Hot Layer

The hot layer is the selected entity:

```text
editorMachine.context.selectedEntityId
  -> useHotLayer
  -> entityToHotFeatures()
  -> hot GeoJSON source
```

When a control point is dragged, the store is not updated on every mousemove.
`useHotLayer` applies `applyDrag()` to a temporary display entity, then the
real `mapStore.updateEntity()` happens on mouseup.

## Overlay Layer

Overlay is for transient geometry that is not yet an entity:

- current drawing points;
- Bezier handles;
- polygon/rectangle preview;
- snap indicator;
- helper lines.

Draft state comes from the XState editor machine. Once a draw state reaches a
commit condition, `useDrawCommit` materializes a `MapEntity` and writes it to
`mapStore`, moving it from overlay/hot into cold.

## Why The Split Exists

- Cold rendering can be asynchronous and chunked.
- Hot rendering must be immediate and frame-local.
- Overlay rendering can reflect invalid or incomplete geometry that should
  never enter `mapStore`.

The split is also the reason undo must cancel the FSM before time travel: the
store and the overlay/hot contexts are separate state machines.

## Related Modules

- `src/hooks/useColdLayer.ts`
- `src/hooks/useHotLayer.ts`
- `src/hooks/useOverlayLayer.ts`
- `src/hooks/useDrawCommit.ts`
- `src/core/workers/spatial.worker.ts`
- `src/lib/geoJsonHelpers.ts`
