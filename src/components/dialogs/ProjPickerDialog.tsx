import { useEffect, useState } from 'react';
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
 * Modal that opens whenever an Apollo .bin/.txt is imported without a
 * `Header.projection.proj` value. The user picks a region preset, a UTM
 * zone number, or pastes a custom PROJ.4 string. Resolves the pending
 * promise in projDialogStore on OK or Cancel.
 */
export function ProjPickerDialog() {
  const pending = useProjDialogStore((s) => s.pending);
  const resolve = useProjDialogStore((s) => s.resolve);

  const [mode, setMode] = useState<Mode>('preset');
  const [preset, setPreset] = useState<PresetEntry['id']>('beijing');
  const [zone, setZone] = useState<number>(50);
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>('N');
  const [custom, setCustom] = useState<string>('');

  // Reset to defaults whenever the dialog re-opens.
  useEffect(() => {
    if (pending) {
      setMode('preset');
      setPreset('beijing');
      setZone(50);
      setHemisphere('N');
      setCustom('');
    }
  }, [pending]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => resolve(null)}
      />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium text-zinc-200">
            Choose Coordinate System
            <span className="ml-2 text-zinc-500 text-[11px] font-normal">
              imported map has no Header.projection.proj
            </span>
          </h2>
          <button
            type="button"
            onClick={() => resolve(null)}
            className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
          >
            <FaXmark className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex items-center gap-2">
            {(['preset', 'utm', 'custom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
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

          {mode === 'preset' && (
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
                    onChange={() => setPreset(p.id)}
                    className="accent-cyan-500"
                  />
                  <div className="flex-1">
                    <div className="text-xs text-zinc-200">{p.label}</div>
                    {p.hint && <div className="text-[10px] text-zinc-500">{p.hint}</div>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {mode === 'utm' && (
            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 text-xs mb-1">UTM zone (1–60)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={zone}
                  onChange={(e) => setZone(Number(e.target.value) || 1)}
                  className="w-full px-2 py-1 rounded bg-zinc-800/50 border border-white/10 text-zinc-200 text-xs outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1">Hemisphere</label>
                <div className="flex gap-2">
                  {(['N', 'S'] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHemisphere(h)}
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
          )}

          {mode === 'custom' && (
            <div>
              <label className="block text-zinc-400 text-xs mb-1">PROJ.4 string</label>
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="+proj=utm +zone=50 +ellps=WGS84 +datum=WGS84 +units=m +no_defs"
                rows={3}
                className="w-full px-2 py-1 rounded bg-zinc-800/50 border border-white/10 text-zinc-200 text-xs font-mono outline-none focus:border-cyan-500/50 resize-none"
              />
              <p className="mt-1 text-zinc-600 text-[10px]">
                Apollo template-style braces (e.g. <code>+lat_0={'{37.4}'}</code>) are stripped
                automatically.
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-white/5">
            <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">Resolved</div>
            <div className="px-2 py-1.5 rounded bg-zinc-800/50 border border-white/5 text-zinc-300 text-[11px] font-mono break-all">
              {computed || '— enter a PROJ string above —'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 bg-zinc-950/50">
          <button
            type="button"
            onClick={() => resolve(null)}
            className="px-3 py-1 text-xs rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
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
      </div>
    </div>
  );
}
