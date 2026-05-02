# Workspace Layout

The application shell is `WorkspaceLayout`.

## Composition

`src/components/layout/WorkspaceLayout.tsx` mounts:

- `MenuBar`
- `LicenseBanner`
- `ToolStrip`
- `ActivityBar`
- `DockviewReact`
- `StatusBar`
- `CommandPalette`
- `SettingsPanel`
- `ProjPickerDialog`
- `TaskProgressOverlay`
- `ActivationDialog`

`App.tsx` only renders `<WorkspaceLayout />`.

## Dockview Panels

Default drawing mode layout:

- map panel in the center;
- sidebar on the left;
- inspector on the right.

Scene mode adds a timeline panel below the map. Layouts are persisted per mode
under:

- `ams-layout-v3-drawing`
- `ams-layout-v3-scene`

`resetLayout` clears the current mode's key and recreates the default layout.

## Sidebar

The fixed `ActivityBar` chooses the current sidebar tab:

- Explorer -> `MapOutline`
- Layers -> `LayerTree`
- Search -> `SearchPanel`
- Timeline -> `TimelinePanel`
- Settings -> opens settings modal, then returns to Explorer

The sidebar content is lazy-wired through `WorkspaceLayout/lazyPanels.tsx`.

## Action Wiring

MenuBar, ToolStrip, CommandPalette and keyboard shortcuts all call the same
`useActionDispatcher` instance. This keeps license checks, undo cancellation,
tool selection and modal opening in one place.
