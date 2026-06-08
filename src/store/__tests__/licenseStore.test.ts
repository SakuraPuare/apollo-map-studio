import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { licenseBridge, type LicenseState } from '@/lib/license-bridge';
import { useLicenseStore } from '../licenseStore';

const initialStore = useLicenseStore.getState();

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

function deferredState() {
  let resolve!: (state: LicenseState) => void;
  const promise = new Promise<LicenseState>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  useLicenseStore.setState(
    {
      ...initialStore,
      state: makeState({
        status: 'not_started',
        canEdit: false,
        reason: 'License state is loading.',
      }),
      initialized: false,
      sequence: 0,
      promptActivation: vi.fn(),
    },
    true,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  useLicenseStore.setState(initialStore, true);
});

describe('licenseStore hydration', () => {
  it('does not let a stale hydrate response overwrite a newer pushed state', async () => {
    const hydrateResponse = deferredState();
    vi.spyOn(licenseBridge, 'getState').mockReturnValue(hydrateResponse.promise);

    const hydratePromise = useLicenseStore.getState().hydrate();
    const pushedState = makeState({
      status: 'activated',
      reason: 'pushed from desktop bridge',
    });

    useLicenseStore.getState().setState(pushedState);
    hydrateResponse.resolve(
      makeState({
        status: 'expired_trial',
        canEdit: false,
        daysRemaining: 0,
        hoursRemaining: 0,
        reason: 'stale hydrate',
      }),
    );
    await hydratePromise;

    expect(useLicenseStore.getState().state).toBe(pushedState);
    expect(useLicenseStore.getState().initialized).toBe(true);
  });

  it('only applies the newest overlapping hydrate response', async () => {
    const first = deferredState();
    const second = deferredState();
    vi.spyOn(licenseBridge, 'getState')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstHydrate = useLicenseStore.getState().hydrate();
    const secondHydrate = useLicenseStore.getState().hydrate();
    const latestState = makeState({
      status: 'activated',
      reason: 'latest hydrate',
    });

    second.resolve(latestState);
    await secondHydrate;
    first.resolve(
      makeState({
        status: 'expired_trial',
        canEdit: false,
        daysRemaining: 0,
        hoursRemaining: 0,
        reason: 'older hydrate',
      }),
    );
    await firstHydrate;

    expect(useLicenseStore.getState().state).toBe(latestState);
  });

  it('marks hydration initialized with a read-only state when the bridge rejects', async () => {
    vi.spyOn(licenseBridge, 'getState').mockRejectedValue(new Error('IPC unavailable'));

    await expect(useLicenseStore.getState().hydrate()).resolves.toBeUndefined();

    expect(useLicenseStore.getState()).toMatchObject({
      initialized: true,
      state: {
        status: 'not_started',
        canEdit: false,
        reason: 'IPC unavailable',
      },
    });
  });
});
