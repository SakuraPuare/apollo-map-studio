# `types/editor`

> Source: [`src/types/editor.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/src/types/editor.ts)

Editor-side runtime types that have no proto counterpart. The current
file is intentionally minimal — most editor state is colocated with
the FSM (`src/core/fsm/editorMachine.ts`), the action registry
(`src/core/actions/registry.ts`), or the relevant Zustand store
(`src/store/`).

This page also documents adjacent runtime types that callers commonly
import alongside `editor.ts` so the picture is complete.

## Module surface

The literal contents of `src/types/editor.ts`:

```ts
/** 拖拽点类型 */
export type DragPointType = 'vertex' | 'handleIn' | 'handleOut' | 'rotate' | 'center';
```

That's it. Everything else on this page lives in adjacent modules.

### `DragPointType`

| Value         | Meaning                                                  | Used by                                       |
| ------------- | -------------------------------------------------------- | --------------------------------------------- |
| `'vertex'`    | A polyline / polygon corner; click-drag moves it         | Polyline, polygon, Catmull-Rom, Bezier anchor |
| `'handleIn'`  | Bezier in-handle for the previous segment                | Bezier anchor edit overlay                    |
| `'handleOut'` | Bezier out-handle for the next segment                   | Bezier anchor edit overlay                    |
| `'rotate'`    | Rotation handle on a rotated rectangle                   | Parking space, crosswalk, clear area          |
| `'center'`    | Centre-of-mass drag for translating an entity as a whole | Rotated-rect tools, polygon body              |

The hot-layer renderer (`useHotLayer`) keys its handle features on this
discriminator so the same MapLibre layer set can paint vertices,
handles, and rotation grips with paint expressions like
`['match', ['get', 'kind'], …]`.

---

## Adjacent runtime types

These types are not exported from `types/editor.ts` but are part of the
"editor runtime" semantic neighbourhood. They are listed here for
discoverability; follow the source links for the canonical definitions.

### Drawing tool tags

```ts
// src/core/elements.ts
export type DrawTool =
  | 'drawPolyline'
  | 'drawCatmullRom'
  | 'drawBezier'
  | 'drawArc'
  | 'drawRotatedRect'
  | 'drawPolygon';
```

`drawRect` was unified into `drawRotatedRect` early in the v1 line —
the editor only ever exposes one rectangle tool. The FSM has one
matching state per `DrawTool` value (e.g. `drawBezier` ↔ FSM state
`drawBezier`).

### `MapElementType`

```ts
// src/core/elements.ts
export type MapElementType =
  | 'lane'
  | 'junction'
  | 'pncJunction'
  | 'parkingSpace'
  | 'crosswalk'
  | 'signal'
  | 'stopSign'
  | 'speedBump'
  | 'yieldSign'
  | 'clearArea'
  | 'barrierGate'
  | 'area';
```

Subset of `ApolloEntityType` covering every element with a toolbar
entry. Drives the toolstrip, layer tree, and the per-type colour /
icon registry in `MAP_ELEMENTS`.

### Action registry

```ts
// src/core/actions/registry.ts
export interface ActionDef {
  id: string;
  label: string;
  shortcut?: string;
  keybinding?: string;
  icon?: string;
  category?: string;
  menu?: string;
  menuOrder?: number;
  inCommandPalette?: boolean;
  drawTool?: DrawTool;
}
```

Single source of truth for every user-executable action. Consumers
include `MenuBar`, `CommandPalette`, `ToolStrip`, and the keyboard
handler. Adding a new action only requires touching `registry.ts` (and
optionally `elements.ts` if it introduces a new element type).

### Layer state

```ts
// src/store/uiStore.ts
export interface LayerState {
  visible: boolean;
  locked: boolean;
}

export type LayerStates = Record<MapElementType, LayerState>;
```

Lives on `uiStore` (not `mapStore`) because it is a UX preference
rather than map data — toggling visibility doesn't enter the undo
history.

### Panel kind

```ts
// src/components/layout panels
export type PanelKind = 'outline' | 'layers' | 'search' | 'inspector' | 'timeline' | 'console';
```

Panels are dockview-managed; this discriminant is mainly used by the
"reset layout" menu action that rebuilds the dockview model from a
fresh template.

---

## Why is this file so small?

Earlier drafts of the editor accumulated a `types/editor.ts` god-file
that ended up coupling unrelated modules. The current convention is:

1. **Pure proto types** → [`types/apollo.ts`](/api/types/apollo).
2. **Drawing primitives + `MapEntity` union** → [`types/entities.ts`](/api/types/entities).
3. **Inspector schema descriptors** → [`types/inspectorSchema.ts`](/api/types/inspector-schema).
4. **Genuinely cross-cutting editor runtime types** → here, but
   currently only `DragPointType` qualifies.
5. **Module-local types** → colocated with their module (FSM events,
   action defs, store slices) rather than centralised.

This keeps the layering rules in
[ARCHITECTURE.md](/architecture/overview) clean: `types/` modules can
be imported from anywhere, but they shouldn't tempt callers to pull in
runtime modules transitively.

## See also

- [`types/apollo`](/api/types/apollo) — proto-mirrored types
- [`types/entities`](/api/types/entities) — `MapEntity` discriminated
  union + drawing primitives
- [`types/inspectorSchema`](/api/types/inspector-schema) — inspector
  schema descriptors
- [Architecture overview](/architecture/overview) — layering rules and
  R2 anti-corruption-layer policy
- `src/core/elements.ts` — element / draw-tool registry
- `src/core/actions/registry.ts` — `ActionDef` source of truth
