# Action Registry

The action registry is the single source of truth for user-executable
commands. The API reference lives at
[Actions Registry](/api/core/actions-registry).

## Files

- `src/core/actions/registry/types.ts`
- `src/core/actions/registry/definitions.ts`
- `src/core/actions/registry/helpers.ts`
- `src/hooks/useActionDispatcher.ts`
- `src/components/layout/MenuBar.tsx`
- `src/components/layout/ToolStrip.tsx`
- `src/components/layout/panels/CommandPalette.tsx`

## Contract

An `ActionDef` can appear in menus, the command palette, tool strip slots and
keyboard shortcuts. Adding a registry row is enough for UI discovery; adding a
dispatcher handler is what makes the action do work.

Draw-tool actions are special: a definition with `drawTool` is automatically
mapped to an FSM `SELECT_TOOL` event by the dispatcher.

## License Boundary

The dispatcher is also the renderer-side edit gate. Edit/tool/selection
actions call `assertEditable()` before executing. UI code should not bypass the
dispatcher for actions that mutate map content.
