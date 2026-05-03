import { useState, useEffect } from 'react';
import { FaXmark } from 'react-icons/fa6';
import {
  useSettingsStore,
  MIN_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MIN_LANE_HALF_WIDTH,
  MAX_LANE_HALF_WIDTH,
  MIN_LANE_ARROW_SPACING,
  MAX_LANE_ARROW_SPACING,
  MIN_MAP_ZOOM,
  MAX_MAP_ZOOM,
} from '@/store/settingsStore';

// ─── NumInput ──────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  onCommit,
  onReset,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
  onReset: () => void;
}) {
  const commit = () => {
    const n = Number(value);
    if (Number.isFinite(n)) onCommit(Math.max(min, Math.min(max, n)));
    else onReset();
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="w-full px-2 py-1 rounded bg-zinc-800/50 border border-white/10 text-zinc-200 text-xs outline-none focus:border-cyan-500/50"
    />
  );
}

// ─── Main Component ────────────────────────────────────────

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function SettingsSection({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block mb-1 text-zinc-400 text-xs">{children}</label>;
}

function HistorySettings({
  value,
  onChange,
  currentValue,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  currentValue: number;
  onCommit: (value: number) => void;
}) {
  return (
    <SettingsSection title="Undo History">
      <FieldLabel>History limit</FieldLabel>
      <NumInput
        value={value}
        onChange={onChange}
        min={MIN_HISTORY_LIMIT}
        max={MAX_HISTORY_LIMIT}
        onCommit={(n) => {
          onCommit(n);
          onChange(String(Math.round(n)));
        }}
        onReset={() => onChange(String(currentValue))}
      />
      <p className="mt-1 text-zinc-600 text-[10px]">
        Range: {MIN_HISTORY_LIMIT}–{MAX_HISTORY_LIMIT}
      </p>
    </SettingsSection>
  );
}

interface ViewportSettingsProps {
  draftLng: string;
  draftLat: string;
  draftZoom: string;
  mapCenterLng: number;
  mapCenterLat: number;
  mapZoom: number;
  setDraftLng: (value: string) => void;
  setDraftLat: (value: string) => void;
  setDraftZoom: (value: string) => void;
  setMapCenter: (lng: number, lat: number) => void;
  setMapZoom: (zoom: number) => void;
}

function ViewportSettings({
  draftLng,
  draftLat,
  draftZoom,
  mapCenterLng,
  mapCenterLat,
  mapZoom,
  setDraftLng,
  setDraftLat,
  setDraftZoom,
  setMapCenter,
  setMapZoom,
}: ViewportSettingsProps) {
  return (
    <SettingsSection
      title={
        <>
          Map Viewport <span className="text-zinc-600 normal-case">(restart to apply)</span>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Longitude</FieldLabel>
          <NumInput
            value={draftLng}
            onChange={setDraftLng}
            min={-180}
            max={180}
            onCommit={(n) => {
              setMapCenter(n, mapCenterLat);
              setDraftLng(String(n));
            }}
            onReset={() => setDraftLng(String(mapCenterLng))}
          />
        </div>
        <div>
          <FieldLabel>Latitude</FieldLabel>
          <NumInput
            value={draftLat}
            onChange={setDraftLat}
            min={-90}
            max={90}
            onCommit={(n) => {
              setMapCenter(mapCenterLng, n);
              setDraftLat(String(n));
            }}
            onReset={() => setDraftLat(String(mapCenterLat))}
          />
        </div>
      </div>
      <FieldLabel>Zoom</FieldLabel>
      <NumInput
        value={draftZoom}
        onChange={setDraftZoom}
        min={MIN_MAP_ZOOM}
        max={MAX_MAP_ZOOM}
        onCommit={(n) => {
          setMapZoom(n);
          setDraftZoom(String(n));
        }}
        onReset={() => setDraftZoom(String(mapZoom))}
      />
    </SettingsSection>
  );
}

function LaneSettings({
  draftLaneW,
  draftArrow,
  laneHalfWidth,
  laneArrowSpacing,
  setDraftLaneW,
  setDraftArrow,
  setLaneHalfWidth,
  setLaneArrowSpacing,
}: {
  draftLaneW: string;
  draftArrow: string;
  laneHalfWidth: number;
  laneArrowSpacing: number;
  setDraftLaneW: (value: string) => void;
  setDraftArrow: (value: string) => void;
  setLaneHalfWidth: (value: number) => void;
  setLaneArrowSpacing: (value: number) => void;
}) {
  return (
    <SettingsSection title="Lane">
      <FieldLabel>Default half-width (m)</FieldLabel>
      <NumInput
        value={draftLaneW}
        onChange={setDraftLaneW}
        min={MIN_LANE_HALF_WIDTH}
        max={MAX_LANE_HALF_WIDTH}
        step={0.25}
        onCommit={(n) => {
          setLaneHalfWidth(n);
          setDraftLaneW(String(n));
        }}
        onReset={() => setDraftLaneW(String(laneHalfWidth))}
      />
      <FieldLabel>Arrow spacing (px)</FieldLabel>
      <NumInput
        value={draftArrow}
        onChange={setDraftArrow}
        min={MIN_LANE_ARROW_SPACING}
        max={MAX_LANE_ARROW_SPACING}
        step={10}
        onCommit={(n) => {
          setLaneArrowSpacing(n);
          setDraftArrow(String(n));
        }}
        onReset={() => setDraftArrow(String(laneArrowSpacing))}
      />
    </SettingsSection>
  );
}

function LayoutSettings() {
  return (
    <SettingsSection title="Layout">
      <button
        onClick={() => {
          localStorage.removeItem('ams-layout-v2');
          window.location.reload();
        }}
        className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800/50 border border-white/10 rounded hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
      >
        Reset Layout to Default
      </button>
    </SettingsSection>
  );
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const historyLimit = useSettingsStore((s) => s.historyLimit);
  const setHistoryLimit = useSettingsStore((s) => s.setHistoryLimit);
  const [draftHistory, setDraftHistory] = useState(String(historyLimit));

  const mapCenterLng = useSettingsStore((s) => s.mapCenterLng);
  const mapCenterLat = useSettingsStore((s) => s.mapCenterLat);
  const mapZoom = useSettingsStore((s) => s.mapZoom);
  const setMapCenter = useSettingsStore((s) => s.setMapCenter);
  const setMapZoom = useSettingsStore((s) => s.setMapZoom);
  const [draftLng, setDraftLng] = useState(String(mapCenterLng));
  const [draftLat, setDraftLat] = useState(String(mapCenterLat));
  const [draftZoom, setDraftZoom] = useState(String(mapZoom));

  const laneHalfWidth = useSettingsStore((s) => s.laneHalfWidth);
  const setLaneHalfWidth = useSettingsStore((s) => s.setLaneHalfWidth);
  const [draftLaneW, setDraftLaneW] = useState(String(laneHalfWidth));

  const laneArrowSpacing = useSettingsStore((s) => s.laneArrowSpacing);
  const setLaneArrowSpacing = useSettingsStore((s) => s.setLaneArrowSpacing);
  const [draftArrow, setDraftArrow] = useState(String(laneArrowSpacing));

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium text-zinc-200">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
          >
            <FaXmark className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          <HistorySettings
            value={draftHistory}
            onChange={setDraftHistory}
            currentValue={historyLimit}
            onCommit={setHistoryLimit}
          />
          <ViewportSettings
            draftLng={draftLng}
            draftLat={draftLat}
            draftZoom={draftZoom}
            mapCenterLng={mapCenterLng}
            mapCenterLat={mapCenterLat}
            mapZoom={mapZoom}
            setDraftLng={setDraftLng}
            setDraftLat={setDraftLat}
            setDraftZoom={setDraftZoom}
            setMapCenter={setMapCenter}
            setMapZoom={setMapZoom}
          />
          <LaneSettings
            draftLaneW={draftLaneW}
            draftArrow={draftArrow}
            laneHalfWidth={laneHalfWidth}
            laneArrowSpacing={laneArrowSpacing}
            setDraftLaneW={setDraftLaneW}
            setDraftArrow={setDraftArrow}
            setLaneHalfWidth={setLaneHalfWidth}
            setLaneArrowSpacing={setLaneArrowSpacing}
          />
          <LayoutSettings />
        </div>
      </div>
    </div>
  );
}
