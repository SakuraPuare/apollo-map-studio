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

type LicenseStateSource = 'hydrate' | 'push';

interface LicenseStoreState {
  state: LicenseState;
  initialized: boolean;
  sequence: number;
  hydrate(): Promise<void>;
  setState(s: LicenseState): void;
  /** Convenience action: open the activation dialog. Set elsewhere. */
  promptActivation: () => void;
  registerPromptActivation(fn: () => void): void;
}

const initial: LicenseState = {
  status: 'not_started',
  canEdit: false,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 0,
  hoursRemaining: 0,
  license: null,
  checkedAt: 0,
  reason: 'License state is loading.',
};

export const useLicenseStore = create<LicenseStoreState>((set, get) => {
  const setLicenseState = (state: LicenseState, source: LicenseStateSource) => {
    set((current) => ({
      state,
      initialized: true,
      sequence: source === 'push' ? current.sequence + 1 : current.sequence,
    }));
  };

  return {
    state: initial,
    initialized: false,
    sequence: 0,
    async hydrate() {
      const sequence = get().sequence + 1;
      set({ sequence });
      try {
        const next = await licenseBridge.getState();
        if (get().sequence === sequence) {
          setLicenseState(next, 'hydrate');
        }
      } catch (error) {
        if (get().sequence === sequence) {
          setLicenseState(
            {
              ...initial,
              checkedAt: Date.now(),
              reason: error instanceof Error ? error.message : 'Failed to read license state.',
            },
            'hydrate',
          );
        }
      }
    },
    setState(s) {
      setLicenseState(s, 'push');
    },
    promptActivation: () => {
      // Default no-op; replaced via registerPromptActivation when the
      // dialog component mounts.
    },
    registerPromptActivation(fn) {
      set({ promptActivation: fn });
    },
  };
});
