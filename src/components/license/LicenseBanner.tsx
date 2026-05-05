import { FaTriangleExclamation, FaShield, FaClock, FaKey } from 'react-icons/fa6';
import { useLicenseStore } from '@/store/licenseStore';
import type { LicenseState } from '@/lib/license-bridge';
import { formatLicenseExpirySummary } from '@/lib/licenseDisplay';
import { useNow } from '@/hooks/useNow';

const STATUS_TONE: Record<
  string,
  { bg: string; border: string; text: string; icon: typeof FaShield }
> = {
  activated: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-200',
    icon: FaShield,
  },
  trial: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    text: 'text-cyan-200',
    icon: FaClock,
  },
  expired_trial: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
    text: 'text-amber-200',
    icon: FaTriangleExclamation,
  },
  expired_license: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
    text: 'text-amber-200',
    icon: FaTriangleExclamation,
  },
  tampered: {
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/40',
    text: 'text-rose-200',
    icon: FaTriangleExclamation,
  },
  machine_mismatch: {
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/40',
    text: 'text-rose-200',
    icon: FaTriangleExclamation,
  },
  invalid: {
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/40',
    text: 'text-rose-200',
    icon: FaTriangleExclamation,
  },
  not_started: {
    bg: 'bg-zinc-700/30',
    border: 'border-white/10',
    text: 'text-zinc-300',
    icon: FaClock,
  },
};

/**
 * Top-of-window banner. Trial mode shows quietly only when remaining time
 * is short; expired / tampered states render a hard-to-miss read-only
 * banner with an "Activate" button.
 */
function isActivatedExpiring(state: LicenseState): boolean {
  return state.status === 'activated' && state.daysRemaining !== null && state.daysRemaining <= 14;
}

function shouldHideBanner(state: LicenseState): boolean {
  if (state.status === 'trial') {
    return state.daysRemaining !== null && state.daysRemaining > 3;
  }
  if (state.status !== 'activated') return false;
  if (state.license?.expires === 0) return true;
  return state.daysRemaining === null || state.daysRemaining > 14;
}

function bannerMessage(state: LicenseState, now: number): string {
  switch (state.status) {
    case 'trial':
      return `Trial ${formatLicenseExpirySummary(state, now)} — activate to keep editing`;
    case 'activated':
      return state.daysRemaining !== null
        ? `Licensed · ${formatLicenseExpirySummary(state, now)}`
        : 'Licensed · perpetual';
    case 'expired_trial':
      return `Trial ${formatLicenseExpirySummary(state, now)} — read-only mode. Activate to continue editing.`;
    case 'expired_license':
      return `License ${formatLicenseExpirySummary(state, now)} — read-only mode. Renew to continue editing.`;
    case 'machine_mismatch':
      return 'License is bound to a different machine — read-only mode.';
    case 'tampered':
      return 'Tampering detected — read-only mode. Re-activation required.';
    case 'invalid':
      return 'License signature failed verification — read-only mode.';
    case 'not_started':
      return 'License pending — read-only mode.';
    default:
      return state.reason;
  }
}

function shouldShowAction(state: LicenseState): boolean {
  return !state.canEdit || state.status === 'trial' || isActivatedExpiring(state);
}

export function LicenseBanner() {
  const state = useLicenseStore((s) => s.state);
  const promptActivation = useLicenseStore((s) => s.promptActivation);
  const now = useNow();

  if (shouldHideBanner(state)) return null;

  const tone = STATUS_TONE[state.status] ?? STATUS_TONE.trial!;
  const Icon = tone.icon;
  const message = bannerMessage(state, now);

  return (
    <div
      className={`flex items-center justify-between px-4 py-1.5 border-b ${tone.bg} ${tone.border} ${tone.text}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Icon className="w-3.5 h-3.5" />
        <span>{message}</span>
      </div>
      {shouldShowAction(state) ? (
        <button
          type="button"
          onClick={() => promptActivation()}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-white/20 hover:bg-white/10"
        >
          <FaKey className="w-3 h-3" />
          {state.status === 'activated' ? 'Manage license' : 'Activate'}
        </button>
      ) : null}
    </div>
  );
}
