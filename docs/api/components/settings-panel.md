# SettingsPanel

> Source: `src/components/layout/panels/SettingsPanel.tsx`

## Overview

`SettingsPanel` is the modal that opens when the user clicks the
Settings activity bar tab or selects File → Settings. It edits
`settingsStore` values that persist to localStorage — undo history
limit, map viewport defaults, lane half-width, lane arrow spacing.

The panel uses local "draft" state so users can type non-numeric
characters mid-edit without immediately clobbering the stored value;
the commit happens on blur or Enter.

## Component props

```ts
interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}
```

The panel is controlled by `WorkspaceLayoutInner` via
`settingsOpen` state. ESC closes it (handled internally), as does
clicking the backdrop or the X button.

## Behavior

### NumInput pattern

Each numeric field uses the local `<NumInput>` component:

```tsx
function NumInput({ value, onChange, min, max, step, onCommit, onReset }) {
  const commit = () => {
    const n = Number(value);
    if (Number.isFinite(n)) onCommit(Math.max(min, Math.min(max, n)));
    else onReset();
  };
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      ...
    />
  );
}
```

| Behavior | Detail                                                      |
| -------- | ----------------------------------------------------------- |
| Mid-edit | `onChange` updates draft string; entity is not touched      |
| Blur     | `commit()` parses, clamps to `[min, max]`, calls `onCommit` |
| Invalid  | `onReset()` restores draft to last committed value          |
| Enter    | Forces blur → commit                                        |

### Sections

| Section      | Field                   | Range                                                      | Source                          |
| ------------ | ----------------------- | ---------------------------------------------------------- | ------------------------------- |
| Undo History | `historyLimit`          | `MIN_HISTORY_LIMIT`–`MAX_HISTORY_LIMIT`                    | `settingsStore.setHistoryLimit` |
| Map Viewport | `mapCenterLng`          | -180 to 180                                                | `setMapCenter`                  |
| Map Viewport | `mapCenterLat`          | -90 to 90                                                  | `setMapCenter`                  |
| Map Viewport | `mapZoom`               | `MIN_MAP_ZOOM`–`MAX_MAP_ZOOM`                              | `setMapZoom`                    |
| Lane         | `laneHalfWidth` (m)     | `MIN_LANE_HALF_WIDTH`–`MAX_LANE_HALF_WIDTH`, step 0.25     | `setLaneHalfWidth`              |
| Lane         | `laneArrowSpacing` (px) | `MIN_LANE_ARROW_SPACING`–`MAX_LANE_ARROW_SPACING`, step 10 | `setLaneArrowSpacing`           |
| Layout       | Reset Layout button     | localStorage delete + window.location.reload()             | manual                          |

The Map Viewport section is annotated "(restart to apply)" — those
values seed `useMapLibreInit` once on mount; changing them mid-session
doesn't move the camera.

### Reset Layout button

```tsx
<button
  onClick={() => {
    localStorage.removeItem('ams-layout-v2');
    window.location.reload();
  }}
>
  Reset Layout to Default
</button>
```

::: warning Stale key
The button removes `ams-layout-v2` but the actual layout keys are
now `ams-layout-v3-drawing` and `ams-layout-v3-scene` (see
[Workspace Layout](/api/components/workspace-layout)). The
`useActionDispatcher.resetLayout` action covers the v3 keys
correctly. This button is the older path and is being phased out in
favor of the menu-action route.
:::

### ESC handling

```ts
useEffect(() => {
  if (!open) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [open, onClose]);
```

Each modal owns its own ESC binding because the global registry
shortcut handler suppresses ESC inside input fields, and the
SettingsPanel's input fields would otherwise swallow ESC.

## Examples

### Mounting

```tsx
{
  settingsOpen && (
    <Suspense fallback={<OverlayFallback label="Loading settings..." />}>
      <LazySettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Suspense>
  );
}
```

### Reading a setting elsewhere

```ts
const historyLimit = useSettingsStore((s) => s.historyLimit);
useMapStore.temporal.getState().setOptions({ limit: historyLimit });
```

### Adding a new setting

1. Add the field to `settingsStore` with a setter that clamps.
2. Export `MIN_X` / `MAX_X` constants alongside.
3. Add a `NumInput` (or other control) in this file's sections.

## Related

- [settingsStore](/api/store/settings-store)
- [Activity bar](/api/components/activity-bar) — Settings tab opens this modal
- [Workspace layout](/api/components/workspace-layout) — owns the open state
- [useActionDispatcher](/api/hooks/use-action-dispatcher) — `settings` action
