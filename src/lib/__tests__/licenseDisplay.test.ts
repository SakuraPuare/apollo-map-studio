import { describe, expect, it } from 'vitest';
import type { LicenseState } from '../license-bridge';
import {
  formatCountdownMs,
  formatLicenseExpirySummary,
  formatLocalDateTime,
} from '../licenseDisplay';

function trialState(trialEnd: number): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'TEST',
    trialStart: trialEnd - 7 * 24 * 60 * 60 * 1000,
    trialEnd,
    daysRemaining: 2,
    hoursRemaining: 27,
    license: null,
    checkedAt: Date.now(),
    reason: 'Free trial.',
  };
}

describe('licenseDisplay', () => {
  it('formats countdowns down to seconds', () => {
    expect(formatCountdownMs(26 * 60 * 60 * 1000 + 3 * 60 * 1000 + 4 * 1000)).toBe('1d 02:03:04');
    expect(formatCountdownMs(7 * 60 * 1000 + 8 * 1000)).toBe('00:07:08');
    expect(formatCountdownMs(-1)).toBe('00:00:00');
  });

  it('formats local expiration timestamps with seconds', () => {
    const expiresAt = new Date(2026, 4, 12, 8, 30, 45).getTime();

    expect(formatLocalDateTime(expiresAt)).toBe('2026-05-12 08:30:45');
  });

  it('combines trial expiration time with second-level countdown', () => {
    const now = new Date(2026, 4, 11, 6, 27, 41).getTime();
    const expiresAt = new Date(2026, 4, 12, 8, 30, 45).getTime();
    const state = trialState(expiresAt);

    expect(formatLicenseExpirySummary(state, now)).toBe(
      'Expires 2026-05-12 08:30:45 · 1d 02:03:04 remaining',
    );
  });
});
