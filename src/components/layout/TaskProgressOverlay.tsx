import { useEffect, useState } from 'react';
import { useTaskProgressStore } from '@/store/taskProgressStore';

export function TaskProgressOverlay() {
  const activeTask = useTaskProgressStore((s) => s.activeTask);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeTask) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [activeTask]);

  if (!activeTask) return null;

  const elapsedMs = now - activeTask.startedAt;
  if (elapsedMs < activeTask.visibleAfterMs) return null;

  const pct =
    activeTask.progress === null ? null : Math.round(Math.min(1, activeTask.progress) * 100);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45">
      <div className="w-[min(420px,calc(100vw-32px))] rounded-md border border-white/10 bg-zinc-950/95 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-100">{activeTask.label}</div>
            {activeTask.detail && (
              <div className="mt-1 truncate text-xs text-zinc-500">{activeTask.detail}</div>
            )}
          </div>
          {pct !== null && <div className="font-mono text-xs text-cyan-300">{pct}%</div>}
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded bg-zinc-800">
          {pct === null ? (
            <div className="h-full w-1/3 animate-[ams-indeterminate_1.1s_ease-in-out_infinite] rounded bg-cyan-400" />
          ) : (
            <div
              className="h-full rounded bg-cyan-400 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
