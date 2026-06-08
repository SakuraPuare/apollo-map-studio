import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from '../useNow';
import type * as ReactModule from 'react';

const reactMocks = vi.hoisted(() => {
  const cleanups: unknown[] = [];
  const stateSetters: Array<ReturnType<typeof vi.fn>> = [];
  return {
    cleanups,
    stateSetters,
    useEffect: vi.fn((effect: () => unknown) => {
      cleanups.push(effect());
    }),
    useState: vi.fn(<T>(initial: T | (() => T)) => {
      const value = typeof initial === 'function' ? (initial as () => T)() : initial;
      const setState = vi.fn();
      stateSetters.push(setState);
      return [value, setState] as const;
    }),
  };
});

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  reactMocks.cleanups.length = 0;
  reactMocks.stateSetters.length = 0;
  vi.stubGlobal('window', {
    setInterval: vi.fn(() => 42),
    clearInterval: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useNow', () => {
  it('returns the initial timestamp, updates on the configured interval, and clears the timer', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1250);

    const now = useNow(250);

    expect(now).toBe(1000);
    expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 250);

    const tick = vi.mocked(window.setInterval).mock.calls[0]![0] as () => void;
    tick();
    expect(reactMocks.stateSetters[0]).toHaveBeenCalledWith(1250);

    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();

    expect(window.clearInterval).toHaveBeenCalledWith(42);
  });
});
