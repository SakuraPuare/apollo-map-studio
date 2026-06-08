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

function activatedState(expires: number): LicenseState {
  return {
    ...trialState(0),
    status: 'activated',
    license: {
      id: 'lic-1',
      name: 'Fleet License',
      issued: 1,
      expires,
    },
    reason: '',
  };
}

describe('licenseDisplay', () => {
  it('formats countdowns down to seconds', () => {
    expect(formatCountdownMs(26 * 60 * 60 * 1000 + 3 * 60 * 1000 + 4 * 1000)).toBe('1d 02:03:04');
    expect(formatCountdownMs(7 * 60 * 1000 + 8 * 1000)).toBe('00:07:08');
    expect(formatCountdownMs(1)).toBe('00:00:01');
    expect(formatCountdownMs(1001)).toBe('00:00:02');
    expect(formatCountdownMs(-1)).toBe('00:00:00');
    expect(formatCountdownMs(Number.POSITIVE_INFINITY)).toBe('00:00:00');
  });

  it('formats local expiration timestamps with seconds', () => {
    const expiresAt = new Date(2026, 4, 12, 8, 30, 45).getTime();

    expect(formatLocalDateTime(expiresAt)).toBe('2026-05-12 08:30:45');
    expect(formatLocalDateTime(null)).toBe('Never');
    expect(formatLocalDateTime(undefined)).toBe('Never');
    expect(formatLocalDateTime(Number.NaN)).toBe('Never');
  });

  it('combines trial expiration time with second-level countdown', () => {
    const now = new Date(2026, 4, 11, 6, 27, 41).getTime();
    const expiresAt = new Date(2026, 4, 12, 8, 30, 45).getTime();
    const state = trialState(expiresAt);

    expect(formatLicenseExpirySummary(state, now)).toBe(
      'Expires 2026-05-12 08:30:45 · 1d 02:03:04 remaining',
    );
  });

  it('summarizes perpetual, missing, and expired license windows', () => {
    const now = new Date(2026, 4, 12, 8, 30, 45).getTime();
    const expiredAt = now - 1000;

    expect(formatLicenseExpirySummary(activatedState(0), now)).toBe('Perpetual license');
    expect(
      formatLicenseExpirySummary({ ...trialState(0), reason: 'Waiting for trial.' }, now),
    ).toBe('Waiting for trial.');
    expect(formatLicenseExpirySummary({ ...trialState(0), reason: '' }, now)).toBe(
      'No expiry reported',
    );
    expect(
      formatLicenseExpirySummary({ ...activatedState(-1), reason: 'No active window.' }, now),
    ).toBe('No active window.');
    expect(
      formatLicenseExpirySummary(
        {
          ...activatedState(expiredAt),
          status: 'expired_license',
        },
        now,
      ),
    ).toBe(`Expired ${formatLocalDateTime(expiredAt)}`);
    expect(
      formatLicenseExpirySummary(
        {
          ...trialState(expiredAt),
          status: 'expired_trial',
        },
        now,
      ),
    ).toBe(`Expired ${formatLocalDateTime(expiredAt)}`);
  });

  it('treats a live status as expired once the expiry timestamp is reached', () => {
    const now = new Date(2026, 4, 12, 8, 30, 45).getTime();

    expect(formatLicenseExpirySummary(trialState(now), now)).toBe(
      `Expired ${formatLocalDateTime(now)}`,
    );
    expect(formatLicenseExpirySummary(activatedState(now), now)).toBe(
      `Expired ${formatLocalDateTime(now)}`,
    );
  });
});
