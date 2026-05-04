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
});
