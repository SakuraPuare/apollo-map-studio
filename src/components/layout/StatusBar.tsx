import { FaMapPin, FaMagnifyingGlassPlus, FaTableCells, FaMagnet, FaMap } from 'react-icons/fa6';
import { useUIStore } from '@/store/uiStore';
import { useApolloMapStore } from '@/store/apolloMapStore';
import type { ApolloMapImportInfo } from '@/store/apolloMapStore';
import type { LngLat } from '@/core/geometry/interpolate';

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
  const apolloInfo = useApolloMapStore((s) => s.info);

  const modeLabel = MODE_LABELS[mode] || mode;
  const isDrawing = mode.startsWith('draw');

  return (
    <div className="h-6 bg-ams-bg-base border-t border-ams-border-subtle flex items-center px-2 text-[10px] text-ams-text-muted shrink-0">
      <StatusLeft
        appMode={appMode}
        modeLabel={modeLabel}
        isDrawing={isDrawing}
        entityCount={entityCount}
        apolloInfo={apolloInfo}
      />

      <div className="flex-1" />

      <StatusRight
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        cursorLngLat={cursorLngLat}
        currentZoom={currentZoom}
      />
    </div>
  );
}

interface StatusLeftProps {
  appMode: 'drawing' | 'scene';
  modeLabel: string;
  isDrawing: boolean;
  entityCount: number;
  apolloInfo: ApolloMapImportInfo | null;
}

function StatusLeft({ appMode, modeLabel, isDrawing, entityCount, apolloInfo }: StatusLeftProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <span className="text-ams-text-disabled">Mode:</span>
        <span className="text-ams-accent font-medium">
          {appMode === 'drawing' ? '绘图' : '场景'}
        </span>
      </div>

      <div className="w-px h-3 bg-ams-border-strong" />
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

      <div className="flex items-center gap-1">
        <span className="text-ams-text-disabled">Entities:</span>
        <span className="font-mono text-ams-text-secondary">{entityCount}</span>
      </div>

      {apolloInfo && <ApolloMapStatus info={apolloInfo} />}
    </div>
  );
}

function ApolloMapStatus({ info }: { info: ApolloMapImportInfo }) {
  return (
    <>
      <div className="w-px h-3 bg-ams-border-strong" />
      <div className="flex items-center gap-1.5" title={`PROJ: ${info.projString}`}>
        <FaMap className="w-3 h-3 text-ams-accent" />
        <span className="text-ams-text-secondary">{info.filename}</span>
        <span className="text-ams-text-disabled font-mono">
          lane={info.counts.lane ?? 0} road={info.counts.road ?? 0}
        </span>
      </div>
    </>
  );
}

interface StatusRightProps {
  gridEnabled: boolean;
  snapEnabled: boolean;
  cursorLngLat: LngLat | null;
  currentZoom: number;
}

function StatusRight({ gridEnabled, snapEnabled, cursorLngLat, currentZoom }: StatusRightProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <StatusToggle enabled={gridEnabled} icon={FaTableCells} label="Grid" />
        <StatusToggle enabled={snapEnabled} icon={FaMagnet} label="Snap" />
      </div>

      {cursorLngLat && (
        <div className="flex items-center gap-1">
          <FaMapPin className="w-3 h-3 text-ams-text-disabled" />
          <span className="font-mono">
            {cursorLngLat[0].toFixed(6)}, {cursorLngLat[1].toFixed(6)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1">
        <FaMagnifyingGlassPlus className="w-3 h-3 text-ams-text-disabled" />
        <span className="font-mono text-ams-text-secondary">{currentZoom.toFixed(1)}x</span>
      </div>
    </div>
  );
}

function StatusToggle({
  enabled,
  icon: Icon,
  label,
}: {
  enabled: boolean;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-1 ${enabled ? 'text-ams-accent' : 'text-ams-text-disabled'}`}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </div>
  );
}
