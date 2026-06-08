import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackClock } from '../usePlaybackClock';
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

const playbackStoreMock = vi.hoisted(() => {
  type PlaybackState = {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    speed: number;
    setCurrentTime: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  };
  type PlaybackStoreHook = ReturnType<typeof vi.fn> & {
    getState: ReturnType<typeof vi.fn<() => PlaybackState>>;
  };
  const state: PlaybackState = {
    isPlaying: false,
    currentTime: 0,
    duration: 10,
    speed: 1,
    setCurrentTime: vi.fn(),
    pause: vi.fn(),
  };
  const usePlaybackStore = vi.fn((selector: (state: PlaybackState) => unknown) =>
    selector(state),
  ) as PlaybackStoreHook;
  usePlaybackStore.getState = vi.fn(() => state);
  return {
    state,
    usePlaybackStore,
  };
});

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
  };
});

vi.mock('@/store/playbackStore', () => ({
  usePlaybackStore: playbackStoreMock.usePlaybackStore,
}));

function installAnimationFrame() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return callbacks;
}

beforeEach(() => {
  vi.clearAllMocks();
  reactMocks.cleanups.length = 0;
  playbackStoreMock.state.isPlaying = false;
  playbackStoreMock.state.currentTime = 0;
  playbackStoreMock.state.duration = 10;
  playbackStoreMock.state.speed = 1;
  playbackStoreMock.state.setCurrentTime = vi.fn();
  playbackStoreMock.state.pause = vi.fn();
  vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('usePlaybackClock', () => {
  it('does not schedule animation frames while playback is stopped', () => {
    installAnimationFrame();

    usePlaybackClock();

    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('advances playback by elapsed time and cancels the latest pending frame on cleanup', () => {
    const callbacks = installAnimationFrame();
    playbackStoreMock.state.isPlaying = true;
    playbackStoreMock.state.currentTime = 1;
    playbackStoreMock.state.speed = 2;

    usePlaybackClock();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    callbacks.get(1)?.(1500);

    expect(playbackStoreMock.state.setCurrentTime).toHaveBeenCalledWith(2);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
  });

  it('clamps to duration and pauses when the next tick reaches the end', () => {
    const callbacks = installAnimationFrame();
    playbackStoreMock.state.isPlaying = true;
    playbackStoreMock.state.currentTime = 9.5;
    playbackStoreMock.state.duration = 10;
    playbackStoreMock.state.speed = 2;

    usePlaybackClock();
    callbacks.get(1)?.(1500);

    expect(playbackStoreMock.state.setCurrentTime).toHaveBeenCalledWith(10);
    expect(playbackStoreMock.state.pause).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
