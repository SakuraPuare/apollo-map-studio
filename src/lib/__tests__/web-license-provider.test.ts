import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webLicenseProvider } from '../web-license-provider';

const STORAGE_KEY = 'ams.webLicense.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  },
  configurable: true,
});

describe('webLicenseProvider', () => {
  beforeEach(() => {
    storage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('creates a browser-local trial state instead of an unlimited fallback', async () => {
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'));

    const state = await webLicenseProvider.getState();

    expect(state.status).toBe('trial');
    expect(state.canEdit).toBe(true);
    expect(state.machineCode).toBe('WEB-BROWSER');
    expect(localStorage.getItem(STORAGE_KEY)).toContain(String(state.trialStart));
  });

  it('blocks editing after the persisted web trial expires', async () => {
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trialStart }));
    vi.setSystemTime(trialStart + 8 * DAY_MS);

    const state = await webLicenseProvider.getState();

    expect(state.status).toBe('expired_trial');
    expect(state.canEdit).toBe(false);
    expect(state.hoursRemaining).toBe(0);
  });

  it('recovers from malformed storage by creating a fresh trial record', async () => {
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));
    localStorage.setItem(STORAGE_KEY, '{bad json');

    const state = await webLicenseProvider.getState();

    expect(state.status).toBe('trial');
    expect(state.trialStart).toBe(new Date('2026-05-10T00:00:00.000Z').getTime());
    expect(localStorage.getItem(STORAGE_KEY)).toContain(String(state.trialStart));
  });

  it('recovers from a persisted record with an invalid trialStart type', async () => {
    const now = new Date('2026-05-11T00:00:00.000Z').getTime();
    vi.setSystemTime(now);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trialStart: '2026-05-01' }));

    const state = await webLicenseProvider.getState();

    expect(state.status).toBe('trial');
    expect(state.trialStart).toBe(now);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ trialStart: now });
  });

  it('uses an unexpired persisted activation ahead of trial state', async () => {
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trialStart,
        activation: {
          license: { id: 'lic_1', name: 'Team', issued: trialStart, expires: 0 },
          expires: 0,
          activatedAt: trialStart,
        },
      }),
    );
    vi.setSystemTime(trialStart + 30 * DAY_MS);

    const state = await webLicenseProvider.getState();

    expect(state.status).toBe('activated');
    expect(state.canEdit).toBe(true);
    expect(state.daysRemaining).toBeNull();
    expect(state.hoursRemaining).toBeNull();
    expect(state.license?.id).toBe('lic_1');
  });

  it('marks persisted activations as expired when their expiry is in the past', async () => {
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    const expires = trialStart + 2 * DAY_MS;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trialStart,
        activation: {
          license: { id: 'lic_2', name: 'Short', issued: trialStart, expires },
          expires,
          activatedAt: trialStart,
        },
      }),
    );
    vi.setSystemTime(trialStart + 3 * DAY_MS);

    const state = await webLicenseProvider.getState();

    expect(state.status).toBe('expired_license');
    expect(state.canEdit).toBe(false);
    expect(state.hoursRemaining).toBe(0);
  });

  it('returns machine code and no-op onChange unsubscribe for web builds', async () => {
    const handler = vi.fn();
    const unsubscribe = webLicenseProvider.onChange(handler);

    expect(await webLicenseProvider.getMachineCode()).toBe('WEB-BROWSER');
    expect(unsubscribe()).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('activation without a configured endpoint returns the current local state and error details', async () => {
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trialStart }));
    vi.setSystemTime(trialStart + DAY_MS);

    const result = await webLicenseProvider.activate('CODE');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('unknown');
    expect(result.errorMessage).toContain('Web activation endpoint is not configured');
    expect(result.state.status).toBe('trial');
    expect(result.state.trialStart).toBe(trialStart);
  });

  it('deactivate drops activation data and returns to trial state', async () => {
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trialStart,
        activation: {
          license: { id: 'lic_3', name: 'Team', issued: trialStart, expires: 0 },
          expires: 0,
          activatedAt: trialStart,
        },
      }),
    );
    vi.setSystemTime(trialStart + DAY_MS);

    const state = await webLicenseProvider.deactivate();

    expect(state.status).toBe('trial');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ trialStart });
  });

  it('activation endpoint failures return server status details', async () => {
    vi.stubEnv('VITE_AMS_WEB_LICENSE_ENDPOINT', 'https://license.example/activate');
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );
    const { webLicenseProvider: provider } = await import('../web-license-provider');

    const result = await provider.activate('CODE');

    expect(fetch).toHaveBeenCalledWith(
      'https://license.example/activate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'CODE', machineCode: 'WEB-BROWSER' }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Activation server returned 503.');
  });

  it('activation response denials preserve local state and pass through response errors', async () => {
    vi.stubEnv('VITE_AMS_WEB_LICENSE_ENDPOINT', 'https://license.example/activate');
    vi.resetModules();
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trialStart }));
    vi.setSystemTime(trialStart + DAY_MS);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: false,
          errorCode: 'machine_mismatch',
          errorMessage: 'Activation code belongs to another machine.',
        }),
      }),
    );
    const { webLicenseProvider: provider } = await import('../web-license-provider');

    const result = await provider.activate('CODE');

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'machine_mismatch',
      errorMessage: 'Activation code belongs to another machine.',
    });
    expect(result.state.status).toBe('trial');
    expect(result.state.trialStart).toBe(trialStart);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ trialStart });
  });

  it('activation responses without a license use generic failure details', async () => {
    vi.stubEnv('VITE_AMS_WEB_LICENSE_ENDPOINT', 'https://license.example/activate');
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true }),
      }),
    );
    const { webLicenseProvider: provider } = await import('../web-license-provider');

    const result = await provider.activate('CODE');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('unknown');
    expect(result.errorMessage).toBe('Activation failed.');
  });

  it('successful activation persists returned license and endpoint expiry override', async () => {
    vi.stubEnv('VITE_AMS_WEB_LICENSE_ENDPOINT', 'https://license.example/activate');
    vi.resetModules();
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    const issued = trialStart + DAY_MS;
    const licenseExpires = trialStart + 10 * DAY_MS;
    const responseExpires = trialStart + 20 * DAY_MS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trialStart }));
    vi.setSystemTime(issued);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: true,
          license: { id: 'lic_4', name: 'Endpoint', issued, expires: licenseExpires },
          expires: responseExpires,
        }),
      }),
    );
    const { webLicenseProvider: provider } = await import('../web-license-provider');

    const result = await provider.activate('CODE');

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('activated');
    expect(result.state.license).toEqual({
      id: 'lic_4',
      name: 'Endpoint',
      issued,
      expires: responseExpires,
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.activation.expires).toBe(responseExpires);
    expect(stored.activation.activatedAt).toBe(issued);
  });

  it('successful activation falls back to the license expiry when the response omits one', async () => {
    vi.stubEnv('VITE_AMS_WEB_LICENSE_ENDPOINT', 'https://license.example/activate');
    vi.resetModules();
    const trialStart = new Date('2026-05-01T00:00:00.000Z').getTime();
    const issued = trialStart + DAY_MS;
    const licenseExpires = trialStart + 10 * DAY_MS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trialStart }));
    vi.setSystemTime(issued);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: true,
          license: { id: 'lic_5', name: 'Endpoint', issued, expires: licenseExpires },
        }),
      }),
    );
    const { webLicenseProvider: provider } = await import('../web-license-provider');

    const result = await provider.activate('CODE');

    expect(result.ok).toBe(true);
    expect(result.state.license?.expires).toBe(licenseExpires);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.activation.expires).toBe(licenseExpires);
    expect(stored.activation.license.expires).toBe(licenseExpires);
  });
});
