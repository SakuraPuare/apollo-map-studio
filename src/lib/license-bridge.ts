/**
 * Renderer-side license bridge. Wraps `window.apolloMapStudioLicense`
 * (exposed via contextBridge in `electron/preload.cts`) so the rest of
 * the renderer never has to deal with the global / undefined cases.
 *
 * In a pure web build (no Electron), calls are handled by a browser-local
 * trial / activation provider so Web and Electron share the same renderer UI.
 */

import { webLicenseProvider } from './web-license-provider';

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

export const licenseBridge: LicenseApi = {
  async getState() {
    return window.apolloMapStudioLicense?.getState() ?? webLicenseProvider.getState();
  },
  async getMachineCode() {
    return window.apolloMapStudioLicense?.getMachineCode() ?? webLicenseProvider.getMachineCode();
  },
  async activate(code: string) {
    return window.apolloMapStudioLicense?.activate(code) ?? webLicenseProvider.activate(code);
  },
  async deactivate() {
    return window.apolloMapStudioLicense?.deactivate() ?? webLicenseProvider.deactivate();
  },
  onChange(handler) {
    return window.apolloMapStudioLicense?.onChange(handler) ?? webLicenseProvider.onChange(handler);
  },
};

export function isDesktopBuild(): boolean {
  return typeof window !== 'undefined' && Boolean(window.apolloMapStudioLicense);
}
