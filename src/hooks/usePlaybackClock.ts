import { useEffect } from 'react';
import { usePlaybackStore } from '@/store/playbackStore';

/**
 * 播放时钟驱动：isPlaying 时用 requestAnimationFrame 按 speed 推进 currentTime，
 * 到达 duration 末尾自动暂停。挂一次即可（建议在 WorkspaceLayout 顶层），
 * 与具体面板解耦——TimelinePanel 卸载时播放也不中断。
 */
export function usePlaybackClock(): void {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return undefined;

    let raf = 0;
    let last = performance.now();

    const tick = (nowMs: number) => {
      const dt = (nowMs - last) / 1000;
      last = nowMs;
      const { currentTime, duration, speed, setCurrentTime, pause } = usePlaybackStore.getState();
      const next = currentTime + dt * speed;
      if (next >= duration) {
        setCurrentTime(duration);
        pause();
        return;
      }
      setCurrentTime(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);
}
