import {
  FaMinus,
  FaRegSquare,
  FaSquare,
  FaXmark,
  FaDesktop,
  FaGlobe,
  FaShield,
  FaTriangleExclamation,
} from 'react-icons/fa6';
import logoUrl from '@/assets/logo.svg';
import { appBridge, isDesktopRuntime, type DesktopWindowState } from '@/lib/app-bridge';
import type { LicenseState } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';

interface DesktopTitleBarProps {
  windowState: DesktopWindowState | null;
}

function platformLabel(platform: string | undefined): string {
  if (!platform) return 'Web';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform;
}

function licenseLabel(state: LicenseState) {
  if (state.status === 'activated') return 'Licensed';
  if (state.status === 'trial') return `Trial ${state.daysRemaining ?? 0}d`;
  return 'Read-only';
}

function LicenseChip() {
  const state = useLicenseStore((s) => s.state);
  const promptActivation = useLicenseStore((s) => s.promptActivation);
  const ok = state.canEdit;
  const Icon = ok ? FaShield : FaTriangleExclamation;

  return (
    <button
      type="button"
      onClick={() => promptActivation()}
      className={`nodrag inline-flex h-6 items-center gap-1.5 rounded border px-2 text-[11px] ${
        ok
          ? 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
      }`}
      title={state.reason}
    >
      <Icon className="size-3" />
      {licenseLabel(state)}
    </button>
  );
}

function WindowControls({ state }: { state: DesktopWindowState }) {
  if (state.platform === 'darwin') return <div className="w-[78px] shrink-0" />;

  const buttonClass =
    'nodrag inline-flex h-8 w-10 items-center justify-center text-zinc-500 hover:bg-white/10 hover:text-zinc-200';

  return (
    <div className="ml-2 flex h-8 items-center">
      <button
        type="button"
        className={buttonClass}
        title="Minimize"
        onClick={() => void appBridge.minimizeWindow()}
      >
        <FaMinus className="size-3" />
      </button>
      <button
        type="button"
        className={buttonClass}
        title={state.isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => void appBridge.toggleMaximizeWindow()}
      >
        {state.isMaximized ? <FaSquare className="size-3" /> : <FaRegSquare className="size-3" />}
      </button>
      <button
        type="button"
        className={`${buttonClass} hover:bg-red-500/80 hover:text-white`}
        title="Close"
        onClick={() => void appBridge.closeWindow()}
      >
        <FaXmark className="size-3.5" />
      </button>
    </div>
  );
}

export function DesktopTitleBar({ windowState }: DesktopTitleBarProps) {
  const desktop = isDesktopRuntime();
  if (!desktop) return null;

  const platform = windowState?.platform ?? window.apolloMapStudio?.platform;
  const PlatformIcon = desktop ? FaDesktop : FaGlobe;

  return (
    <div
      className={`drag h-9 shrink-0 border-b border-white/[0.07] bg-zinc-950/95 text-zinc-400 ${
        windowState?.isFocused === false ? 'opacity-80' : ''
      }`}
    >
      <div className="flex h-full items-center gap-3 pl-3 pr-0">
        {platform === 'darwin' ? <div className="w-[68px] shrink-0" /> : null}
        <div className="flex min-w-0 items-center gap-2">
          <img src={logoUrl} alt="" className="size-4 rounded-[3px]" aria-hidden="true" />
          <span className="truncate text-xs font-medium tracking-wide text-zinc-200">
            Apollo Map Studio
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-zinc-500">
            <PlatformIcon className="size-3" />
            {platformLabel(desktop ? platform : undefined)}
          </span>
          {windowState?.isFullscreen ? (
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-200">
              Fullscreen
            </span>
          ) : null}
        </div>

        <LicenseChip />
        {windowState ? <WindowControls state={windowState} /> : null}
      </div>
    </div>
  );
}
