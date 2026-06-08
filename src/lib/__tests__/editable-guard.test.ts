import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenseState } from '../license-bridge';

function makeState(overrides: Partial<LicenseState> = {}): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'machine',
    trialStart: 0,
    trialEnd: 7 * 24 * 60 * 60 * 1000,
    daysRemaining: 7,
    hoursRemaining: 7 * 24,
    license: null,
    checkedAt: 0,
    reason: 'test',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('assertEditable', () => {
  it('allows edits without prompting or warning when the license can edit', async () => {
    const { useLicenseStore } = await import('@/store/licenseStore');
    const { assertEditable } = await import('../editable-guard');
    const promptActivation = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    useLicenseStore.setState({
      state: makeState({
        status: 'trial',
        canEdit: true,
        reason: 'editable',
      }),
      initialized: true,
      promptActivation,
    });

    expect(assertEditable('moveEntity')).toBe(true);
    expect(promptActivation).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('blocks edits before license hydration completes', async () => {
    const { useLicenseStore } = await import('@/store/licenseStore');
    const { assertEditable } = await import('../editable-guard');
    const promptActivation = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    useLicenseStore.setState({
      state: makeState({
        status: 'not_started',
        canEdit: false,
        reason: 'License state is loading.',
      }),
      initialized: false,
      promptActivation,
    });

    expect(assertEditable('addEntity')).toBe(false);
    expect(promptActivation).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[license] Blocked addEntity: status=not_started. License state is loading.',
    );
  });

  it('keeps prompting for blocked edits even when warnings are throttled', async () => {
    const { useLicenseStore } = await import('@/store/licenseStore');
    const { assertEditable } = await import('../editable-guard');
    const promptActivation = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    useLicenseStore.setState({
      state: makeState({
        status: 'expired_trial',
        canEdit: false,
        daysRemaining: 0,
        hoursRemaining: 0,
        reason: 'expired',
      }),
      initialized: true,
      promptActivation,
    });

    expect(assertEditable('firstEdit')).toBe(false);
    expect(assertEditable('secondEdit')).toBe(false);

    expect(promptActivation).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows activation prompt errors and logs again after the throttle window', async () => {
    const { useLicenseStore } = await import('@/store/licenseStore');
    const { assertEditable } = await import('../editable-guard');
    const promptActivation = vi.fn(() => {
      throw new Error('dialog not mounted');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    useLicenseStore.setState({
      state: makeState({
        status: 'tampered',
        canEdit: false,
        reason: 'Clock rollback detected.',
      }),
      initialized: true,
      promptActivation,
    });

    expect(() => assertEditable('deleteEntity')).not.toThrow();
    expect(assertEditable('reshapeLane')).toBe(false);
    vi.setSystemTime(15_001);
    expect(assertEditable('reshapeLane')).toBe(false);

    expect(promptActivation).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenLastCalledWith(
      '[license] Blocked reshapeLane: status=tampered. Clock rollback detected.',
    );
  });
});
