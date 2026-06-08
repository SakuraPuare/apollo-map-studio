import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLicenseSync } from '../useLicense';
import type * as ReactModule from 'react';

const reactMocks = vi.hoisted(() => {
  const cleanups: unknown[] = [];
  return {
    cleanups,
    useEffect: vi.fn((effect: () => unknown) => {
      cleanups.push(effect());
    }),
  };
});

const licenseStoreMock = vi.hoisted(() => {
  type LicenseState = {
    hydrate: ReturnType<typeof vi.fn>;
    setState: ReturnType<typeof vi.fn>;
  };
  const state: LicenseState = {
    hydrate: vi.fn(),
    setState: vi.fn(),
  };
  return {
    state,
    useLicenseStore: vi.fn((selector: (state: LicenseState) => unknown) => selector(state)),
  };
});

const licenseBridgeMock = vi.hoisted(() => ({
  licenseBridge: {
    onChange: vi.fn(),
  },
}));

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
  };
});

vi.mock('@/store/licenseStore', () => ({
  useLicenseStore: licenseStoreMock.useLicenseStore,
}));

vi.mock('@/lib/license-bridge', () => ({
  licenseBridge: licenseBridgeMock.licenseBridge,
}));

beforeEach(() => {
  vi.clearAllMocks();
  reactMocks.cleanups.length = 0;
  licenseStoreMock.state.hydrate = vi.fn();
  licenseStoreMock.state.setState = vi.fn();
  licenseBridgeMock.licenseBridge.onChange.mockReturnValue(vi.fn());
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLicenseSync', () => {
  it('hydrates on mount, subscribes to bridge pushes, rehydrates on focus, and cleans up', () => {
    const unsubscribe = vi.fn();
    licenseBridgeMock.licenseBridge.onChange.mockReturnValue(unsubscribe);

    useLicenseSync();

    expect(licenseStoreMock.state.hydrate).toHaveBeenCalledTimes(1);
    expect(licenseBridgeMock.licenseBridge.onChange).toHaveBeenCalledWith(
      licenseStoreMock.state.setState,
    );
    expect(window.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));

    const onFocus = vi.mocked(window.addEventListener).mock.calls[0]![1] as () => void;
    onFocus();
    expect(licenseStoreMock.state.hydrate).toHaveBeenCalledTimes(2);

    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', onFocus);
  });
});
