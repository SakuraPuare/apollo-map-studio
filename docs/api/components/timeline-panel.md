# TimelinePanel

> Source: `src/components/layout/panels/TimelinePanel.tsx`

## Overview

`TimelinePanel` is the scene-mode bottom panel — a Premiere/After
Effects-style transport + multi-track keyframe view used to author
scenarios for Apollo simulator playback. The current implementation
is a UI scaffolding with placeholder ego/NPC/signal tracks; it ships
the layout, transport controls, ruler, and keyframe rendering
primitives, ready to be wired to a scene store.

It is **not** the undo timeline — undo/redo is owned by zundo and
exposed through `useActionDispatcher`. See
[mapStore](/api/store/store-map).

## Component props

```ts
export function TimelinePanel(): JSX.Element;
```

No props. Currently uses local `useState` for the placeholder timeline
state; a follow-up will lift this into a scene store.

## Behavior

### Layout

```
┌────────────────────────────────────────────────────────────┐
│ Transport: ⏮ ⏯ ⏹ ⏭   00:03.14 / 00:30.00          + Track │
├──────────┬─────────────────────────────────────────────────┤
│ Ego Veh. │ ▼  ●         ●        ●                         │
│ NPC 1    │ ▼      ●         ●            ●                 │
│ Signal   │ ▼  ●            ●                  ●           │
│ ...      │   |                ↑ playhead                   │
└──────────┴─────────────────────────────────────────────────┘
                      Ruler: 0  5  10  15  20  25  30s
```

A fixed 160px header column on the left, a flexible track area on the
right that fits the available width without horizontal scroll.

### Internal types

```ts
interface Keyframe {
  time: number;
  value: unknown;
}
interface Track {
  id: string;
  name: string;
  entityId: string;
  keyframes: Keyframe[];
  expanded: boolean;
  color: string;
}
interface TimelineState {
  duration: number; // seconds
  currentTime: number;
  isPlaying: boolean;
  tracks: Track[];
}
```

### Effective zoom (px/sec)

```ts
const TRACK_HEADER_WIDTH = 160;
const TRACK_RIGHT_PADDING = 16;

const effectiveZoom = Math.max(
  1,
  Math.max(trackAreaWidth - TRACK_RIGHT_PADDING, 60) / Math.max(duration, 0.001),
);
```

The hook measures the track area via `ResizeObserver` and divides the
width by `duration` to compute pixels per second. This guarantees the
whole timeline fits the panel — no horizontal scrollbar, the timeline
densifies or sparsens with panel size.

### Ruler step

```ts
function pickRulerStep(duration: number, zoom: number): number;
```

Picks a tick step from `[0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60]` so
major ticks land roughly every 60 px. Falls back to a coarse divisor
if duration is unusually long.

### Playhead loop

```ts
useEffect(() => {
  if (state.isPlaying) {
    const startTime = performance.now();
    const startPlayTime = state.currentTime;
    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const newTime = startPlayTime + elapsed;
      if (newTime >= state.duration) {
        setState((s) => ({ ...s, currentTime: 0, isPlaying: false }));
      } else {
        setState((s) => ({ ...s, currentTime: newTime }));
        animationRef.current = requestAnimationFrame(tick);
      }
    };
    animationRef.current = requestAnimationFrame(tick);
  }
  return () => animationRef.current && cancelAnimationFrame(animationRef.current);
}, [state.isPlaying, state.duration]);
```

`performance.now()`-anchored so the playhead doesn't drift across
tabs; resets currentTime + isPlaying to false when reaching the end
(stop-on-end semantics).

### Keyframe rendering

Each keyframe is a 12px rotated square centered on its `time *
effectiveZoom` x-offset:

```tsx
<div
  className="absolute top-1/2 w-3 h-3 rounded-sm cursor-pointer hover:scale-125 transition-transform"
  style={{
    left: `${kf.time * effectiveZoom}px`,
    backgroundColor: track.color,
    transform: 'translate(-50%, -50%) rotate(45deg)',
  }}
  title={`${kf.time.toFixed(2)}s`}
/>
```

Hover scale and a tooltip with seconds — the click handler is not yet
wired; this is the layout primitive, not the editor.

### Time format

```ts
const formatTime = (t: number) =>
  `${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}.${centiseconds.padStart(2, '0')}`;
```

`mm:ss.cc` — Premiere/After Effects parity.

## What's not here

- **No store wiring.** Tracks live in local component state. A
  `sceneStore` would replace this and persist across mode switches.
- **No keyframe editing.** Click-to-add and drag-to-move are TODO.
- **No FSM integration.** Playing the scene back doesn't step the
  editor — the future contract is "playback overrides hot/cold layer
  with scene snapshot".
- **No undo for scene edits.** The `useActionDispatcher.undo` /
  `redo` actions only touch `mapStore.entities`.

## Examples

### Mounting

```tsx
<TimelinePanel />
```

In drawing mode the panel isn't part of the default layout; in scene
mode, `createDefaultLayout` adds it at 180px height below the map.

### Wiring future scene state

```ts
// Hypothetical
const { tracks, currentTime, isPlaying, play, pause, seek } = useSceneStore();
```

Replacing the local `useState` with a store hook is the obvious
next step.

## Related

- [Workspace layout](/api/components/workspace-layout) — adds this panel in scene mode
- [uiStore.appMode](/api/store/store-ui)
- [mapStore](/api/store/store-map) — distinct from this panel; owns undo
