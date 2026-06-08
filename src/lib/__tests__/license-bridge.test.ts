import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { licenseBridge, type ActivationResult, type LicenseState } from '../license-bridge';

const storage = new Map<string, string>();

function makeState(overrides: Partial<LicenseState> = {}): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'WEB-BROWSER',
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
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  });
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('licenseBridge', () => {
  it('uses the browser-local provider when no desktop license API exists', async () => {
    const state = await licenseBridge.getState();

    expect(state.status).toBe('trial');
    expect(state.canEdit).toBe(true);
    expect(state.machineCode).toBe('WEB-BROWSER');
    expect(localStorage.getItem('ams.webLicense.v1')).toBeTruthy();
  });

  it('falls back to the browser-local provider for all non-desktop bridge methods', async () => {
    const handler = vi.fn();

    await expect(licenseBridge.getMachineCode()).resolves.toBe('WEB-BROWSER');
    await expect(licenseBridge.activate('code')).resolves.toMatchObject({
      ok: false,
      errorCode: 'unknown',
    });
    await expect(licenseBridge.deactivate()).resolves.toMatchObject({
      status: 'trial',
      machineCode: 'WEB-BROWSER',
    });
    expect(licenseBridge.onChange(handler)()).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('delegates state, activation, and subscriptions to the desktop license API', async () => {
    const desktopState = makeState({
      status: 'activated',
      machineCode: 'DESKTOP-MACHINE',
      reason: 'desktop',
    });
    const activationResult: ActivationResult = {
      ok: true,
      state: desktopState,
    };
    const deactivatedState = makeState({ status: 'trial', reason: 'deactivated' });
    const unsubscribe = vi.fn();
    const handler = vi.fn();
    window.apolloMapStudioLicense = {
      getState: vi.fn().mockResolvedValue(desktopState),
      getMachineCode: vi.fn().mockResolvedValue('DESKTOP-MACHINE'),
      activate: vi.fn().mockResolvedValue(activationResult),
      deactivate: vi.fn().mockResolvedValue(deactivatedState),
      onChange: vi.fn(() => unsubscribe),
    };

    await expect(licenseBridge.getState()).resolves.toBe(desktopState);
    await expect(licenseBridge.getMachineCode()).resolves.toBe('DESKTOP-MACHINE');
    await expect(licenseBridge.activate('code')).resolves.toBe(activationResult);
    await expect(licenseBridge.deactivate()).resolves.toBe(deactivatedState);
    const returnedUnsubscribe = licenseBridge.onChange(handler);

    expect(window.apolloMapStudioLicense.getState).toHaveBeenCalledTimes(1);
    expect(window.apolloMapStudioLicense.activate).toHaveBeenCalledWith('code');
    expect(window.apolloMapStudioLicense.deactivate).toHaveBeenCalledTimes(1);
    expect(window.apolloMapStudioLicense.onChange).toHaveBeenCalledWith(handler);
    expect(returnedUnsubscribe).toBe(unsubscribe);
  });
});
