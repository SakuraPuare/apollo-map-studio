---
title: SettingsPanel
description: Modal preferences dialog — undo history limit, map viewport (lng/lat/zoom), lane half-width, and arrow spacing; every commit lands directly in settingsStore + localStorage.
---

# SettingsPanel

> Source:
>
> - `src/components/layout/panels/SettingsPanel.tsx`
> - `src/components/layout/panels/MapMetadataForm.tsx` (embedded inside [MapOutline](./map-outline.md), not duplicated here)

## Purpose & UX role

`SettingsPanel` is a modal dialog hosting all "user preferences" settings. It currently has four sections:

1. **Undo History** — `historyLimit` (zundo cap), bounded by `MIN_HISTORY_LIMIT` / `MAX_HISTORY_LIMIT`.
2. **Map Viewport** — `mapCenterLng` / `mapCenterLat` / `mapZoom` (changes apply **after restart** because the MapLibre `Map` instance is already mounted).
3. **Lane** — `laneHalfWidth` (default half-width in metres) + `laneArrowSpacing` (lane-arrow spacing in pixels).
4. **Layout** — "Reset Layout to Default" button: clears both layout keys and reloads.

The dialog overlays as a modal (`bg-black/60 backdrop-blur-sm`); `Esc` closes, backdrop click closes.

## Component API

```ts
interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}
```

| Prop      | Type         | Default | Description          |
| --------- | ------------ | ------- | -------------------- |
| `open`    | `boolean`    | —       | Controls visibility. |
| `onClose` | `() => void` | —       | Close callback.      |

When `open` is false the component returns `null`; the modal is removed from the DOM entirely.

## NumInput subcomponent

A reusable controlled number input declared in-file:

```ts
function NumInput(props: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
  onReset: () => void;
}): JSX.Element;
```

Behavior:

- Typing only updates the draft (string), never the store — preventing per-keystroke persistence.
- `onBlur` calls `commit()`: `Number(value)` valid → clamp into `[min,max]` → `onCommit(n)`; invalid → `onReset()`.
- `Enter` triggers blur.

## Internal state

| Hook                                                                      | Purpose                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| `useSettingsStore(s.historyLimit)` + `setHistoryLimit`                    | Undo limit                                        |
| `useSettingsStore(s.mapCenterLng/Lat/Zoom)` + `setMapCenter / setMapZoom` | Viewport                                          |
| `useSettingsStore(s.laneHalfWidth/laneArrowSpacing)` + setters            | Lane defaults                                     |
| Six `useState<string>` `draft*`                                           | Per-field temporary string drafts; commit on blur |

`useEffect([open, onClose])` mounts a global `Escape` listener and cleans up on close.

## Side effects

| When                  | Behavior                                           |
| --------------------- | -------------------------------------------------- |
| `Esc` keydown         | `onClose()`                                        |
| Backdrop click        | `onClose()`                                        |
| Field blur / Enter    | Clamp + write `settingsStore`                      |
| `Reset Layout` button | `clearAllSavedLayouts(); window.location.reload()` |

## Render anatomy

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
  <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <Header title="Settings" onClose={onClose} />
    <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
      <Section title="Undo History">…</Section>
      <Section title="Map Viewport (restart to apply)">…</Section>
      <Section title="Lane">…</Section>
      <Section title="Layout">…</Section>
    </div>
  </div>
</div>
```

## Performance notes

- **Draft + commit pattern**: avoids serializing the whole settings store on every keystroke; persistence happens only on blur.
- **Lazy loaded**: pulled in via `WorkspaceLayout/lazyPanels.tsx:26-29` (`LazySettingsPanel`); not part of the initial bundle.
- **`max-h-[60vh] overflow-y-auto`**: keeps the dialog usable on small screens.

## Known gaps

- The "restart to apply" hint shows only on Map Viewport — the relative real-time-ness of other fields is not annotated explicitly.
- The "Reset Layout" button now clears the current layout keys before reloading. If dockview is still broken, use `View → Reset Layout`.

## Source map

| Concern                 | File location                |
| ----------------------- | ---------------------------- |
| Component body          | `SettingsPanel.tsx:63-240`   |
| `NumInput` subcomponent | `SettingsPanel.tsx:17-54`    |
| Esc listener            | `SettingsPanel.tsx:86-93`    |
| Undo History block      | `SettingsPanel.tsx:117-137`  |
| Map Viewport block      | `SettingsPanel.tsx:139-186`  |
| Lane block              | `SettingsPanel.tsx:188-219`  |
| Layout reset button     | `SettingsPanel.tsx:221-235`  |
| `settingsStore`         | `src/store/settingsStore.ts` |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — parent (the modal lives at the root)
- [`settingsStore`](/en/api/store) — data source
- [MapOutline](./map-outline.md) — embeds `MapMetadataForm` (covered there)
