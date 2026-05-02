/**
 * Shared license types — used by both main process and IPC bridge.
 *
 * Wire payload (after base64url-decoding the body of an activation code):
 *
 *   { v, lic, machine, issued, expires, features?, name?, nonce }
 *
 * The signed token format (printable activation code) is:
 *
 *   APMS1.<base64url(payload)>.<base64url(ed25519-signature)>
 *
 * Renderer never sees private state — only the resolved {status,...}.
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

export interface LicensePayload {
  /** Schema version. */
  v: 1;
  /** License id (unique per issuance). */
  lic: string;
  /** Machine code this license is bound to. */
  machine: string;
  /** Issuance time (epoch ms). */
  issued: number;
  /** Expiry time (epoch ms). 0 = perpetual (still allowed but flagged). */
  expires: number;
  /** Feature flags (reserved for future). */
  features?: string[];
  /** Customer/display name (optional, for UI). */
  name?: string;
  /** Random nonce so two identical licenses produce different tokens. */
  nonce: string;
}

export interface LicenseState {
  /** Resolved status. */
  status: LicenseStatus;
  /** Whether the app is currently editable. */
  canEdit: boolean;
  /** Stable machine code derived from this device. */
  machineCode: string;
  /** Trial start time (epoch ms). */
  trialStart: number;
  /** Trial end time (epoch ms). */
  trialEnd: number;
  /** Days remaining (trial or license). null = perpetual. */
  daysRemaining: number | null;
  /** Hours remaining for fine-grained countdown. null = perpetual. */
  hoursRemaining: number | null;
  /** Currently bound license (if activated). */
  license: {
    id: string;
    name: string;
    issued: number;
    expires: number;
  } | null;
  /** Last status check time (epoch ms). */
  checkedAt: number;
  /** Human-readable reason for the current status. */
  reason: string;
}

export interface ActivationResult {
  ok: boolean;
  /** Updated state after the activation attempt. */
  state: LicenseState;
  /** Failure reason code (when ok === false). */
  errorCode?:
    | 'invalid_format'
    | 'invalid_signature'
    | 'machine_mismatch'
    | 'expired'
    | 'replay'
    | 'storage_error'
    | 'unknown';
  /** Friendly error message. */
  errorMessage?: string;
}
