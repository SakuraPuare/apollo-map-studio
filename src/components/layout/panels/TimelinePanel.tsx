import { useRef, useState, useLayoutEffect, useMemo } from 'react';
import { FaPlay, FaPause, FaStop, FaBackwardStep, FaForwardStep } from 'react-icons/fa6';
import { clsx } from 'clsx';
import { usePlaybackStore } from '@/store/playbackStore';
import { useScenarioStore } from '@/store/scenarioStore';
import { buildTimelineTracks, type TimelineTrack } from './timelineTracks';

// Width (px) reserved on the left for the track-header column.
const TRACK_HEADER_WIDTH = 160;
// Right-side padding inside the track area so the last label isn't clipped.
const TRACK_RIGHT_PADDING = 16;
const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4];

// ─── Playhead ──────────────────────────────────────────────

function Playhead({ time, zoom }: { time: number; zoom: number }) {
  const left = time * zoom;

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-cyan-400 z-20 pointer-events-none"
      style={{ left: `${left}px` }}
    >
      <div className="absolute -top-1 -translate-x-1/2 size-3 bg-cyan-400 rounded-full" />
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
  speed: number;
  onSkipBack: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onSkipForward: () => void;
  onSetSpeed: (s: number) => void;
}

function TransportControls({
  currentTime,
  duration,
  isPlaying,
  speed,
  onSkipBack,
  onTogglePlay,
  onStop,
  onSkipForward,
  onSetSpeed,
}: TransportControlsProps) {
  return (
    <div className="h-9 flex items-center gap-2 px-3 border-b border-white/[0.07] shrink-0">
      <IconButton onClick={onSkipBack}>
        <FaBackwardStep className="size-4" />
      </IconButton>
      <IconButton onClick={onTogglePlay} prominent>
        {isPlaying ? <FaPause className="size-4" /> : <FaPlay className="size-4" />}
      </IconButton>
      <IconButton onClick={onStop}>
        <FaStop className="size-4" />
      </IconButton>
      <IconButton onClick={onSkipForward}>
        <FaForwardStep className="size-4" />
      </IconButton>

      <div className="w-px h-4 bg-white/10 mx-1" />
      <span className="font-mono text-xs text-cyan-400 w-24">{formatTime(currentTime)}</span>
      <span className="text-zinc-600 text-xs">/</span>
      <span className="font-mono text-xs text-zinc-500 w-24">{formatTime(duration)}</span>

      <div className="flex-1" />
      <select
        value={speed}
        onChange={(e) => onSetSpeed(Number(e.target.value))}
        className="bg-zinc-800 text-xs text-zinc-300 rounded px-1.5 py-0.5 border border-white/10 focus:outline-none"
        title="Playback speed"
      >
        {PLAYBACK_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
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
      type="button"
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

function TrackHeaders({ tracks }: { tracks: TimelineTrack[] }) {
  return (
    <div
      className="shrink-0 flex flex-col border-r border-white/[0.07] bg-zinc-900/30"
      style={{ width: `${TRACK_HEADER_WIDTH}px` }}
    >
      <div className="h-6 border-b border-white/[0.07]" />
      {tracks.map((track) => (
        <TrackHeader key={track.id} track={track} />
      ))}
    </div>
  );
}

function TrackHeader({ track }: { track: TimelineTrack }) {
  return (
    <div className="flex items-center gap-1.5 px-2 h-8 border-b border-white/[0.05]">
      <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: track.color }} />
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
  tracks: TimelineTrack[];
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

function KeyframeTrack({ track, zoom }: { track: TimelineTrack; zoom: number }) {
  return (
    <div className="relative h-8 border-b border-white/[0.05]">
      {track.keyframes.map((kf, i) => (
        <div
          key={i}
          className="absolute top-1/2 size-3 rounded-sm cursor-pointer hover:scale-125 transition-transform"
          style={{
            left: `${kf.time * zoom}px`,
            backgroundColor: track.color,
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
          title={`${kf.label} @ ${kf.time.toFixed(2)}s`}
        />
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function TimelinePanel() {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const speed = usePlaybackStore((s) => s.speed);
  const { toggle, stop, setCurrentTime, setSpeed } = usePlaybackStore.getState();

  const activeKey = useScenarioStore((s) => s.activeKey);
  const loaded = useScenarioStore((s) => s.loaded);
  const doc = useMemo(
    () => loaded.find((l) => l.key === activeKey)?.doc ?? null,
    [loaded, activeKey],
  );
  const tracks = useMemo(() => (doc ? buildTimelineTracks(doc, duration) : []), [doc, duration]);

  const { trackAreaRef, trackAreaWidth } = useTrackAreaWidth();
  const effectiveZoom = effectiveTimelineZoom(trackAreaWidth, duration);

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <TransportControls
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        speed={speed}
        onSkipBack={() => setCurrentTime(Math.max(0, currentTime - 1))}
        onTogglePlay={toggle}
        onStop={stop}
        onSkipForward={() => setCurrentTime(Math.min(duration, currentTime + 1))}
        onSetSpeed={setSpeed}
      />
      <div className="flex-1 flex overflow-hidden">
        <TrackHeaders tracks={tracks} />
        <TimelineTracks
          tracks={tracks}
          duration={duration}
          currentTime={currentTime}
          zoom={effectiveZoom}
          trackAreaRef={trackAreaRef}
        />
      </div>
    </div>
  );
}
