# FSM Design

The editor interaction model is an XState 5 machine in
`src/core/fsm/editorMachine.ts`.

## Draw States

`DrawTool` currently includes:

- `drawPolyline`
- `drawBezier`
- `drawArc`
- `drawCatmullRom`
- `drawRotatedRect`
- `drawPolygon`

`DRAW_STATES` is the subset of states considered drawing states by
`isDrawingState()`. Tool actions send `SELECT_TOOL`, and the FSM moves into
the corresponding draw state with an optional active Apollo element binding.

## Core Context

The machine context tracks:

- `drawPoints`
- `bezierAnchors`
- `selectedEntityId`
- drag point index/type/current point;
- `activeElement`;
- `dragAltKey`.

Geometry drafts stay in FSM context until `useDrawCommit` materializes an
entity. This prevents invalid half-drawn shapes from entering `mapStore`.

## Commit And Reset

Some draw states transition to `idle` with enough geometry but intentionally
keep context long enough for `useDrawCommit` to read the post-transition
snapshot and call `mapStore.addEntity()`. After commit, `useDrawCommit` sends
`RESET` to clear temporary context.

This is why `CANCEL` and `RESET` are distinct events:

- `CANCEL` abandons a user operation.
- `RESET` is post-commit cleanup.

## Keyboard Routing

`src/hooks/mapEventRouter/keyboard.ts` maps:

- Escape -> `CANCEL`;
- Enter -> `CONFIRM`;
- Delete/Backspace in selected state -> `DELETE_ENTITY`.

Global action shortcuts are handled by `useActionDispatcher`, not by the FSM
directly.

## Undo Contract

Undo/redo must send `CANCEL` before zundo time travel. The FSM owns transient
draft and drag context; zundo owns `mapStore.entities`. Rolling back entities
without clearing FSM context can make the next commit refer to stale ids or
points. This contract is tested in `src/hooks/__tests__/undoCancel.test.ts`.
