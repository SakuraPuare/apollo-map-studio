import { create } from 'zustand';

interface TaskProgress {
  id: string;
  label: string;
  detail?: string;
  progress: number | null;
  startedAt: number;
  visibleAfterMs: number;
}

interface TaskProgressState {
  activeTask: TaskProgress | null;
}

interface TaskProgressActions {
  beginTask(task: {
    id: string;
    label: string;
    detail?: string;
    progress?: number | null;
    visibleAfterMs?: number;
  }): void;
  updateTask(id: string, patch: Partial<Pick<TaskProgress, 'label' | 'detail' | 'progress'>>): void;
  endTask(id: string): void;
}

export const useTaskProgressStore = create<TaskProgressState & TaskProgressActions>((set, get) => ({
  activeTask: null,

  beginTask(task) {
    set({
      activeTask: {
        id: task.id,
        label: task.label,
        detail: task.detail,
        progress: clampProgress(task.progress ?? null),
        startedAt: Date.now(),
        visibleAfterMs: task.visibleAfterMs ?? 1000,
      },
    });
  },

  updateTask(id, patch) {
    const active = get().activeTask;
    if (!active || active.id !== id) return;
    set({
      activeTask: {
        ...active,
        ...patch,
        progress: patch.progress === undefined ? active.progress : clampProgress(patch.progress),
      },
    });
  },

  endTask(id) {
    const active = get().activeTask;
    if (active?.id === id) set({ activeTask: null });
  },
}));

function clampProgress(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}
