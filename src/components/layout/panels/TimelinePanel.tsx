import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  FaPlay,
  FaPause,
  FaStop,
  FaBackwardStep,
  FaForwardStep,
  FaPlus,
  FaChevronRight,
} from 'react-icons/fa6';
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

const INITIAL_TRACKS: Track[] = [
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
];

function createInitialTimelineState(): TimelineState {
  return {
    duration: 30,
    currentTime: 0,
    isPlaying: false,
    tracks: INITIAL_TRACKS,
  };
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

function useTrackAreaWidth() {
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [trackAreaWidth, setTrackAreaWidth] = useState<number>(600);

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

  return { trackAreaRef, trackAreaWidth };
}

function effectiveTimelineZoom(trackAreaWidth: number, duration: number): number {
  return Math.max(
    1,
    Math.max(trackAreaWidth - TRACK_RIGHT_PADDING, 60) / Math.max(duration, 0.001),
  );
}

function useTimelinePlayback(
  state: TimelineState,
  setState: React.Dispatch<React.SetStateAction<TimelineState>>,
) {
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!state.isPlaying) return undefined;

    const startTime = performance.now();
    const startPlayTime = state.currentTime;
    const tick = () => {
      const newTime = startPlayTime + (performance.now() - startTime) / 1000;
      if (newTime >= state.duration) {
        setState((s) => ({ ...s, currentTime: 0, isPlaying: false }));
      } else {
        setState((s) => ({ ...s, currentTime: newTime }));
        animationRef.current = requestAnimationFrame(tick);
      }
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
    // state.currentTime is written inside tick() via functional setState;
    // listing it would restart the animation on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isPlaying, state.duration]);
}

function formatTime(t: number) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

interface TransportControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSkipBack: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onSkipForward: () => void;
}

function TransportControls({
  currentTime,
  duration,
  isPlaying,
  onSkipBack,
  onTogglePlay,
  onStop,
  onSkipForward,
}: TransportControlsProps) {
  return (
    <div className="h-9 flex items-center gap-2 px-3 border-b border-white/[0.07] shrink-0">
      <IconButton onClick={onSkipBack}>
        <FaBackwardStep className="w-4 h-4" />
      </IconButton>
      <IconButton onClick={onTogglePlay} prominent>
        {isPlaying ? <FaPause className="w-4 h-4" /> : <FaPlay className="w-4 h-4" />}
      </IconButton>
      <IconButton onClick={onStop}>
        <FaStop className="w-4 h-4" />
      </IconButton>
      <IconButton onClick={onSkipForward}>
        <FaForwardStep className="w-4 h-4" />
      </IconButton>

      <div className="w-px h-4 bg-white/10 mx-1" />
      <span className="font-mono text-xs text-cyan-400 w-24">{formatTime(currentTime)}</span>
      <span className="text-zinc-600 text-xs">/</span>
      <span className="font-mono text-xs text-zinc-500 w-24">{formatTime(duration)}</span>

      <div className="flex-1" />
      <button className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded">
        <FaPlus className="w-3 h-3" />
        Add Track
      </button>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  prominent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  prominent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        prominent ? 'p-1.5' : 'p-1',
        'hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-200',
      )}
    >
      {children}
    </button>
  );
}

function TrackHeaders({
  tracks,
  onToggleTrack,
}: {
  tracks: Track[];
  onToggleTrack: (trackId: string) => void;
}) {
  return (
    <div
      className="shrink-0 flex flex-col border-r border-white/[0.07] bg-zinc-900/30"
      style={{ width: `${TRACK_HEADER_WIDTH}px` }}
    >
      <div className="h-6 border-b border-white/[0.07]" />
      {tracks.map((track) => (
        <TrackHeader key={track.id} track={track} onToggle={() => onToggleTrack(track.id)} />
      ))}
    </div>
  );
}

function TrackHeader({ track, onToggle }: { track: Track; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-1 px-2 h-8 border-b border-white/[0.05]">
      <button onClick={onToggle} className="p-0.5">
        <FaChevronRight
          className={clsx(
            'w-3 h-3 text-zinc-600 transition-transform',
            track.expanded && 'rotate-90',
          )}
        />
      </button>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: track.color }} />
      <span className="text-[11px] text-zinc-400 truncate">{track.name}</span>
    </div>
  );
}

function TimelineTracks({
  tracks,
  duration,
  currentTime,
  zoom,
  trackAreaRef,
}: {
  tracks: Track[];
  duration: number;
  currentTime: number;
  zoom: number;
  trackAreaRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={trackAreaRef} className="flex-1 min-w-0 relative overflow-hidden">
      <TimeRuler duration={duration} zoom={zoom} />
      <div className="relative">
        {tracks.map((track) => (
          <KeyframeTrack key={track.id} track={track} zoom={zoom} />
        ))}
      </div>
      <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none">
        <Playhead time={currentTime} zoom={zoom} />
      </div>
    </div>
  );
}

function KeyframeTrack({ track, zoom }: { track: Track; zoom: number }) {
  return (
    <div className="relative h-8 border-b border-white/[0.05]">
      {track.keyframes.map((kf, i) => (
        <div
          key={i}
          className="absolute top-1/2 w-3 h-3 rounded-sm cursor-pointer hover:scale-125 transition-transform"
          style={{
            left: `${kf.time * zoom}px`,
            backgroundColor: track.color,
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
          title={`${kf.time.toFixed(2)}s`}
        />
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function TimelinePanel() {
  const [state, setState] = useState<TimelineState>(createInitialTimelineState);
  const { trackAreaRef, trackAreaWidth } = useTrackAreaWidth();
  const effectiveZoom = effectiveTimelineZoom(trackAreaWidth, state.duration);
  useTimelinePlayback(state, setState);

  const toggleTrackExpand = (trackId: string) => {
    setState((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, expanded: !t.expanded } : t)),
    }));
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <TransportControls
        currentTime={state.currentTime}
        duration={state.duration}
        isPlaying={state.isPlaying}
        onSkipBack={() => setState((s) => ({ ...s, currentTime: Math.max(0, s.currentTime - 1) }))}
        onTogglePlay={() => setState((s) => ({ ...s, isPlaying: !s.isPlaying }))}
        onStop={() => setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }))}
        onSkipForward={() =>
          setState((s) => ({ ...s, currentTime: Math.min(s.duration, s.currentTime + 1) }))
        }
      />
      <div className="flex-1 flex overflow-hidden">
        <TrackHeaders tracks={state.tracks} onToggleTrack={toggleTrackExpand} />
        <TimelineTracks
          tracks={state.tracks}
          duration={state.duration}
          currentTime={state.currentTime}
          zoom={effectiveZoom}
          trackAreaRef={trackAreaRef}
        />
      </div>
    </div>
  );
}
