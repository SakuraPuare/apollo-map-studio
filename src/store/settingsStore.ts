import { create } from 'zustand';

const HISTORY_LIMIT_KEY = 'apollo-map-studio:historyLimit';
const DEFAULT_HISTORY_LIMIT = 100;
const MIN_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 1000;

export function readHistoryLimit(): number {
  try {
    const raw = localStorage.getItem(HISTORY_LIMIT_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(n)));
    }
  } catch { /* SSR / 隐私模式 */ }
  return DEFAULT_HISTORY_LIMIT;
}

export interface SettingsState {
  historyLimit: number;
}

export interface SettingsActions {
  setHistoryLimit(value: number): void;
}

export { MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT };

export const useSettingsStore = create<SettingsState & SettingsActions>()((set) => ({
  historyLimit: readHistoryLimit(),
  setHistoryLimit(value) {
    const clamped = Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(value)));
    set({ historyLimit: clamped });
    try { localStorage.setItem(HISTORY_LIMIT_KEY, String(clamped)); } catch { /* ignore */ }
  },
}));
