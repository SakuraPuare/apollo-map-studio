# Adding a New Drawing Tool

Drawing tools are FSM states. Adding one means extending
`src/core/fsm/editorMachine.ts` with a new state, teaching
`useDrawCommit` how to materialise an entity from that state's
context, and registering a tool action so users can switch to it.

The running example is a hypothetical `drawCircle` tool — click center,
click radius, commit. It produces a `CircleEntity` (you'd add the type
following [adding-a-new-element](./adding-a-new-element.md); this recipe
focuses on the FSM and dispatch path).

## FSM state shapes already in the registry

`editorMachine.ts` exports the `DrawTool` literal union and an internal
`DRAW_STATES` array used to fan out generic transitions:

```ts
export type DrawTool =
  | 'drawPolyline'
  | 'drawCatmullRom'
  | 'drawBezier'
  | 'drawArc'
  | 'drawRotatedRect'
  | 'drawPolygon';
```

Three reusable transition shapes already exist:

| Shape                             | Used by                                                        | Commit trigger                           |
| --------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `sharedDrawEvents`                | `drawPolyline`, `drawCatmullRom`                               | DOUBLE_CLICK / CONFIRM (≥ 2 points)      |
| `threeClickCommitEvents`          | `drawArc`, `drawRotatedRect`                                   | 3rd MOUSE_DOWN auto-commits              |
| Bespoke (drawBezier, drawPolygon) | one-off — handle drag (bezier), self-intersect guard (polygon) | DOUBLE_CLICK / CONFIRM with extra guards |

If your tool fits one of the first two shapes, reuse it. Otherwise
write a bespoke `on:` handler.

::: warning `// @ts-nocheck` reality
`editorMachine.ts` carries a deliberate `// @ts-nocheck` because
XState 5 generic inference still has open bugs around
`setup({}).createMachine(...)` typed actions. Until upstream fixes
land or we migrate, the file is excluded from typechecking. Treat it
like you would untyped JS — verify your changes by running the FSM
unit tests under `src/core/fsm/__tests__/` and exercising the tool
manually.
:::

## Step 1 — Extend the literal union and DRAW_STATES

```ts
// src/core/fsm/editorMachine.ts
export type DrawTool =
  | 'drawPolyline'
  | 'drawCatmullRom'
  | 'drawBezier'
  | 'drawArc'
  | 'drawRotatedRect'
  | 'drawPolygon'
  | 'drawCircle';

const DRAW_STATES: readonly DrawTool[] = [
  'drawPolyline',
  'drawCatmullRom',
  'drawBezier',
  'drawArc',
  'drawRotatedRect',
  'drawPolygon',
  'drawCircle',
];
```

`DRAW_STATES` powers `selectToolTransitions`, so all draw states can
freely switch to any other draw state via `SELECT_TOOL`. Adding to
this array is mandatory.

## Step 2 — Add the state node

For our two-click `drawCircle`:

```ts
// src/core/fsm/editorMachine.ts
states: {
  // … existing states …

  drawCircle: {
    on: {
      SELECT_TOOL: selectToolTransitions,
      MOUSE_DOWN: [
        // 2nd click commits
        { guard: ({ context }) => context.drawPoints.length === 1, target: 'idle', actions: 'addPoint' },
        // 1st click records center
        { actions: 'addPoint' },
      ],
      MOUSE_MOVE: { actions: 'updatePreview' },
      CANCEL: { target: 'idle', actions: 'resetDraw' },
    },
  },
},
```

If your tool needs a brand-new guard or action, add it inside the
`setup({ ... })` block — `guards` and `actions` keys collect every
named handler. Keep names verb-shaped (`circleCanCommit`, `pinAnchor`)
for readability.

::: warning Don't apply `actions: 'resetDraw'` on commit transitions
The `idle` target on a successful commit must **not** carry
`resetDraw`. `useDrawCommit` reads the post-transition snapshot to
materialise the entity — clearing context inside the transition would
strip the data before commit runs. Reset happens later via the
explicit `RESET` event that `useDrawCommit` sends after `addEntity`.
This is the "POST-transition snapshot" rule called out in
[/architecture/overview](../architecture/overview.md).
:::

## Step 3 — Teach `useDrawCommit` to materialise the entity

`src/hooks/useDrawCommit.ts` watches every transition. When the FSM
moves from a draw state to `idle`, it builds an entity from the
post-transition snapshot's `drawPoints` / `bezierAnchors` /
`activeElement` and calls `mapStore.addEntity`.

Two extension points:

### 3a. `hasGeometryForState`

Tells the commit guard whether the snapshot has enough geometry:

```ts
export function hasGeometryForState(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
): boolean {
  return (
    // … existing branches …
    state === 'drawCircle' && points.length >= 2
  );
}
```

### 3b. `commitEntity`

Adds a branch for the new state. If the user is drawing a basic
geometry primitive (no Apollo element armed), build the corresponding
`MapEntity`:

```ts
} else if (state === 'drawCircle' && points.length >= 2) {
  addEntity({
    id: nextEntityId('circle', entities),
    entityType: 'circle',
    center: toGeoPoint(points[0]!),
    radiusPoint: toGeoPoint(points[1]!),
  } as CircleEntity);
}
```

If the tool participates in Apollo element creation, route through
`createApolloEntity(element, state, points, anchors, …)` like the
existing branches.

## Step 4 — Register the action

Follow [adding-a-new-action](./adding-a-new-action.md) for the full
shape. The minimum is:

```ts
// src/core/actions/registry/types.ts
export type ActionId =
  | // … existing ids …
  | 'tool:drawCircle';

// src/core/actions/registry/definitions.ts
{
  id: 'tool:drawCircle',
  label: 'Draw Circle',
  category: 'tool',
  shortcut: 'O',
  keybinding: { key: 'o' },
  icon: FaRegCircle,
  inCommandPalette: true,
  drawTool: 'drawCircle',
},
```

`useActionDispatcher` automatically picks up every def with a
`drawTool` field and dispatches `SELECT_TOOL` to the FSM. No
component-level wiring needed.

## Step 5 — Hot layer preview (optional)

`useHotLayer` (`src/hooks/useHotLayer.ts`) renders the in-flight
drawing as a separate GeoJSON source. If your tool's preview shape is
not naturally expressible as the existing primitives (polyline / bezier
preview / polygon hull), extend the hot layer's preview builder to
emit the right `Feature[]` from `(state, drawPoints, previewPoint)`.

For our `drawCircle` example, the preview is a circle of radius
`distance(drawPoints[0], previewPoint)` centered at `drawPoints[0]` —
emit a polygon approximation (32 segments is enough for visual
smoothness).

## Step 6 — Cold layer compile

Once committed, the entity flows through `mapStore` → `useColdLayer` →
spatial worker. The worker (`src/core/workers/spatial.worker.ts` and
its delegated `spatialFeatures.ts`) needs a branch for the new
`entityType` so it produces feature output. Without this branch the
entity exists in state but never renders.

## Step 7 — Tests

Tests for FSM live under `src/core/fsm/__tests__/`. Add a test that:

1. Spawns an actor, sends `SELECT_TOOL` for the new tool.
2. Sends two `MOUSE_DOWN` events.
3. Asserts the snapshot is back in `idle` and `context.drawPoints`
   has the expected length.

The `useDrawCommit` test in `src/hooks/__tests__/` should be extended
to cover the new branch by exercising `hasGeometryForState` and
`commitEntity` with synthetic input.

## Step 8 — Manual verification

1. `pnpm dev`
2. Press `O` (or whatever shortcut you chose). The ToolStrip button
   should activate.
3. Click on the canvas — a center point should appear.
4. Move the mouse — a hot-layer preview should follow.
5. Click again — the entity should commit, FSM returns to `idle`, the
   tool button deactivates (because `RESET` runs after commit).
6. `Ctrl+Z` — the entity disappears, FSM stays clean.
7. While in `drawCircle` mid-draw, press `Esc` — `CANCEL` aborts and
   resets context.

## Common mistakes

- **`actions: 'resetDraw'` on the commit transition** — clears
  context before `useDrawCommit` reads it, entity never gets created.
- **Forgetting `DRAW_STATES`** — `SELECT_TOOL` from another draw
  state to your new one will not transition because the
  `selectToolTransitions` fan-out missed your tool.
- **Forgetting to send `RESET` after commit** — `useDrawCommit`
  already does this on every commit, so don't add a second one.
- **Adding the def with no underlying FSM state** — the dispatcher
  will send `SELECT_TOOL`, the FSM will silently ignore it (XState 5
  no-ops unhandled transitions), and the user's tool selection
  appears to do nothing.

## Cross-references

- [/architecture/state-management](../architecture/state-management.md) — FSM states and post-transition snapshot rule
- [/api/core](../api/core/) — `editorMachine`, `useDrawCommit` APIs
- [adding-a-new-element](./adding-a-new-element.md) — entity-side wiring
- [adding-a-new-action](./adding-a-new-action.md) — registry shape
