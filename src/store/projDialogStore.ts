import { create } from 'zustand';

/**
 * Promise-based dialog for picking a PROJ.4 string at import time.
 *
 * Flow:
 *   1. mapIO.ts detects header has no projection → calls `requestProjString()`
 *      which sets `pending = true` and stores the resolver.
 *   2. WorkspaceLayout renders <ProjPickerDialog /> which reads `pending` and
 *      opens itself.
 *   3. User picks a preset / enters a custom string and clicks OK → component
 *      calls `resolve(projString)`. Cancel → `resolve(null)`.
 *   4. The Promise from step 1 settles, mapIO continues with the chosen string.
 */
interface ProjDialogState {
  pending: boolean;
  resolver: ((value: string | null) => void) | null;
}

interface ProjDialogActions {
  request(): Promise<string | null>;
  resolve(value: string | null): void;
}

export const useProjDialogStore = create<ProjDialogState & ProjDialogActions>((set, get) => ({
  pending: false,
  resolver: null,

  request() {
    // If a request is already in flight, reject it so we don't have stacked dialogs.
    const prev = get().resolver;
    if (prev) prev(null);
    return new Promise<string | null>((resolve) => {
      set({ pending: true, resolver: resolve });
    });
  },

  resolve(value) {
    const { resolver } = get();
    if (resolver) resolver(value);
    set({ pending: false, resolver: null });
  },
}));
