# WorkspaceLayout

> Source: `src/components/layout/WorkspaceLayout.tsx`, `src/components/layout/WorkspaceLayout/{dockviewLayout,lazyPanels}.tsx`

## Overview

`WorkspaceLayout` is the root chrome of the editor — the Photoshop-
style menubar + toolstrip + sidebar + canvas + statusbar shell. It
hosts the `EditorProvider` (XState 5 actor), the `SidebarProvider`
(activity-bar tab state), and Dockview as the resizable panel manager.
Modal overlays (Command Palette, Settings, ProjPicker, Activation,
TaskProgress) sit at the same level so they can layer above any panel.

## Component tree

```
WorkspaceLayout
  └─ EditorProvider (actor)
     └─ SidebarProvider (tab state)
        └─ WorkspaceLayoutInner
           ├─ MenuBar
           ├─ LicenseBanner
           ├─ ToolStrip
           ├─ ActivityBar + DockviewReact (key={appMode})
           │   ├─ Map panel       → MapPanelContent → MapCanvas
           │   ├─ Sidebar panel   → SidebarPanelContent
           │   ├─ Inspector panel → InspectorPanelContent
           │   └─ Timeline panel  → TimelinePanelContent (scene mode only)
           ├─ StatusBar
           └─ overlays: CommandPalette, SettingsPanel, ProjPickerDialog,
              TaskProgressOverlay, ActivationDialog
```

## Component props

`WorkspaceLayout` takes no props — it's mounted at the application
root.

`WorkspaceLayoutInner` is internal and reads everything from context
and stores.

## Behavior

### Provider stack

```tsx
export function WorkspaceLayout() {
  const actorRef = useActorRef(editorMachine);
  return (
    <EditorProvider actorRef={actorRef}>
      <SidebarProvider>
        <WorkspaceLayoutInner />
      </SidebarProvider>
    </EditorProvider>
  );
}
```

`useActorRef(editorMachine)` instantiates the FSM exactly once. The
`EditorProvider` makes the actor available to nested components via
`useEditorActor()`.

### Mounting useLicenseSync

`WorkspaceLayoutInner` calls `useLicenseSync()` on mount — this is the
single subscription point for the license bridge. See
[useLicenseSync](/api/hooks/use-license).

### Action dispatcher binding

```ts
const { execute, getToggleState } = useActionDispatcher({
  actorRef,
  onOpenCommandPalette: () => setCommandPaletteOpen(true),
  onOpenSettings: () => setSettingsOpen(true),
  onResetLayout: handleResetLayout,
});
```

The two callbacks `execute` and `getToggleState` are passed down to
`MenuBar`, `ToolStrip`, and `CommandPalette`, ensuring every UI surface
runs through the same handler set + license guard.

### Dockview wiring

```tsx
<DockviewReact
  key={appMode}
  components={components}
  onReady={onReady}
  className="dockview-theme-dark"
/>
```

The `key={appMode}` is load-bearing: switching between drawing and
scene modes mounts a fresh Dockview instance, which in turn re-runs
`onReady` — that's where the per-mode default layout or saved layout
is restored.

### onReady → load or default layout

```ts
const onReady = useCallback(
  (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    if (!loadLayout(event.api, appMode)) {
      createDefaultLayout(event.api, appMode);
    }
    event.api.onDidLayoutChange(() => saveLayout(event.api, appMode));
  },
  [appMode],
);
```

`loadLayout` tries to restore the JSON layout from `localStorage`. If
nothing's saved (or parse fails), `createDefaultLayout` runs.
Subsequent changes are persisted via `onDidLayoutChange`.

### Reset-layout action

```ts
const handleResetLayout = useCallback(() => {
  if (apiRef.current) {
    clearSavedLayout(appMode);
    apiRef.current.clear();
    createDefaultLayout(apiRef.current, appMode);
  }
}, [appMode]);
```

Clears localStorage, wipes the live Dockview, recreates the default.
Wired to the `resetLayout` action via `useActionDispatcher`.

### Cmd+K shortcut for command palette

`WorkspaceLayoutInner` adds its own `keydown` listener for `⌘K` /
`Ctrl+K` to toggle the command palette. This is intentionally separate
from `useActionDispatcher`'s registry-driven shortcuts because the
palette toggle needs to also short-circuit ESC behavior independent of
the registry.

## WorkspaceLayout/dockviewLayout.ts

Persistence helpers for Dockview layouts.

```ts
export function clearSavedLayout(mode: AppMode): void;
export function saveLayout(api: DockviewApi, mode: AppMode): void;
export function loadLayout(api: DockviewApi, mode: AppMode): boolean;
export function createDefaultLayout(api: DockviewApi, mode: AppMode): void;
```

### Per-mode storage keys

```ts
const LAYOUT_KEY_BY_MODE: Record<AppMode, string> = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};
```

Drawing and scene modes have completely separate saved layouts. The
`v3` suffix lets us bump and invalidate old stale shapes without
breaking users on existing installs.

### Default layout

```ts
api.addPanel({ id: 'map', component: 'map', title: 'Map Editor' });
api.addPanel({ id: 'sidebar', position: { referencePanel: 'map', direction: 'left' }, ... });
api.addPanel({ id: 'inspector', position: { referencePanel: 'map', direction: 'right' }, ... });

api.getPanel('sidebar')?.api.setSize({ width: 240 });
api.getPanel('inspector')?.api.setSize({ width: 280 });

if (mode === 'scene') {
  api.addPanel({ id: 'timeline', position: { referencePanel: 'map', direction: 'below' }, ... });
  api.getPanel('timeline')?.api.setSize({ height: 180 });
}
```

Drawing mode has 3 panels (sidebar / map / inspector). Scene mode adds
a 180px timeline below the map.

## WorkspaceLayout/lazyPanels.tsx

Code-splitting boundary for the heavy panel implementations. Every
panel that's not always-visible loads lazily.

| Lazy import            | Module                                  |
| ---------------------- | --------------------------------------- |
| `LazyMapCanvas`        | `@/components/map/MapCanvas`            |
| `LazySidebarPanel`     | `../panels/SidebarPanel`                |
| `LazyTimelinePanel`    | `../panels/TimelinePanel`               |
| `LazyCommandPalette`   | `../panels/CommandPalette`              |
| `LazySettingsPanel`    | `../panels/SettingsPanel`               |
| `LazyProjPickerDialog` | `@/components/dialogs/ProjPickerDialog` |
| `LazyEntityForm`       | `../panels/InspectorForms`              |

### Panel content components

```tsx
export function MapPanelContent(): JSX.Element;
export function makeSidebarPanel(onOpenSettings: () => void): React.FC;
export function InspectorPanelContent(): JSX.Element;
export function TimelinePanelContent(): JSX.Element;
```

Each wraps its lazy import in a `<Suspense fallback={<PanelFallback />}>`
boundary. `InspectorPanelContent` reads `selectedEntityId` from the
FSM and `entity` from `mapStore`, then renders the schema-driven form
or a placeholder.

### makeSidebarPanel pattern

```tsx
export function makeSidebarPanel(onOpenSettings: () => void) {
  return function SidebarSlot() {
    return (
      <Suspense fallback={<PanelFallback label="Loading sidebar..." />}>
        <LazySidebarPanel onOpenSettings={onOpenSettings} />
      </Suspense>
    );
  };
}
```

Dockview's component map needs stable references; `WorkspaceLayoutInner`
calls `makeSidebarPanel(onOpenSettings)` inside a `useRef(...).current`
so the function reference stays the same across renders.

### Fallback components

```tsx
export function PanelFallback({ label }: { label: string }): JSX.Element;
export function OverlayFallback({ label }: { label: string }): JSX.Element;
```

Inline loading placeholders so a slow chunk doesn't black-flash. The
overlay variant covers the full viewport with a scrim — used while
the command palette / settings panel chunks load.

## Examples

### Mounting the editor

```tsx
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';

ReactDOM.createRoot(document.getElementById('root')!).render(<WorkspaceLayout />);
```

### Adding a new panel

1. Add the lazy import + content component to `lazyPanels.tsx`.
2. Add it to the `components` map in `WorkspaceLayoutInner`.
3. Add a panel record to `createDefaultLayout` with a `position`.

### Swapping the dockview key

```ts
useUIStore.getState().setAppMode('scene');
// → DockviewReact remounts → onReady → loadLayout('scene') or default
```

## Related

- [Menu bar](/api/components/menu-bar)
- [Activity bar](/api/components/activity-bar)
- [Tool strip](/api/components/tool-strip)
- [Status bar](/api/components/status-bar)
- [Map canvas](/api/components/map-canvas)
- [Inspector forms](/api/components/inspector-forms)
- [Action dispatcher](/api/hooks/use-action-dispatcher)
- [License sync](/api/hooks/use-license)
- [uiStore](/api/store/store-ui)
