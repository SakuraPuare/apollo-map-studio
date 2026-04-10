import { MapPin, ZoomIn, Grid3X3, Magnet } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

interface StatusBarProps {
  mode?: string;
  entityCount?: number;
}

const MODE_LABELS: Record<string, string> = {
  idle: 'Idle',
  selected: 'Selected',
  editingPoint: 'Dragging',
  drawPolyline: 'Draw: Polyline',
  drawCatmullRom: 'Draw: CatmullRom',
  drawBezier: 'Draw: Bezier',
  drawArc: 'Draw: Arc',
  drawRect: 'Draw: Rectangle',
  drawPolygon: 'Draw: Polygon',
};

export function StatusBar({ mode = 'idle', entityCount = 0 }: StatusBarProps) {
  const cursorLngLat = useUIStore((s) => s.cursorLngLat);
  const currentZoom = useUIStore((s) => s.currentZoom);
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const snapEnabled = useUIStore((s) => s.snapEnabled);

  const modeLabel = MODE_LABELS[mode] || mode;
  const isDrawing = mode.startsWith('draw');

  return (
    <div className="h-6 bg-zinc-950 border-t border-white/[0.07] flex items-center px-2 text-[10px] text-zinc-500 shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Mode indicator */}
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${
            isDrawing ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'
          }`} />
          <span className={isDrawing ? 'text-cyan-400' : 'text-zinc-400'}>{modeLabel}</span>
        </div>

        {/* Entity count */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-600">Entities:</span>
          <span className="font-mono text-zinc-400">{entityCount}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Grid / Snap indicators */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 ${gridEnabled ? 'text-cyan-400' : 'text-zinc-600'}`}>
            <Grid3X3 className="w-3 h-3" />
            <span>Grid</span>
          </div>
          <div className={`flex items-center gap-1 ${snapEnabled ? 'text-cyan-400' : 'text-zinc-600'}`}>
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </div>
        </div>

        {/* Cursor position */}
        {cursorLngLat && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-zinc-600" />
            <span className="font-mono">
              {cursorLngLat[0].toFixed(6)}, {cursorLngLat[1].toFixed(6)}
            </span>
          </div>
        )}

        {/* Zoom level */}
        <div className="flex items-center gap-1">
          <ZoomIn className="w-3 h-3 text-zinc-600" />
          <span className="font-mono text-zinc-400">{currentZoom.toFixed(1)}x</span>
        </div>
      </div>
    </div>
  );
}
