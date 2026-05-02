# Context / EditorContext

Source: `src/context/EditorContext.tsx`.

`EditorContext` provides the XState editor actor to layout, map and panel
components. Consumers use `useEditorActor()` rather than prop-drilling the
actor through every panel.

See [FSM Design](/en/architecture/fsm-design) and
[FSM / editorMachine](/en/api/core/fsm-editor-machine).
