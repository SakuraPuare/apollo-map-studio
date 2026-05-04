import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllSavedLayouts, clearSavedLayout } from '../dockviewLayout';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('dockviewLayout storage cleanup', () => {
  it('clears the saved layout for one app mode', () => {
    clearSavedLayout('drawing');

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('ams-layout-v3-drawing');
  });

  it('clears every current and legacy layout key', () => {
    clearAllSavedLayouts();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('ams-layout-v3-drawing');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('ams-layout-v3-scene');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('ams-layout-v2');
  });
});
