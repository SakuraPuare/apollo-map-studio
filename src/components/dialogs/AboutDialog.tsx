import { useEffect, useState } from 'react';
import {
  FaBookOpen,
  FaCheck,
  FaCopy,
  FaKey,
  FaShield,
  FaTriangleExclamation,
  FaXmark,
} from 'react-icons/fa6';
import { appBridge, type AppRuntimeInfo } from '@/lib/app-bridge';
import type { LicenseState } from '@/lib/license-bridge';
import { formatLicenseExpirySummary, formatLocalDateTime } from '@/lib/licenseDisplay';
import { useNow } from '@/hooks/useNow';
import { useLicenseStore } from '@/store/licenseStore';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

const LOADING_RUNTIME_INFO: AppRuntimeInfo = {
  name: 'Apollo Map Studio',
  productName: 'Apollo Map Studio',
  version: '...',
  platform: '...',
  runtime: 'web',
  docsAvailable: false,
  versions: {},
};

function getVersionRows(runtimeInfo: AppRuntimeInfo) {
  return [
    ['Version', `v${runtimeInfo.version}`],
    ['Runtime', runtimeInfo.runtime === 'desktop' ? 'Electron' : 'Web'],
    ['Platform', runtimeInfo.platform],
    ['Chrome', runtimeInfo.versions.chrome],
    ['Electron', runtimeInfo.versions.electron],
    ['Node', runtimeInfo.versions.node],
  ].filter(([, value]) => Boolean(value));
}

function VersionDetails({ runtimeInfo }: { runtimeInfo: AppRuntimeInfo }) {
  const versionRows = getVersionRows(runtimeInfo);

  return (
    <section className="px-5 py-4">
      <dl className="divide-y divide-white/10 border border-white/10 rounded bg-zinc-950/50">
        {versionRows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</dt>
            <dd className="text-xs text-zinc-200 font-mono break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function licenseStatusLabel(state: LicenseState): string {
  switch (state.status) {
    case 'activated':
      return 'Activated';
    case 'trial':
      return 'Trial';
    case 'expired_trial':
      return 'Trial expired';
    case 'expired_license':
      return 'License expired';
    case 'machine_mismatch':
      return 'Machine mismatch';
    case 'tampered':
      return 'Tampered';
    case 'invalid':
      return 'Invalid';
    case 'not_started':
      return 'Pending';
    default:
      return state.status;
  }
}

function trialSummary(state: LicenseState, now: number): string {
  return formatLicenseExpirySummary(state, now);
}

function LicenseDetails() {
  const state = useLicenseStore((s) => s.state);
  const initialized = useLicenseStore((s) => s.initialized);
  const promptActivation = useLicenseStore((s) => s.promptActivation);
  const now = useNow();
  const [copied, setCopied] = useState(false);
  const blocked = !state.canEdit;
  const StatusIcon = blocked ? FaTriangleExclamation : FaShield;
  const summary = trialSummary(state, now);

  const copyMachineCode = async () => {
    try {
      await navigator.clipboard.writeText(state.machineCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="px-5 pb-4">
      <div className="rounded border border-white/10 bg-zinc-950/50">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <StatusIcon
              className={`h-3.5 w-3.5 ${blocked ? 'text-amber-300' : 'text-emerald-300'}`}
            />
            <div className="min-w-0">
              <h3 className="text-xs font-medium text-zinc-200">License & Activation</h3>
              <p className="truncate text-[11px] text-zinc-500">
                {initialized ? summary : 'Checking license state...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={promptActivation}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
          >
            <FaKey className="h-3 w-3" />
            {state.status === 'activated' ? 'Manage License' : 'Activate'}
          </button>
        </div>

        <dl className="divide-y divide-white/10">
          <LicenseRow label="Status" value={licenseStatusLabel(state)} />
          <LicenseRow label="Access" value={state.canEdit ? 'Editing enabled' : 'Read-only'} />
          <LicenseRow label="Trial / Expiry" value={summary} />
          {state.license ? (
            <>
              <LicenseRow label="License name" value={state.license.name || 'Unnamed license'} />
              <LicenseRow label="License ID" value={state.license.id} mono />
              <LicenseRow label="Issued" value={formatLocalDateTime(state.license.issued)} />
            </>
          ) : null}
          <div className="grid grid-cols-[8rem_minmax(0,1fr)_max-content] items-center gap-3 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Device code</dt>
            <dd className="min-w-0 break-all font-mono text-xs text-zinc-200">
              {state.machineCode || 'Checking...'}
            </dd>
            <button
              type="button"
              onClick={() => void copyMachineCode()}
              disabled={!state.machineCode}
              className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? <FaCheck className="h-3 w-3" /> : <FaCopy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </dl>
      </div>
    </section>
  );
}

function LicenseRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`break-all text-xs text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function AboutFooter({ onClose }: Pick<AboutDialogProps, 'onClose'>) {
  return (
    <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 bg-zinc-950/50">
      <button
        type="button"
        onClick={() => void appBridge.openHelp()}
        className="px-3 py-1.5 text-xs rounded border border-white/10 text-zinc-300 hover:bg-white/10 inline-flex items-center gap-2"
      >
        <FaBookOpen className="w-3 h-3" />
        Help Documentation
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 text-xs rounded bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
      >
        Close
      </button>
    </footer>
  );
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [info, setInfo] = useState<AppRuntimeInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    void appBridge.getAppInfo().then(setInfo);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  if (!open) return null;

  const runtimeInfo = info ?? LOADING_RUNTIME_INFO;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">{runtimeInfo.productName}</h2>
            <p className="text-[11px] text-zinc-500">Version, license, and device information</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
            aria-label="Close"
          >
            <FaXmark className="w-4 h-4" />
          </button>
        </header>

        <VersionDetails runtimeInfo={runtimeInfo} />
        <LicenseDetails />
        <AboutFooter onClose={onClose} />
      </div>
    </div>
  );
}
