import { useEffect, useState } from 'react';
import { FaBookOpen, FaXmark } from 'react-icons/fa6';
import { appBridge, type AppRuntimeInfo } from '@/lib/app-bridge';

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
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">{runtimeInfo.productName}</h2>
            <p className="text-[11px] text-zinc-500">Version Information</p>
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
        <AboutFooter onClose={onClose} />
      </div>
    </div>
  );
}
