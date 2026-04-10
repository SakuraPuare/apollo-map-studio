import { GitBranch, MapPin, ZoomIn } from 'lucide-react';

interface StatusBarProps {
  mode?: string;
  entityCount?: number;
  zoom?: number;
  cursorPosition?: [number, number] | null;
}

export function StatusBar({ mode = 'Idle', entityCount = 0, zoom, cursorPosition }: StatusBarProps) {
  return (
    <div className="h-6 bg-zinc-950 border-t border-white/[0.07] flex items-center px-2 text-[10px] text-zinc-500 shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Mode indicator */}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-zinc-400">{mode}</span>
        </div>

        {/* Entity count */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-600">Entities:</span>
          <span className="font-mono text-zinc-400">{entityCount}</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Cursor position */}
        {cursorPosition && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-zinc-600" />
            <span className="font-mono">
              {cursorPosition[0].toFixed(6)}, {cursorPosition[1].toFixed(6)}
            </span>
          </div>
        )}

        {/* Zoom level */}
        {zoom !== undefined && (
          <div className="flex items-center gap-1">
            <ZoomIn className="w-3 h-3 text-zinc-600" />
            <span className="font-mono">{zoom.toFixed(1)}x</span>
          </div>
        )}

        {/* Git branch (placeholder) */}
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3 text-zinc-600" />
          <span>main</span>
        </div>
      </div>
    </div>
  );
}
