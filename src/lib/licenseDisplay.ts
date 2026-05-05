import type { LicenseState } from './license-bridge';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalDateTime(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return 'Never';
  const date = new Date(value);
  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
  ].join(' ');
}

export function formatCountdownMs(ms: number): string {
  const totalSeconds = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / SECOND_MS)) : 0;
  const days = Math.floor(totalSeconds / (DAY_MS / SECOND_MS));
  const hours = Math.floor((totalSeconds % (DAY_MS / SECOND_MS)) / (HOUR_MS / SECOND_MS));
  const minutes = Math.floor((totalSeconds % (HOUR_MS / SECOND_MS)) / (MINUTE_MS / SECOND_MS));
  const seconds = totalSeconds % (MINUTE_MS / SECOND_MS);
  const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

  return days > 0 ? `${days}d ${clock}` : clock;
}

function formatShortCountdownMs(ms: number): string {
  const totalMinutes = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / MINUTE_MS)) : 0;
  const days = Math.floor(totalMinutes / (DAY_MS / MINUTE_MS));
  const hours = Math.floor((totalMinutes % (DAY_MS / MINUTE_MS)) / (HOUR_MS / MINUTE_MS));
  const minutes = totalMinutes % (HOUR_MS / MINUTE_MS);
  const clock = `${pad2(hours)}:${pad2(minutes)}`;

  return days > 0 ? `${days}d ${clock}` : clock;
}

export function getLicenseExpiryTime(state: LicenseState): number | null {
  if (state.status === 'activated' || state.status === 'expired_license') {
    const expires = state.license?.expires;
    return expires && expires > 0 ? expires : null;
  }

  return state.trialEnd > 0 ? state.trialEnd : null;
}

export function formatCountdownUntil(expiresAt: number | null | undefined, now: number): string {
  if (!expiresAt) return '';
  return formatCountdownMs(expiresAt - now);
}

export function hasLicenseExpired(state: LicenseState, now: number): boolean {
  const expiresAt = getLicenseExpiryTime(state);
  return (
    state.status === 'expired_trial' ||
    state.status === 'expired_license' ||
    Boolean(expiresAt && now >= expiresAt)
  );
}

export function formatLicenseExpirySummary(state: LicenseState, now: number): string {
  if (state.status === 'activated' && state.license?.expires === 0) {
    return 'Perpetual license';
  }

  const expiresAt = getLicenseExpiryTime(state);
  if (!expiresAt) return state.reason || 'No expiry reported';

  const expiry = formatLocalDateTime(expiresAt);
  if (hasLicenseExpired(state, now)) return `Expired ${expiry}`;

  return `Expires ${expiry} · ${formatCountdownUntil(expiresAt, now)} remaining`;
}

export function formatTrialShortLabel(state: LicenseState, now: number): string {
  if (state.status !== 'trial') return state.canEdit ? 'Licensed' : 'Read-only';
  return `Trial ${formatShortCountdownMs(state.trialEnd - now)}`;
}
