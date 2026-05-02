/**
 * Renderer-side license store. Single source of truth used by the banner,
 * the activation dialog, and the read-only enforcement guards.
 *
 * The store mirrors the main process state via `licenseBridge.onChange`,
 * and falls back to a permissive "trial" state outside Electron so a
 * browser preview build still functions.
 */

import { create } from 'zustand';
import { licenseBridge, type LicenseState } from '@/lib/license-bridge';

interface LicenseStoreState {
  state: LicenseState;
  initialized: boolean;
  hydrate(): Promise<void>;
  setState(s: LicenseState): void;
  /** Convenience action: open the activation dialog. Set elsewhere. */
  promptActivation: () => void;
  registerPromptActivation(fn: () => void): void;
}

const initial: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};

export const useLicenseStore = create<LicenseStoreState>((set, get) => ({
  state: initial,
  initialized: false,
  async hydrate() {
    const next = await licenseBridge.getState();
    set({ state: next, initialized: true });
  },
  setState(s) {
    set({ state: s, initialized: true });
  },
  promptActivation: () => {
    // Default no-op; replaced via registerPromptActivation when the
    // dialog component mounts.
  },
  registerPromptActivation(fn) {
    set({ promptActivation: fn });
    void get; // suppress unused
  },
}));

/** Read-only selector: is editing currently allowed? */
export function selectCanEdit(s: LicenseStoreState): boolean {
  return s.state.canEdit;
}

/** Read-only selector: license status string. */
export function selectStatus(s: LicenseStoreState): LicenseState['status'] {
  return s.state.status;
}
