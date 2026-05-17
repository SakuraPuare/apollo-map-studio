import { useEffect, useReducer, useRef } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { useProjDialogStore } from '@/store/projDialogStore';
import { UTM_PRESETS, utmProjString, sanitizeProjString } from '@/io/proto/projection';

type Mode = 'preset' | 'utm' | 'custom';

interface PresetEntry {
  id: keyof typeof UTM_PRESETS;
  label: string;
  hint: string;
}

const PRESETS: PresetEntry[] = [
  { id: 'sunnyvale', label: 'Sunnyvale, CA (UTM 10N)', hint: 'Apollo borregas demo' },
  { id: 'beijing', label: 'Beijing (UTM 50N)', hint: 'Most common Chinese fleet' },
  { id: 'shanghai', label: 'Shanghai (UTM 51N)', hint: '' },
  { id: 'shenzhen', label: 'Shenzhen (UTM 50N)', hint: '' },
];

/**
 * Modal that opens whenever a map needs a `Header.projection.proj` value.
 * The user picks a region preset, a UTM
 * zone number, or pastes a custom PROJ.4 string. Resolves the pending
 * promise in projDialogStore on OK or Cancel.
 */
interface State {
  mode: Mode;
  preset: PresetEntry['id'];
  zone: number;
  hemisphere: 'N' | 'S';
  custom: string;
}

type Action =
  | { type: 'reset' }
  | { type: 'setMode'; mode: Mode }
  | { type: 'setPreset'; preset: PresetEntry['id'] }
  | { type: 'setZone'; zone: number }
  | { type: 'setHemisphere'; hemisphere: 'N' | 'S' }
  | { type: 'setCustom'; custom: string };

const initialState: State = {
  mode: 'preset',
  preset: 'beijing',
  zone: 50,
  hemisphere: 'N',
  custom: '',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'setPreset':
      return { ...state, preset: action.preset };
    case 'setZone':
      return { ...state, zone: action.zone };
    case 'setHemisphere':
      return { ...state, hemisphere: action.hemisphere };
    case 'setCustom':
      return { ...state, custom: action.custom };
  }
}

export function ProjPickerDialog() {
  const pending = useProjDialogStore((s) => s.pending);
  const resolve = useProjDialogStore((s) => s.resolve);

  const [state, dispatch] = useReducer(reducer, initialState);
  const prevPendingRef = useRef(false);

  // Reset state when dialog opens (pending transitions false -> true)
  if (pending && !prevPendingRef.current) {
    dispatch({ type: 'reset' });
  }
  prevPendingRef.current = pending;

  // ESC dismisses
  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending, resolve]);

  if (!pending) return null;

  const { mode, preset, zone, hemisphere, custom } = state;

  const computed = (() => {
    if (mode === 'preset') return UTM_PRESETS[preset];
    if (mode === 'utm') return utmProjString(zone, hemisphere);
    return sanitizeProjString(custom);
  })();

  const canSubmit = computed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    resolve(computed);
  };

  return (
    <DialogShell onCancel={() => resolve(null)}>
      <ProjectionHeader onCancel={() => resolve(null)} />
      <ProjectionBody
        mode={mode}
        preset={preset}
        zone={zone}
        hemisphere={hemisphere}
        custom={custom}
        computed={computed}
        onModeChange={(m) => dispatch({ type: 'setMode', mode: m })}
        onPresetChange={(p) => dispatch({ type: 'setPreset', preset: p })}
        onZoneChange={(z) => dispatch({ type: 'setZone', zone: z })}
        onHemisphereChange={(h) => dispatch({ type: 'setHemisphere', hemisphere: h })}
        onCustomChange={(c) => dispatch({ type: 'setCustom', custom: c })}
      />
      <ProjectionFooter canSubmit={canSubmit} onCancel={() => resolve(null)} onSubmit={submit} />
    </DialogShell>
  );
}

function DialogShell({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        role="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onCancel();
        }}
        aria-label="Close dialog"
      />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function ProjectionHeader({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
      <h2 className="text-sm font-medium text-zinc-200">
        Choose Coordinate System
        <span className="ml-2 text-zinc-500 text-[11px] font-normal">
          current map has no Header.projection.proj
        </span>
      </h2>
      <button
        type="button"
        onClick={onCancel}
        className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
      >
        <FaXmark className="size-4" />
      </button>
    </div>
  );
}

interface ProjectionBodyProps {
  mode: Mode;
  preset: PresetEntry['id'];
  zone: number;
  hemisphere: 'N' | 'S';
  custom: string;
  computed: string;
  onModeChange: (mode: Mode) => void;
  onPresetChange: (preset: PresetEntry['id']) => void;
  onZoneChange: (zone: number) => void;
  onHemisphereChange: (hemisphere: 'N' | 'S') => void;
  onCustomChange: (custom: string) => void;
}

function ProjectionBody(props: ProjectionBodyProps) {
  return (
    <div className="px-5 py-4 space-y-4">
      <ModeTabs mode={props.mode} onModeChange={props.onModeChange} />
      {props.mode === 'preset' && (
        <PresetPicker preset={props.preset} onPresetChange={props.onPresetChange} />
      )}
      {props.mode === 'utm' && (
        <UtmPicker
          zone={props.zone}
          hemisphere={props.hemisphere}
          onZoneChange={props.onZoneChange}
          onHemisphereChange={props.onHemisphereChange}
        />
      )}
      {props.mode === 'custom' && (
        <CustomProjInput value={props.custom} onChange={props.onCustomChange} />
      )}
      <ResolvedProjection value={props.computed} />
    </div>
  );
}

function ModeTabs({ mode, onModeChange }: { mode: Mode; onModeChange: (mode: Mode) => void }) {
  return (
    <div className="flex items-center gap-2">
      {(['preset', 'utm', 'custom'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onModeChange(m)}
          className={`px-3 py-1 text-xs rounded ${
            mode === m
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-zinc-500 border border-white/10 hover:text-zinc-300 hover:border-white/20'
          }`}
        >
          {m === 'preset' ? 'Region preset' : m === 'utm' ? 'UTM zone' : 'Custom PROJ'}
        </button>
      ))}
    </div>
  );
}

function PresetPicker({
  preset,
  onPresetChange,
}: {
  preset: PresetEntry['id'];
  onPresetChange: (preset: PresetEntry['id']) => void;
}) {
  return (
    <div className="space-y-1">
      {PRESETS.map((p) => (
        <label
          key={p.id}
          className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer ${
            preset === p.id
              ? 'bg-cyan-500/10 border border-cyan-500/30'
              : 'border border-white/5 hover:border-white/10'
          }`}
        >
          <input
            type="radio"
            name="preset"
            checked={preset === p.id}
            onChange={() => onPresetChange(p.id)}
            className="accent-cyan-500"
          />
          <div className="flex-1">
            <div className="text-xs text-zinc-200">{p.label}</div>
            {p.hint && <div className="text-[10px] text-zinc-500">{p.hint}</div>}
          </div>
        </label>
      ))}
    </div>
  );
}

function UtmPicker({
  zone,
  hemisphere,
  onZoneChange,
  onHemisphereChange,
}: {
  zone: number;
  hemisphere: 'N' | 'S';
  onZoneChange: (zone: number) => void;
  onHemisphereChange: (hemisphere: 'N' | 'S') => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="utm-zone" className="block text-zinc-400 text-xs mb-1">
          UTM zone (1–60)
        </label>
        <input
          id="utm-zone"
          type="number"
          min={1}
          max={60}
          value={zone}
          onChange={(e) => onZoneChange(Number(e.target.value) || 1)}
          className="w-full px-2 py-1 rounded bg-zinc-800/50 border border-white/10 text-zinc-200 text-xs outline-none focus:border-cyan-500/50"
        />
      </div>
      <div>
        <span className="block text-zinc-400 text-xs mb-1">Hemisphere</span>
        <div className="flex gap-2">
          {(['N', 'S'] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onHemisphereChange(h)}
              className={`px-3 py-1 text-xs rounded border ${
                hemisphere === h
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                  : 'text-zinc-500 border-white/10 hover:border-white/20'
              }`}
            >
              {h === 'N' ? 'Northern (N)' : 'Southern (S)'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomProjInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor="custom-proj" className="block text-zinc-400 text-xs mb-1">
        PROJ.4 string
      </label>
      <textarea
        id="custom-proj"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+proj=utm +zone=50 +ellps=WGS84 +datum=WGS84 +units=m +no_defs"
        rows={3}
        className="w-full px-2 py-1 rounded bg-zinc-800/50 border border-white/10 text-zinc-200 text-xs font-mono outline-none focus:border-cyan-500/50 resize-none"
      />
      <p className="mt-1 text-zinc-600 text-[10px]">
        Apollo template-style braces (e.g. <code>+lat_0={'{37.4}'}</code>) are stripped
        automatically.
      </p>
    </div>
  );
}

function ResolvedProjection({ value }: { value: string }) {
  return (
    <div className="pt-2 border-t border-white/5">
      <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">Resolved</div>
      <div className="px-2 py-1.5 rounded bg-zinc-800/50 border border-white/5 text-zinc-300 text-[11px] font-mono break-all select-text">
        {value || '— enter a PROJ string above —'}
      </div>
    </div>
  );
}

function ProjectionFooter({
  canSubmit,
  onCancel,
  onSubmit,
}: {
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 bg-zinc-950/50">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1 text-xs rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={`px-3 py-1 text-xs rounded ${
          canSubmit
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
            : 'text-zinc-600 border border-white/5 cursor-not-allowed'
        }`}
      >
        Use this projection
      </button>
    </div>
  );
}
