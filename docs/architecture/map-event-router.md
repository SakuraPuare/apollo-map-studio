# Map Event Router

Source: `src/hooks/useMapEventRouter.ts` and `src/hooks/mapEventRouter/*`.

The map event router translates MapLibre mouse/keyboard events into editor FSM
events and store commits.

## Responsibilities

- deduplicate double-click input;
- route click selection and draw point placement;
- start selected-entity drag;
- run snap before sending draw/drag points to the FSM;
- commit drag edits on mouseup;
- handle connect-lanes modal clicks;
- update cursor and zoom UI state;
- route Escape, Enter and Delete.

For implementation details see [useMapEventRouter](/api/hooks/use-map-event-router)
and [Map event router internals](/api/hooks/map-event-router-internals).
