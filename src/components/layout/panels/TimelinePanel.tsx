import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Play, Pause, Square, SkipBack, SkipForward,
  Plus, ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';

// Width (px) reserved on the left for the track-header column.
const TRACK_HEADER_WIDTH = 160;
// Right-side padding inside the track area so the last label isn't clipped.
const TRACK_RIGHT_PADDING = 16;

// ─── Types ─────────────────────────────────────────────────

interface Keyframe {
  time: number; // seconds
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

// ─── Playhead ──────────────────────────────────────────────

function Playhead({ time, zoom }: { time: number; zoom: number }) {
  const left = time * zoom;

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-cyan-400 z-20 pointer-events-none"
      style={{ left: `${left}px` }}
    >
      <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-cyan-400 rounded-full" />
    </div>
  );
}

// ─── Time Ruler ────────────────────────────────────────────

/**
 * Choose a tick step (seconds) so the ruler stays readable at the current
 * effective zoom. Aims for ~60px between major ticks.
 */
function pickRulerStep(duration: number, zoom: number): number {
  const targetPx = 60;
  const rawStep = targetPx / Math.max(zoom, 1);
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const c of candidates) {
    if (c >= rawStep) return c;
  }
  return Math.max(1, Math.ceil(duration / 10));
}

function TimeRuler({ duration, zoom }: { duration: number; zoom: number }) {
  const marks: number[] = [];
  const step = pickRulerStep(duration, zoom);

  for (let t = 0; t <= duration + 1e-9; t += step) {
    marks.push(Number(t.toFixed(3)));
  }

  return (
    <div className="relative h-6 bg-zinc-900/50 border-b border-white/[0.07]">
      {marks.map((t) => (
        <div
          key={t}
          className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${t * zoom}px` }}
        >
          <div className="w-px h-2 bg-zinc-700" />
          <span className="text-[9px] font-mono text-zinc-600 mt-0.5">
            {t.toFixed(t % 1 === 0 ? 0 : 1)}s
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function TimelinePanel() {
  const [state, setState] = useState<TimelineState>({
    duration: 30,
    currentTime: 0,
    isPlaying: false,
    tracks: [
      {
        id: 'ego',
        name: 'Ego Vehicle',
        entityId: '',
        keyframes: [
          { time: 0, value: null },
          { time: 5, value: null },
          { time: 12, value: null },
        ],
        expanded: false,
        color: '#22d3ee',
      },
      {
        id: 'npc1',
        name: 'NPC Vehicle 1',
        entityId: '',
        keyframes: [
          { time: 3, value: null },
          { time: 8, value: null },
          { time: 15, value: null },
        ],
        expanded: false,
        color: '#f97316',
      },
      {
        id: 'signal1',
        name: 'Traffic Signal',
        entityId: '',
        keyframes: [
          { time: 0, value: null },
          { time: 10, value: null },
          { time: 20, value: null },
        ],
        expanded: false,
        color: '#22c55e',
      },
    ],
  });

  // Container width → derived effective zoom so the whole duration fits.
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [trackAreaWidth, setTrackAreaWidth] = useState<number>(600);
  const animationRef = useRef<number>();

  useLayoutEffect(() => {
    const el = trackAreaRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setTrackAreaWidth(w);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Effective zoom (px per second). Keep a floor so an extremely tight
  // panel still renders something sane, and keep it finite when duration=0.
  const effectiveZoom = Math.max(
    1,
    (Math.max(trackAreaWidth - TRACK_RIGHT_PADDING, 60)) / Math.max(state.duration, 0.001)
  );

  // Playback loop
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

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.isPlaying, state.duration]);

  const togglePlay = () => {
    setState((s) => ({ ...s, isPlaying: !s.isPlaying }));
  };

  const stop = () => {
    setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
  };

  const skipBack = () => {
    setState((s) => ({ ...s, currentTime: Math.max(0, s.currentTime - 1) }));
  };

  const skipForward = () => {
    setState((s) => ({ ...s, currentTime: Math.min(s.duration, s.currentTime + 1) }));
  };

  const toggleTrackExpand = (trackId: string) => {
    setState((s) => ({
      ...s,
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, expanded: !t.expanded } : t
      ),
    }));
  };

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Transport controls */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-white/[0.07] shrink-0">
        <button onClick={skipBack} className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-200">
          <SkipBack className="w-4 h-4" />
        </button>
        <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-200">
          {state.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={stop} className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-200">
          <Square className="w-4 h-4" />
        </button>
        <button onClick={skipForward} className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-200">
          <SkipForward className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Time display */}
        <span className="font-mono text-xs text-cyan-400 w-24">
          {formatTime(state.currentTime)}
        </span>
        <span className="text-zinc-600 text-xs">/</span>
        <span className="font-mono text-xs text-zinc-500 w-24">
          {formatTime(state.duration)}
        </span>

        <div className="flex-1" />

        {/* Add track button */}
        <button className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded">
          <Plus className="w-3 h-3" />
          Add Track
        </button>
      </div>

      {/* Timeline area — fit-to-container, no horizontal scroll */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed-width track header column */}
        <div
          className="shrink-0 flex flex-col border-r border-white/[0.07] bg-zinc-900/30"
          style={{ width: `${TRACK_HEADER_WIDTH}px` }}
        >
          {/* Ruler spacer so tracks line up with the time ruler */}
          <div className="h-6 border-b border-white/[0.07]" />
          {state.tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-1 px-2 h-8 border-b border-white/[0.05]"
            >
              <button onClick={() => toggleTrackExpand(track.id)} className="p-0.5">
                <ChevronRight
                  className={clsx(
                    'w-3 h-3 text-zinc-600 transition-transform',
                    track.expanded && 'rotate-90'
                  )}
                />
              </button>
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: track.color }}
              />
              <span className="text-[11px] text-zinc-400 truncate">{track.name}</span>
            </div>
          ))}
        </div>

        {/* Flexible track/ruler column — width-measured, no horizontal scrollbar */}
        <div ref={trackAreaRef} className="flex-1 min-w-0 relative overflow-hidden">
          {/* Time ruler */}
          <TimeRuler duration={state.duration} zoom={effectiveZoom} />

          {/* Tracks */}
          <div className="relative">
            {state.tracks.map((track) => (
              <div
                key={track.id}
                className="relative h-8 border-b border-white/[0.05]"
              >
                {track.keyframes.map((kf, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 w-3 h-3 rounded-sm cursor-pointer hover:scale-125 transition-transform"
                    style={{
                      left: `${kf.time * effectiveZoom}px`,
                      backgroundColor: track.color,
                      transform: 'translate(-50%, -50%) rotate(45deg)',
                    }}
                    title={`${kf.time.toFixed(2)}s`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Playhead — spans the full track area including the ruler */}
          <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none">
            <Playhead time={state.currentTime} zoom={effectiveZoom} />
          </div>
        </div>
      </div>
    </div>
  );
}
