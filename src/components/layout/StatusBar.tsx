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
  drawRotatedRect: 'Draw: Rectangle',
  drawPolygon: 'Draw: Polygon',
};

export function StatusBar({ mode = 'idle', entityCount = 0 }: StatusBarProps) {
  const cursorLngLat = useUIStore((s) => s.cursorLngLat);
  const currentZoom = useUIStore((s) => s.currentZoom);
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const appMode = useUIStore((s) => s.appMode);

  const modeLabel = MODE_LABELS[mode] || mode;
  const isDrawing = mode.startsWith('draw');

  return (
    <div className="h-6 bg-ams-bg-base border-t border-ams-border-subtle flex items-center px-2 text-[10px] text-ams-text-muted shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* App mode badge */}
        <div className="flex items-center gap-1">
          <span className="text-ams-text-disabled">Mode:</span>
          <span className="text-ams-accent font-medium">
            {appMode === 'drawing' ? '绘图' : '场景'}
          </span>
        </div>

        <div className="w-px h-3 bg-ams-border-strong" />

        {/* Tool/state indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isDrawing ? 'bg-ams-accent animate-pulse' : 'bg-ams-text-disabled'
            }`}
          />
          <span className={isDrawing ? 'text-ams-accent' : 'text-ams-text-secondary'}>
            {modeLabel}
          </span>
        </div>

        {/* Entity count */}
        <div className="flex items-center gap-1">
          <span className="text-ams-text-disabled">Entities:</span>
          <span className="font-mono text-ams-text-secondary">{entityCount}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Grid / Snap indicators */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 ${
              gridEnabled ? 'text-ams-accent' : 'text-ams-text-disabled'
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            <span>Grid</span>
          </div>
          <div
            className={`flex items-center gap-1 ${
              snapEnabled ? 'text-ams-accent' : 'text-ams-text-disabled'
            }`}
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </div>
        </div>

        {/* Cursor position */}
        {cursorLngLat && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-ams-text-disabled" />
            <span className="font-mono">
              {cursorLngLat[0].toFixed(6)}, {cursorLngLat[1].toFixed(6)}
            </span>
          </div>
        )}

        {/* Zoom level */}
        <div className="flex items-center gap-1">
          <ZoomIn className="w-3 h-3 text-ams-text-disabled" />
          <span className="font-mono text-ams-text-secondary">{currentZoom.toFixed(1)}x</span>
        </div>
      </div>
    </div>
  );
}
