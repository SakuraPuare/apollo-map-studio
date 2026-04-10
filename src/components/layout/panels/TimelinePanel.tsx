import { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Square, SkipBack, SkipForward,
  Plus, Trash2, ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';

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
  zoom: number; // pixels per second
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

function TimeRuler({ duration, zoom }: { duration: number; zoom: number }) {
  const marks: number[] = [];
  const step = zoom < 50 ? 5 : zoom < 100 ? 1 : 0.5;

  for (let t = 0; t <= duration; t += step) {
    marks.push(t);
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

// ─── Track Row ─────────────────────────────────────────────

function TrackRow({
  track,
  zoom,
  onToggleExpand,
}: {
  track: Track;
  zoom: number;
  onToggleExpand: () => void;
}) {
  return (
    <div className="flex border-b border-white/[0.05]">
      {/* Track header */}
      <div className="w-40 shrink-0 flex items-center gap-1 px-2 py-1 bg-zinc-900/30 border-r border-white/[0.07]">
        <button onClick={onToggleExpand} className="p-0.5">
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

      {/* Track timeline */}
      <div className="flex-1 relative h-8">
        {/* Keyframe markers */}
        {track.keyframes.map((kf, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm cursor-pointer hover:scale-125 transition-transform"
            style={{
              left: `${kf.time * zoom}px`,
              backgroundColor: track.color,
              transform: 'translateX(-50%) translateY(-50%) rotate(45deg)',
            }}
            title={`${kf.time.toFixed(2)}s`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function TimelinePanel() {
  const [state, setState] = useState<TimelineState>({
    duration: 30,
    currentTime: 0,
    isPlaying: false,
    zoom: 50, // 50px per second
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

  const timelineRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

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

      {/* Timeline area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track list + Timeline */}
        <div ref={timelineRef} className="flex-1 overflow-auto">
          <div className="relative" style={{ width: `${state.duration * state.zoom + 200}px` }}>
            {/* Time ruler */}
            <div className="sticky top-0 z-10 ml-40">
              <TimeRuler duration={state.duration} zoom={state.zoom} />
            </div>

            {/* Tracks */}
            <div className="relative">
              {/* Playhead */}
              <div className="absolute top-0 bottom-0 left-40 right-0">
                <Playhead time={state.currentTime} zoom={state.zoom} />
              </div>

              {state.tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  zoom={state.zoom}
                  onToggleExpand={() => toggleTrackExpand(track.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
