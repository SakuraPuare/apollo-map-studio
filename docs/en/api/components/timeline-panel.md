---
title: TimelinePanel
description: Bottom timeline panel for Scene mode — transport controls + container-fit ruler + tracks/keyframes (PoC; not yet wired to a persistent store).
---

# TimelinePanel

> Source: `src/components/layout/panels/TimelinePanel.tsx`

## Purpose & UX role

`TimelinePanel` is the bottom timeline shown in Scene mode (default 180px tall). Today it is a **PoC scaffold** — every track and keyframe is `useState` demo data inside the component. **Nothing here is wired to `mapStore` / `apolloMapStore` / any persistent store yet.**

Its purpose is to lock in the visual skeleton for future scene-editing capabilities:

- Top transport controls (`SkipBack` / `Play/Pause` / `Stop` / `SkipForward` + `Add Track`)
- Time display `mm:ss.cc / mm:ss.cc`
- 160px-wide track header column (chevron + color dot + name)
- Adaptive-width track + ruler region — **never shows a horizontal scrollbar** because a `ResizeObserver` measures the area and sets `effectiveZoom` (px/sec) to `(width - 16) / duration`
- Playhead (cyan 1px line + top dot)
- Each keyframe is a 12px × 12px 45°-rotated square colored from the track

## Component API

`TimelinePanel` takes no props:

```ts
export function TimelinePanel(): JSX.Element;
```

## Internal state

```ts
interface TimelineState {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  tracks: Track[];
}

interface Track {
  id: string;
  name: string;
  entityId: string;
  keyframes: { time: number; value: unknown }[];
  expanded: boolean;
  color: string;
}
```

| Hook                                     | Purpose                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| `useState<TimelineState>(...)`           | Current 30s duration + 3 demo tracks (Ego / NPC1 / Signal) |
| `useState<number>(600)` `trackAreaWidth` | Container width, kept in sync via ResizeObserver           |
| `useRef<HTMLDivElement>` `trackAreaRef`  | Measurement target                                         |
| `useRef<number \| null>` `animationRef`  | Playback RAF handle                                        |

## Side effects

| When                                               | Behavior                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useLayoutEffect([])`                              | Creates a `ResizeObserver(update)` and observes `trackAreaRef`; disconnects on cleanup                                                                                   |
| `useEffect([isPlaying, duration])`                 | When `isPlaying=true`, runs `requestAnimationFrame(tick)`: each frame `currentTime = startPlayTime + (now - startTime)`; stops at end; `cancelAnimationFrame` on cleanup |
| `togglePlay` / `stop` / `skipBack` / `skipForward` | Mutate `isPlaying` / `currentTime`                                                                                                                                       |
| `toggleTrackExpand(id)`                            | Flip `expanded` on a track                                                                                                                                               |

::: info `tick` closure caveat
`tick` updates `currentTime` via functional `setState`, so the `useEffect` deps **must not** include `currentTime` — listing it would restart the animation every frame. Note the `// eslint-disable-next-line react-hooks/exhaustive-deps`.
:::

## Subcomponents

### `Playhead`

```ts
function Playhead({ time, zoom }: { time: number; zoom: number }): JSX.Element;
```

Cyan vertical line + 12px dot at the top. `left = time * zoom`; `pointer-events: none`.

### `TimeRuler`

```ts
function TimeRuler({ duration, zoom }: { duration: number; zoom: number }): JSX.Element;
```

- Picks a tick step (`pickRulerStep(duration, zoom)`) that approximates 60px between major ticks. Candidates: `0.1 / 0.2 / 0.5 / 1 / 2 / 5 / 10 / 15 / 30 / 60`.
- Each tick is a 2px short line + `{t}s` label.

### `pickRulerStep`

```ts
function pickRulerStep(duration: number, zoom: number): number;
```

Returns the smallest "≥ 60/zoom" candidate; falls back to `Math.ceil(duration / 10)`.

## Render anatomy

```jsx
<div className="h-full flex flex-col bg-zinc-950">
  <div className="h-9 flex items-center gap-2 px-3 border-b border-white/[0.07]">
    {/* transport buttons + time + Add Track */}
  </div>
  <div className="flex-1 flex overflow-hidden">
    <div style={{ width: 160 }}>{/* track header column */}</div>
    <div ref={trackAreaRef} className="flex-1 min-w-0 relative overflow-hidden">
      <TimeRuler … />
      <div className="relative">{state.tracks.map(track => …)}</div>
      <Playhead time={currentTime} zoom={effectiveZoom} />
    </div>
  </div>
</div>
```

## Performance notes

- **Fit-to-container instead of scrollable**: avoids a horizontal scrollbar — fitting for the PoC stage. All keyframes render as absolute-positioned divs; once you exceed ~500 keyframes, virtualize.
- **RAF playback**: 60fps via `requestAnimationFrame`; `cancelAnimationFrame` on stop / unmount.
- **ResizeObserver lives once**: not rebuilt per render.

## Known gaps

- **Pure PoC**: tracks come from `useState` defaults, no real `setEntities` / `addKeyframe` API.
- No drag-the-playhead, no editable duration, no track ↔ entity binding.
- No keyframe copy/paste, no easing.
- The "Add Track" button has an empty onClick — it does nothing today.

## Source map

| Concern              | File location               |
| -------------------- | --------------------------- |
| Main component       | `TimelinePanel.tsx:100-344` |
| `Playhead`           | `TimelinePanel.tsx:43-54`   |
| `pickRulerStep`      | `TimelinePanel.tsx:62-70`   |
| `TimeRuler`          | `TimelinePanel.tsx:72-96`   |
| ResizeObserver       | `TimelinePanel.tsx:150-163` |
| Playback loop        | `TimelinePanel.tsx:172-201` |
| Transport controls   | `TimelinePanel.tsx:235-278` |
| Track header column  | `TimelinePanel.tsx:281-309` |
| Track + ruler column | `TimelinePanel.tsx:311-340` |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — `TimelinePanelContent` is added to Dockview only under scene mode
- [Architecture overview](/en/architecture/) — scene vs. drawing mode separation
