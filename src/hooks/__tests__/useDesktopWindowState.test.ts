import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopWindowState } from '../useDesktopWindowState';
import type * as AppBridgeModule from '@/lib/app-bridge';
import type * as ReactModule from 'react';
import type { DesktopWindowState } from '@/lib/app-bridge';

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

const appBridgeMock = vi.hoisted(() => ({
  appBridge: {
    getWindowState: vi.fn(),
    onWindowStateChange: vi.fn(),
  },
  isDesktopRuntime: vi.fn(),
}));

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
  };
});

vi.mock('@/lib/app-bridge', async (importActual) => {
  const actual = await importActual<typeof AppBridgeModule>();
  return {
    ...actual,
    appBridge: appBridgeMock.appBridge,
    isDesktopRuntime: appBridgeMock.isDesktopRuntime,
  };
});

function state(overrides: Partial<DesktopWindowState> = {}): DesktopWindowState {
  return {
    platform: 'linux',
    isMaximized: false,
    isFullscreen: false,
    isFocused: true,
    ...overrides,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  reactMocks.cleanups.length = 0;
  reactMocks.stateSetters.length = 0;
  appBridgeMock.isDesktopRuntime.mockReturnValue(false);
  appBridgeMock.appBridge.getWindowState.mockResolvedValue(null);
  appBridgeMock.appBridge.onWindowStateChange.mockReturnValue(vi.fn());
  vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useDesktopWindowState', () => {
  it('returns null and skips bridge subscriptions in web runtime', () => {
    const result = useDesktopWindowState();

    expect(result).toBeNull();
    expect(appBridgeMock.appBridge.getWindowState).not.toHaveBeenCalled();
    expect(appBridgeMock.appBridge.onWindowStateChange).not.toHaveBeenCalled();
  });

  it('uses fallback desktop state, applies async state, and unsubscribes on cleanup', async () => {
    const hydrated = state({ isMaximized: true });
    const pushed = state({ isFocused: false });
    const unsubscribe = vi.fn();
    let changeHandler!: (next: DesktopWindowState) => void;

    appBridgeMock.isDesktopRuntime.mockReturnValue(true);
    appBridgeMock.appBridge.getWindowState.mockResolvedValue(hydrated);
    appBridgeMock.appBridge.onWindowStateChange.mockImplementation((handler) => {
      changeHandler = handler;
      return unsubscribe;
    });
    vi.stubGlobal('window', { apolloMapStudio: { platform: 'darwin' } });

    const initial = useDesktopWindowState();

    expect(initial).toEqual({
      platform: 'darwin',
      isMaximized: false,
      isFullscreen: false,
      isFocused: true,
    });

    await flushMicrotasks();
    const setState = reactMocks.stateSetters[0]!;
    expect(setState).toHaveBeenCalledWith(hydrated);

    changeHandler(pushed);
    expect(setState).toHaveBeenCalledWith(pushed);

    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores an async window state response after unmount', async () => {
    let resolveState!: (next: DesktopWindowState) => void;
    const pendingState = new Promise<DesktopWindowState>((resolve) => {
      resolveState = resolve;
    });
    appBridgeMock.isDesktopRuntime.mockReturnValue(true);
    appBridgeMock.appBridge.getWindowState.mockReturnValue(pendingState);

    useDesktopWindowState();
    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();
    resolveState(state({ isFullscreen: true }));
    await flushMicrotasks();

    expect(reactMocks.stateSetters[0]).not.toHaveBeenCalled();
  });
});
