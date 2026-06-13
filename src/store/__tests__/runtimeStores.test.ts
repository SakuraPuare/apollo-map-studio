import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApolloMapStore, type ApolloMapImportInfo } from '../apolloMapStore';
import { usePlaybackStore } from '../playbackStore';
import { useTaskProgressStore } from '../taskProgressStore';

function resetApolloMapStore() {
  useApolloMapStore.setState({
    header: null,
    bounds: null,
    info: null,
    lastError: null,
  });
}

function resetTaskProgressStore() {
  useTaskProgressStore.setState({ activeTask: null });
}

function resetPlaybackStore() {
  usePlaybackStore.setState({
    currentTime: 0,
    duration: 30,
    isPlaying: false,
    speed: 1,
  });
}

beforeEach(() => {
  resetApolloMapStore();
  resetTaskProgressStore();
  resetPlaybackStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apolloMapStore', () => {
  const info: ApolloMapImportInfo = {
    source: 'imported',
    filename: 'base_map.bin',
    counts: { lane: 2, junction: 1 },
    projString: '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs',
    importedAt: 12345,
  };

  it('stores import metadata, bounds, and header while clearing stale errors', () => {
    const bounds: [[number, number], [number, number]] = [
      [116, 30],
      [117, 31],
    ];
    const header = { version: '1.0', district: 'test' };

    useApolloMapStore.getState().setError('previous failure');
    useApolloMapStore.getState().setImported(info, bounds, header);

    expect(useApolloMapStore.getState()).toMatchObject({
      header,
      bounds,
      info,
      lastError: null,
    });
  });

  it('defaults missing headers to null and clear resets all import state', () => {
    useApolloMapStore.getState().setImported(info, null);

    expect(useApolloMapStore.getState().header).toBeNull();
    expect(useApolloMapStore.getState().info).toBe(info);

    useApolloMapStore.getState().clear();

    expect(useApolloMapStore.getState()).toMatchObject({
      header: null,
      bounds: null,
      info: null,
      lastError: null,
    });
  });

  it('sets and clears the last error without dropping import context', () => {
    useApolloMapStore.getState().setImported(info, null);

    useApolloMapStore.getState().setError('export failed');
    expect(useApolloMapStore.getState().lastError).toBe('export failed');
    expect(useApolloMapStore.getState().info).toBe(info);

    useApolloMapStore.getState().setError(null);
    expect(useApolloMapStore.getState().lastError).toBeNull();
    expect(useApolloMapStore.getState().info).toBe(info);
  });
});

describe('taskProgressStore', () => {
  it('begins a task with default visibility and clamps progress into range', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    useTaskProgressStore.getState().beginTask({
      id: 'import',
      label: 'Importing',
      detail: 'reading map',
      progress: 2,
    });

    expect(useTaskProgressStore.getState().activeTask).toEqual({
      id: 'import',
      label: 'Importing',
      detail: 'reading map',
      progress: 1,
      startedAt: 1000,
      visibleAfterMs: 1000,
    });
  });

  it('preserves progress when omitted, clamps explicit updates, and ignores stale ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    useTaskProgressStore.getState().beginTask({
      id: 'export',
      label: 'Exporting',
      progress: 0.25,
      visibleAfterMs: 0,
    });

    useTaskProgressStore.getState().updateTask('other', { label: 'Ignored', progress: 0.75 });
    expect(useTaskProgressStore.getState().activeTask?.label).toBe('Exporting');
    expect(useTaskProgressStore.getState().activeTask?.progress).toBe(0.25);

    useTaskProgressStore.getState().updateTask('export', { label: 'Writing' });
    expect(useTaskProgressStore.getState().activeTask?.label).toBe('Writing');
    expect(useTaskProgressStore.getState().activeTask?.progress).toBe(0.25);

    useTaskProgressStore.getState().updateTask('export', { progress: -1 });
    expect(useTaskProgressStore.getState().activeTask?.progress).toBe(0);

    useTaskProgressStore.getState().updateTask('export', { progress: Number.NaN });
    expect(useTaskProgressStore.getState().activeTask?.progress).toBeNull();
  });

  it('ends only the matching active task', () => {
    useTaskProgressStore.getState().beginTask({
      id: 'build',
      label: 'Building',
      progress: null,
    });

    useTaskProgressStore.getState().endTask('other');
    expect(useTaskProgressStore.getState().activeTask?.id).toBe('build');

    useTaskProgressStore.getState().endTask('build');
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
  });
});

describe('playbackStore', () => {
  it('clamps current time to the current duration', () => {
    usePlaybackStore.getState().setDuration(10);

    usePlaybackStore.getState().setCurrentTime(4.5);
    expect(usePlaybackStore.getState().currentTime).toBe(4.5);

    usePlaybackStore.getState().setCurrentTime(-1);
    expect(usePlaybackStore.getState().currentTime).toBe(0);

    usePlaybackStore.getState().setCurrentTime(20);
    expect(usePlaybackStore.getState().currentTime).toBe(10);
  });

  it('updates play state, speed, and stop resets the clock', () => {
    usePlaybackStore.getState().play();
    expect(usePlaybackStore.getState().isPlaying).toBe(true);

    usePlaybackStore.getState().toggle();
    expect(usePlaybackStore.getState().isPlaying).toBe(false);

    usePlaybackStore.getState().toggle();
    usePlaybackStore.getState().setCurrentTime(8);
    usePlaybackStore.getState().setSpeed(4);
    expect(usePlaybackStore.getState()).toMatchObject({
      currentTime: 8,
      isPlaying: true,
      speed: 4,
    });

    usePlaybackStore.getState().pause();
    expect(usePlaybackStore.getState().isPlaying).toBe(false);

    usePlaybackStore.getState().play();
    usePlaybackStore.getState().stop();
    expect(usePlaybackStore.getState()).toMatchObject({
      currentTime: 0,
      isPlaying: false,
      speed: 4,
    });
  });

  it('coerces invalid playback numbers to safe values', () => {
    usePlaybackStore.getState().setSpeed(-1);
    expect(usePlaybackStore.getState().speed).toBe(1);

    usePlaybackStore.getState().setSpeed(Number.NaN);
    expect(usePlaybackStore.getState().speed).toBe(1);

    usePlaybackStore.getState().setDuration(Number.NaN);
    expect(usePlaybackStore.getState().duration).toBe(0.001);

    usePlaybackStore.getState().setCurrentTime(Number.NaN);
    expect(usePlaybackStore.getState().currentTime).toBe(0);
  });

  it('clamps duration on setDuration and reset restores the stopped clock', () => {
    usePlaybackStore.getState().setDuration(0);
    expect(usePlaybackStore.getState().duration).toBe(0.001);

    usePlaybackStore.getState().setDuration(10);
    usePlaybackStore.getState().setCurrentTime(8);
    usePlaybackStore.getState().setDuration(3);
    expect(usePlaybackStore.getState()).toMatchObject({
      currentTime: 3,
      duration: 3,
    });

    usePlaybackStore.getState().play();
    usePlaybackStore.getState().setSpeed(4);
    usePlaybackStore.getState().reset(-5);

    expect(usePlaybackStore.getState()).toMatchObject({
      currentTime: 0,
      duration: 0.001,
      isPlaying: false,
      speed: 4,
    });
  });
});
