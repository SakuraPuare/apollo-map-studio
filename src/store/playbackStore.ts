import { create } from 'zustand';

/**
 * 场景动态播放时钟（与 [[scenarioStore]] 解耦的全局播放状态）。
 *
 * 单独建 store 而非塞进 scenarioStore，是为了：
 *   1. 播放每帧推进 currentTime（~60fps），若混进 zundo temporal 会污染撤销栈；
 *   2. 渲染层（useScenarioLayer）与时间轴面板（TimelinePanel）都需订阅同一个时钟。
 *
 * currentTime 单位秒；duration 由激活场景的 scenarioDuration() 算出后写入。
 */
interface PlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** 播放倍速（0.25 / 0.5 / 1 / 2 / 4）。 */
  speed: number;
}

interface PlaybackActions {
  setCurrentTime(t: number): void;
  setDuration(d: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  stop(): void;
  setSpeed(s: number): void;
  /** 切换场景时重置时钟。 */
  reset(duration: number): void;
}

export type PlaybackStore = PlaybackState & PlaybackActions;

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

function coercePlaybackSpeed(speed: number): number {
  return PLAYBACK_SPEEDS.includes(speed as (typeof PLAYBACK_SPEEDS)[number]) ? speed : 1;
}

export const usePlaybackStore = create<PlaybackStore>((set) => ({
  currentTime: 0,
  duration: 30,
  isPlaying: false,
  speed: 1,
  setCurrentTime: (t) =>
    set((s) => ({ currentTime: Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), s.duration) })),
  setDuration: (d) =>
    set((s) => {
      const duration = Math.max(Number.isFinite(d) ? d : 0.001, 0.001);
      return { duration, currentTime: Math.min(s.currentTime, duration) };
    }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  setSpeed: (speed) => set({ speed: coercePlaybackSpeed(speed) }),
  reset: (duration) =>
    set({
      duration: Math.max(Number.isFinite(duration) ? duration : 0.001, 0.001),
      currentTime: 0,
      isPlaying: false,
    }),
}));
