---
title: WorkspaceLayout
description: Root editor shell — mounts MenuBar / LicenseBanner / ToolStrip / Dockview / StatusBar, injects EditorProvider + SidebarProvider, hosts every modal and overlay.
---

# WorkspaceLayout

> Source:
>
> - `src/components/layout/WorkspaceLayout.tsx`
> - `src/components/layout/WorkspaceLayout/dockviewLayout.ts`
> - `src/components/layout/WorkspaceLayout/lazyPanels.tsx`

## Purpose & UX role

`WorkspaceLayout` is the **root chrome** of Apollo Map Studio — the
Photoshop-style desktop editor shell. It contains:

1. **MenuBar** at the top (File / Edit / View / Tools / Help + mode toggle).
2. **LicenseBanner** (trial countdown / expiry warning).
3. **ToolStrip** (default tool + 11 element icons + tool variants + view toggles).
4. **Dockview shell** — left Sidebar, center MapCanvas, right Inspector, plus the bottom Timeline panel under Scene mode.
5. **StatusBar** at the bottom (mode / entity count / cursor / zoom / Apollo info).
6. **Overlays**: CommandPalette (⌘K), SettingsPanel (modal), ProjPickerDialog, TaskProgressOverlay, ActivationDialog.

It also mounts two React contexts:

- **`EditorProvider`** — exposes the XState 5 actor for `editorMachine`. Consumed by ToolStrip / MapCanvas / Inspector via `useEditorActor()`.
- **`SidebarProvider`** — holds `activeTab` (`ActivityBar`), search query, and other transient sidebar state.

## Composition tree

```mermaid
flowchart TB
  WL[WorkspaceLayout]
  WL --> EP[EditorProvider \(actor\)]
  EP --> SP[SidebarProvider \(tabs/search\)]
  SP --> Inner[WorkspaceLayoutInner]
  Inner --> MB[MenuBar]
  Inner --> LB[LicenseBanner]
  Inner --> TS[ToolStrip]
  Inner --> AB[ActivityBar]
  Inner --> DV[DockviewReact]
  DV --> MapPanel
  DV --> SidebarPanel
  DV --> InspectorPanel
  DV --> TimelinePanel
  Inner --> SB[StatusBar]
  Inner --> CP[CommandPalette \(lazy\)]
  Inner --> SetP[SettingsPanel \(lazy modal\)]
  Inner --> PPD[ProjPickerDialog \(lazy\)]
  Inner --> TPO[TaskProgressOverlay]
  Inner --> AD[ActivationDialog]
```

## Props

`WorkspaceLayout` is the entrypoint component and takes **no props**.

```ts
export function WorkspaceLayout(): JSX.Element;
```

`WorkspaceLayoutInner` (not exported) likewise takes no props. All
cross-subtree communication flows through `EditorProvider`,
`SidebarProvider`, or Zustand stores.

## Internal state

| Hook                                             | Type                                  | Purpose                                                                            |
| ------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `useActorRef(editorMachine)`                     | `ActorRefFrom<editorMachine>`         | Creates the XState actor at the top, injected into `EditorProvider`                |
| `useSelector(actorRef, s.value)`                 | `string`                              | Current FSM state name (`idle` / `selected` / `drawPolyline` / …)                  |
| `useSelector(actorRef, s.context.activeElement)` | `MapElementType \| null`              | Currently active element type                                                      |
| `useMapStore(s.entities.size)`                   | `number`                              | Entity count, fed into StatusBar                                                   |
| `useUIStore(s.appMode)`                          | `'drawing' \| 'scene'`                | App mode; used as Dockview React key (`<DockviewReact key={appMode} />`)           |
| `useSidebar()`                                   | `{ activeTab, setActiveTab }`         | Active activity-bar tab                                                            |
| `useState(false)` × 2                            | `commandPaletteOpen` / `settingsOpen` | Overlay toggles                                                                    |
| `useRef<DockviewApi>()`                          | `apiRef`                              | Imperative Dockview API handle (save/load layouts)                                 |
| `useRef({...components})`                        | Stable reference                      | Dockview requires a stable component map; rebuilt only when `openSettings` changes |
| `useActionDispatcher`                            | `{ execute, getToggleState }`         | Single Action Registry dispatcher; also wires the global keyboard handler          |
| `useLicenseSync()`                               | `void`                                | Side-effect: fetches and watches license state                                     |

## Side effects

| When                                | Behavior                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useEffect(() => keydown listener)` | `Cmd/Ctrl+K` toggles CommandPalette; `Esc` closes it. Cleaned up on unmount.                                                                                                     |
| `onReady(event)` Dockview           | Tries `loadLayout(api, appMode)` (from localStorage); falls back to `createDefaultLayout`. Subscribes `onDidLayoutChange` for auto-persist. Layout keys are split per `appMode`. |
| `<DockviewReact key={appMode}>`     | Force-rebuilds Dockview when `appMode` changes — prevents layout pollution between `drawing` ↔ `scene`.                                                                          |
| `useActionDispatcher` (inside)      | Registers global keydown listener; the dispatcher also receives the `onOpenCommandPalette` / `onOpenSettings` / `onResetLayout` callbacks injected here.                         |

::: warning R1 (undo + FSM consistency)
`useActionDispatcher` sends `CANCEL` to the actor before invoking
`undo`, ensuring a mid-draw `Ctrl+Z` does not desynchronize FSM
`drawPoints` from `mapStore.entities`. See [`useActionDispatcher`](/en/api/hooks/) and the [architecture audit](/en/architecture/) R1 section.
:::

## Render anatomy

```jsx
<div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100">
  <MenuBar onExecute={execute} getToggleState={getToggleState} />
  <LicenseBanner />
  <ToolStrip … />
  <div className="flex-1 flex overflow-hidden">
    <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
    <div className="flex-1">
      <DockviewReact key={appMode} components={components} onReady={onReady} className="dockview-theme-dark" />
    </div>
  </div>
  <StatusBar mode={currentState} entityCount={entityCount} />
  {commandPaletteOpen && <Suspense><LazyCommandPalette … /></Suspense>}
  {settingsOpen && <Suspense><LazySettingsPanel … /></Suspense>}
  <Suspense fallback={null}><LazyProjPickerDialog /></Suspense>
  <TaskProgressOverlay />
  <ActivationDialog />
</div>
```

### Dockview default layout

`createDefaultLayout(api, mode)` adds panels in this order:

1. `map` (center, title = `Map Editor`)
2. `sidebar` (left, `width: 240`)
3. `inspector` (right, `width: 280`)
4. `timeline` (bottom, **scene mode only**, `height: 180`)

Layout serialization keys:

```ts
const LAYOUT_KEY_BY_MODE = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};
```

### Lazy panels

`lazyPanels.tsx` wraps the following panels in `React.lazy(...)`:

- `MapCanvas` → `MapPanelContent`
- `SidebarPanelContent` (explorer / layers / search / settings tabs)
- `TimelinePanel`
- `CommandPalette` / `SettingsPanel` / `ProjPickerDialog` / `EntityForm`

Every lazy boundary is wrapped in `<Suspense fallback={<PanelFallback label="Loading…" />}>` so the user sees a placeholder while the chunk loads.

## Performance notes

- **Stable Dockview component map**: pinned in `useRef({...}).current` so React doesn't re-mount panels on every parent re-render.
- **App-mode boundary re-mount**: `<DockviewReact key={appMode}>` forces a fresh instance via React key. The extra timeline panel under Scene mode mounts/unmounts cleanly.
- **Lazy boundaries**: every modal/overlay is split via `React.lazy` — CommandPalette / SettingsPanel / ProjPicker code stays out of the initial bundle.
- **Single root actor**: `useActorRef` runs once at the top. All children read it via `useEditorActor()`, avoiding duplicate FSM instantiation.

## Source map

| Concern                              | File location                             |
| ------------------------------------ | ----------------------------------------- |
| Entrypoint + Provider wiring         | `WorkspaceLayout.tsx:186-195`             |
| Internal layout body                 | `WorkspaceLayout.tsx:41-182`              |
| Keyboard `⌘K` / `Esc`                | `WorkspaceLayout.tsx:63-77`               |
| Reset layout                         | `WorkspaceLayout.tsx:80-86`               |
| `useActionDispatcher` call           | `WorkspaceLayout.tsx:89-94`               |
| Dockview onReady + persist           | `WorkspaceLayout.tsx:106-115`             |
| Default layout builder               | `WorkspaceLayout/dockviewLayout.ts:34-60` |
| Lazy panel wrappers                  | `WorkspaceLayout/lazyPanels.tsx:6-39`     |
| Inspector inline EntityForm dispatch | `WorkspaceLayout/lazyPanels.tsx:79-112`   |

## Cross-references

- [MenuBar](./menu-bar.md) / [ToolStrip](./tool-strip.md) / [ActivityBar](./activity-bar.md) / [StatusBar](./status-bar.md) — child components
- [MapCanvas](./map-canvas.md) — content of the center panel
- [InspectorForms](./inspector-forms.md) — content of the right panel
- [CommandPalette](./command-palette.md) / [SettingsPanel](./settings-panel.md) / [ProjPickerDialog](./proj-picker-dialog.md) / [TaskProgressOverlay](./task-progress-overlay.md) / [ActivationDialog](./activation-dialog.md) — overlays
- [`useActionDispatcher`](/en/api/hooks) — single action dispatcher and global shortcuts
- [Architecture overview](/en/architecture/) — tier rules, R1 undo fix
- [Layout evolution](/en/architecture/) — VS Code → Photoshop redesign

## Lifecycle in detail

### App startup sequence

```mermaid
sequenceDiagram
  participant ER as Electron Renderer
  participant App as <App />
  participant WL as WorkspaceLayout
  participant Actor as useActorRef(editorMachine)
  participant License as useLicenseSync
  participant Dock as DockviewReact
  participant LS as localStorage

  ER->>App: ReactDOM.createRoot
  App->>WL: <WorkspaceLayout />
  WL->>Actor: create actor
  Actor-->>WL: actorRef
  WL->>License: useLicenseSync()
  License->>License: bridge.getInitialState()
  WL->>Dock: <DockviewReact key={appMode} onReady />
  Dock->>WL: onReady(event)
  WL->>LS: loadLayout('ams-layout-v3-drawing')
  LS-->>WL: saved layout JSON
  WL->>Dock: api.fromJSON(saved) or createDefaultLayout
  Dock->>Dock: onDidLayoutChange → saveLayout
```

### Mode switch

When `appMode` flips:

1. The user clicks ModeToggle (inside MenuBar).
2. `setAppMode('scene')` writes into `useUIStore`.
3. `WorkspaceLayoutInner` re-renders. `<DockviewReact key="scene">` is treated as a new component — the old instance unmounts.
4. The unmount also removes the `onDidLayoutChange` subscription bound to `apiRef.current`.
5. The new instance mounts and its `onReady(event)` runs:
   - Tries `loadLayout('ams-layout-v3-scene')`.
   - Falls back to `createDefaultLayout(api, 'scene')`, which adds the extra `timeline` panel.

::: warning Layouts don't sync across modes
Layout storage is sharded by mode. Sidebar/inspector widths tuned in
drawing mode **do not** propagate to scene mode — this is intentional
so the two modes can have different workspaces.
:::

## Extension slots

The table below enumerates every "slot" `WorkspaceLayout` exposes, so
extension developers know where to plug new components in:

| Slot                | Source                                          | When to use                                           |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| MenuBar menu group  | add an action in `src/core/actions/registry.ts` | Adding a menu item                                    |
| ToolStrip view slot | actions with `slot: 'view'`                     | Add a view toggle (e.g. minimap toggle)               |
| ActivityBar tab     | `ActivityBar.tsx:11-17` `tabs` array            | Add a new sidebar tab                                 |
| Sidebar tab content | `SidebarPanel.tsx`                              | Implement the body of a new ActivityTab               |
| Inspector subform   | `InspectorForms.tsx:46-80` switch               | Add a form for a new `entityType`                     |
| Modal overlay       | `WorkspaceLayout.tsx:152-180`                   | Add a global modal (follow the SettingsPanel pattern) |
| Status bar segment  | `StatusBar.tsx`                                 | Add a bottom-bar indicator                            |

## Troubleshooting

| Symptom                                     | Likely cause                                                        | Fix                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Dockview shows nothing                      | localStorage layout JSON is incompatible with current component ids | `clearSavedLayout(appMode)` or bump `LAYOUT_KEY_BY_MODE` version |
| ⌘K is silent                                | CommandPalette lazy load failed / `onOpenCommandPalette` not wired  | Check `WorkspaceLayout.tsx:91`                                   |
| Old timeline panel sticks after mode switch | `key={appMode}` missing or bypassed                                 | Ensure `<DockviewReact key={appMode}>`                           |
| Undo desyncs while drawing                  | R1 fix in `useActionDispatcher` regressed                           | See `useActionDispatcher.ts:76-82`                               |
| Multiple actor instances                    | `useActorRef` accidentally called inside a child                    | Create the actor only once at the top of `WorkspaceLayout`       |

## Testing notes

1. **Layout persistence**: mock localStorage and verify saveLayout / loadLayout round-trip.
2. **Mode switch**: use testing-library's `userEvent.click` on ModeToggle and assert the timeline panel appears/disappears.
3. **Shortcuts**: simulate `keydown` (`{ key: 'k', metaKey: true }`) and assert the CommandPalette state toggles.
4. **Esc closes**: with CommandPalette open, dispatch Esc and assert it closes.
5. **Dockview reset**: call `handleResetLayout` and assert default layout returns.

E2E lives in `e2e/workspace-layout.spec.ts` (when Playwright is added).

## FAQ

**Q: Why use a React key on Dockview instead of an effect-driven destroy?**
A: Dockview manages non-React DOM state internally. The unmount → mount pair triggered by a key change is a clean teardown path; ref-based destroy is more error-prone.

**Q: Why `useRef({...components}).current` instead of `useMemo`?**
A: `useMemo` is not guaranteed to keep the cache on internal misses. `useRef` keeps the component map reference forever stable. Dockview re-mounts all panels when the component map changes, which we must avoid.

**Q: Why aren't ActivationDialog and TaskProgressOverlay lazy-loaded?**
A: Both are tiny (<4KB) and they need to register global callbacks / subscribe to stores at mount time. A delayed registration would make the first `licenseStore.promptActivation()` call a no-op.
