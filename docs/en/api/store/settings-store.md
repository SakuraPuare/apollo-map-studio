---
title: settingsStore — persisted user preferences
description: History limit, initial map view, default lane half-width, and arrow spacing — persisted to localStorage with bounded clamping.
---

# `settingsStore` — persisted user preferences

> Source: `src/store/settingsStore.ts` · 149 lines · not undoable

## Purpose

`settingsStore` is a **persisted** Zustand singleton holding user preferences — settings that should survive a restart but should never enter the Ctrl+Z history.

Each value is stored in `localStorage` (under the `apollo-map-studio:` namespace) and clamped to a valid range on every write. SSR, privacy mode, or browsers with localStorage disabled fall back to in-memory storage gracefully.

Four buckets:

| Bucket            | Field                                       | Unit        | Default                     |
| ----------------- | ------------------------------------------- | ----------- | --------------------------- |
| Undo limit        | `historyLimit`                              | steps       | 100                         |
| Map view          | `mapCenterLng` / `mapCenterLat` / `mapZoom` | °, °, level | from `mapConstants`         |
| Lane geometry     | `laneHalfWidth`                             | metres      | 1.75                        |
| Render decoration | `laneArrowSpacing`                          | pixels      | `LANE_ARROW_SYMBOL_SPACING` |

## Public API

### Hook

| Symbol             | Kind      | Signature                               | Summary            |
| ------------------ | --------- | --------------------------------------- | ------------------ |
| `useSettingsStore` | hook      | `() => SettingsState & SettingsActions` | Zustand store hook |
| `SettingsState`    | interface | see below                               | 6-field state      |
| `SettingsActions`  | interface | see below                               | 5 setters          |

### Setters

| Name                         | Signature                  | Notes                                 |
| ---------------------------- | -------------------------- | ------------------------------------- |
| `setHistoryLimit(value)`     | `(number) => void`         | Clamps to `[10, 1000]`, integer       |
| `setMapCenter(lng, lat)`     | `(number, number) => void` | Clamps to `[-180,180]` × `[-90,90]`   |
| `setMapZoom(value)`          | `(number) => void`         | Clamps to `[1, 22]`, float            |
| `setLaneHalfWidth(value)`    | `(number) => void`         | Clamps to `[0.5, 10]`, metres         |
| `setLaneArrowSpacing(value)` | `(number) => void`         | Clamps to `[40, 500]`, integer pixels |

### Bootstrap readers

For `useEffect`-free callers (e.g. `MapCanvas` initialisation):

| Name                     | Returns            | Description                |
| ------------------------ | ------------------ | -------------------------- |
| `readHistoryLimit()`     | `number`           | From LS, otherwise default |
| `readMapCenter()`        | `[number, number]` | `[lng, lat]`               |
| `readMapZoom()`          | `number`           | zoom level                 |
| `readLaneHalfWidth()`    | `number`           | metres                     |
| `readLaneArrowSpacing()` | `number`           | pixels                     |

### Range constants

```ts
DEFAULT_HISTORY_LIMIT = 100;
MIN_HISTORY_LIMIT = 10;
MAX_HISTORY_LIMIT = 1000;

MIN_MAP_ZOOM = 1;
MAX_MAP_ZOOM = 22;

MIN_LANE_HALF_WIDTH = 0.5;
MAX_LANE_HALF_WIDTH = 10;

MIN_LANE_ARROW_SPACING = 40;
MAX_LANE_ARROW_SPACING = 500;
```

The Settings panel binds `<Slider min max>` directly to these.

## localStorage keys

| Key                                  | Field              |
| ------------------------------------ | ------------------ |
| `apollo-map-studio:historyLimit`     | `historyLimit`     |
| `apollo-map-studio:mapCenterLng`     | `mapCenterLng`     |
| `apollo-map-studio:mapCenterLat`     | `mapCenterLat`     |
| `apollo-map-studio:mapZoom`          | `mapZoom`          |
| `apollo-map-studio:laneHalfWidth`    | `laneHalfWidth`    |
| `apollo-map-studio:laneArrowSpacing` | `laneArrowSpacing` |

A single namespace prefix avoids collisions when other apps share the same origin.

## Detailed entries

### `readNum(key, fallback, min, max)` — internal helper

```ts
function readNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
    }
  } catch {
    /* SSR / privacy mode */
  }
  return fallback;
}
```

Every `readXxx()` delegates here — same fallback / clamp behaviour, single try/catch site.

### `useSettingsStore` factory

The factory body invokes `readMapCenter()` / `readMapZoom()` / etc. _during initial setup_, so the store opens already-hydrated and no `useEffect` is needed to load preferences. SSR is tolerated thanks to `readNum`'s try/catch.

Source: `settingsStore.ts:107-148`.

### Setter shape

```ts
setHistoryLimit(value) {
  const v = Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(value)));
  set({ historyLimit: v });
  persist(HISTORY_LIMIT_KEY, v);
}
```

Every setter:

1. Clamps to its valid range.
2. Updates store state.
3. Writes localStorage.

`persist` is wrapped in try/catch — a failed LS write never bubbles, but the store still updates (consistency over durability).

### Coupling with `mapStore`

`historyLimit` reflects into `temporal.partialize` for zundo. The Settings panel calls `mapStore.temporal.getState().setState({ limit: v })` after `setHistoryLimit`; that wiring lives at the consumer site.

### Coupling with `laneHalfWidth`

`laneHalfWidth` is a default consumed by `entityOps.createEntity({ laneHalfWidth })`. The slider in Settings updates this for _future_ lane creation; it does not retroactively edit existing lane sample widths.

## Side effects

- Reads/writes localStorage (try/catch protected).
- No IPC, no timers.
- No cross-tab sync — by design (avoids zundo history desync between tabs).

## Test coverage

`src/store/__tests__/settingsStore.test.ts` covers:

- Range clamping (e.g. `zoom = 1000` → `22`)
- Fallback when localStorage is unavailable
- Setter triggers persist

## Consumers

- `src/components/layout/panels/SettingsPanel.tsx` — sliders bind directly to setters
- `src/store/mapStore.ts` — reads `historyLimit` to configure zundo
- `src/components/map/MapCanvas.tsx` — reads `mapCenter` / `mapZoom` on init
- `src/lib/entityOps/edit.ts` — `createEntity` default lane width fallback

## Source map

| Lines   | Content                                     |
| ------- | ------------------------------------------- |
| 11–16   | localStorage key constants                  |
| 20–31   | Range constants                             |
| 35–46   | `readNum` helper                            |
| 48–78   | `readHistoryLimit` / `readMapCenter` / etc. |
| 82–97   | `SettingsState` / `SettingsActions`         |
| 99–105  | `persist` helper                            |
| 107–148 | `useSettingsStore` factory                  |

## Privacy / SSR handling

`readNum` wraps `localStorage.getItem` in try/catch:

```ts
try {
  const raw = localStorage.getItem(key);
  // ...
} catch {
  /* SSR / privacy mode */
}
```

Triggers:

- SSR — `localStorage` undefined.
- Privacy mode — `getItem` may throw `SecurityError`.
- Cross-origin iframe — restricted access.

Every failure falls back to `fallback`. `persist()` is also protected — write failures do not bubble.

## Synchronous initial read

```ts
export const useSettingsStore = create<SettingsState & SettingsActions>()((set) => {
  const [lng, lat] = readMapCenter();
  return {
    historyLimit: readHistoryLimit(),
    mapCenterLng: lng,
    mapCenterLat: lat,
    // ...
  };
});
```

The factory body calls readers immediately, so the store opens already-hydrated. Cost: LS reads happen at module import time; SSR pays the try/catch overhead. Benefit: no `useEffect` hydration step, fewer re-renders, callers like `MapCanvas` can call `readMapCenter()` synchronously during init.

## Coupling with zundo history limit

```tsx
// simplified SettingsPanel.tsx
function HistoryLimitSlider() {
  const [v, setV] = useSettingsStore((s) => [s.historyLimit, s.setHistoryLimit]);
  return (
    <Slider
      min={MIN_HISTORY_LIMIT}
      max={MAX_HISTORY_LIMIT}
      value={v}
      onChange={(next) => {
        setV(next);
        useMapStore.temporal.getState().setState({ limit: next });
      }}
    />
  );
}
```

The setter manually syncs the value into zundo. The settings store does not know about `mapStore` (avoiding a circular dependency).

## Cross-tab isolation

Deliberately **does not** listen to `storage` events. Two tabs of the same project:

- Tab A sets `historyLimit = 200`.
- Tab B keeps showing 100.

Product decision — each tab has its own zundo history; cross-tab sync would desync the counts. Refreshing tab B picks up the new value.

## See also

- `mapStore` — actual consumer of `historyLimit`
- `mapConstants` (`src/config/mapConstants.ts`) — defaults source
- [`apolloMapStore`](./apollo-map-store.md) — non-persisted import-state counterpart
- `src/components/layout/panels/SettingsPanel.tsx` — UI
