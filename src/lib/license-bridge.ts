/**
 * Renderer-side license bridge. Wraps `window.apolloMapStudioLicense`
 * (exposed via contextBridge in `electron/preload.cts`) so the rest of
 * the renderer never has to deal with the global / undefined cases.
 *
 * In a pure web build (no Electron), all calls fall back to a perpetual
 * "trial" state with `canEdit=true` so dev / Storybook / browser preview
 * keeps working.
 */

export type LicenseStatus =
  | 'trial'
  | 'activated'
  | 'expired_trial'
  | 'expired_license'
  | 'tampered'
  | 'machine_mismatch'
  | 'invalid'
  | 'not_started';

export interface LicenseState {
  status: LicenseStatus;
  canEdit: boolean;
  machineCode: string;
  trialStart: number;
  trialEnd: number;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  license: { id: string; name: string; issued: number; expires: number } | null;
  checkedAt: number;
  reason: string;
}

export interface ActivationResult {
  ok: boolean;
  state: LicenseState;
  errorCode?:
    | 'invalid_format'
    | 'invalid_signature'
    | 'machine_mismatch'
    | 'expired'
    | 'replay'
    | 'storage_error'
    | 'unknown';
  errorMessage?: string;
}

interface LicenseApi {
  getState(): Promise<LicenseState>;
  getMachineCode(): Promise<string>;
  activate(code: string): Promise<ActivationResult>;
  deactivate(): Promise<LicenseState>;
  onChange(handler: (s: LicenseState) => void): () => void;
}

declare global {
  interface Window {
    apolloMapStudioLicense?: LicenseApi;
  }
}

function fallbackState(): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'WEB-NO-LICENSE',
    trialStart: Date.now(),
    trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
    daysRemaining: 7,
    hoursRemaining: 7 * 24,
    license: null,
    checkedAt: Date.now(),
    reason: 'Browser preview — licensing disabled.',
  };
}

export const licenseBridge: LicenseApi = {
  async getState() {
    return window.apolloMapStudioLicense?.getState() ?? Promise.resolve(fallbackState());
  },
  async getMachineCode() {
    return window.apolloMapStudioLicense?.getMachineCode() ?? Promise.resolve('WEB-NO-LICENSE');
  },
  async activate(code: string) {
    if (!window.apolloMapStudioLicense) {
      return {
        ok: false,
        state: fallbackState(),
        errorCode: 'unknown',
        errorMessage: 'Activation is only available in the desktop build.',
      };
    }
    return window.apolloMapStudioLicense.activate(code);
  },
  async deactivate() {
    return window.apolloMapStudioLicense?.deactivate() ?? Promise.resolve(fallbackState());
  },
  onChange(handler) {
    return window.apolloMapStudioLicense?.onChange(handler) ?? (() => undefined);
  },
};

export function isDesktopBuild(): boolean {
  return typeof window !== 'undefined' && Boolean(window.apolloMapStudioLicense);
}
