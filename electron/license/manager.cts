/**
 * License manager — single source of truth for {trial, activated, expired,
 * tampered} status. Owns: machine fingerprint, time guard, encrypted
 * storage, signature verification, IPC surface.
 *
 * Renderer never sees the raw token or private state — it gets a sanitised
 * `LicenseState` and is told whether `canEdit` is currently true.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { app, BrowserWindow, ipcMain } from 'electron';

import {
  computeMachineCode,
  readPersistedMachineHint,
  type MachineCodeResult,
} from './machine-id.cjs';
import { TimeGuard } from './time-guard.cjs';
import { LicenseStorage } from './storage.cjs';
import { parseToken, verifyToken, safeEqual } from './crypto.cjs';
import { isLicenseExpiryDowngrade } from './replay-policy.cjs';
import type { ActivationResult, LicensePayload, LicenseState, LicenseStatus } from './types.cjs';

const TRIAL_DAYS = 7;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const STATUS_BROADCAST_CHANNEL = 'license:state';

export const LICENSE_IPC = {
  GET_STATE: 'license:get-state',
  GET_MACHINE_CODE: 'license:get-machine-code',
  ACTIVATE: 'license:activate',
  DEACTIVATE: 'license:deactivate',
} as const;

export class LicenseManager {
  private readonly userDataDir: string;
  private readonly machine: MachineCodeResult;
  private readonly timeGuard: TimeGuard;
  private readonly storage: LicenseStorage;
  private cachedState: LicenseState;
  private rebroadcastTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.userDataDir = app.getPath('userData');
    this.machine = computeMachineCode(this.userDataDir);

    const anchorPaths = [
      app.getAppPath(),
      path.join(app.getAppPath(), 'package.json'),
      process.execPath,
    ].filter((p) => {
      try {
        return existsSync(p);
      } catch {
        return false;
      }
    });

    this.timeGuard = new TimeGuard(this.userDataDir, this.machine.code, anchorPaths);
    this.storage = new LicenseStorage(this.userDataDir, this.machine.code);
    this.cachedState = this.computeState();
  }

  /** Wire IPC + start the time guard. Call once after app.whenReady. */
  start(): void {
    this.timeGuard.start();
    this.cachedState = this.computeState();

    // Re-evaluate every minute so the banner countdown ticks down without
    // the renderer hammering get-state.
    this.rebroadcastTimer = setInterval(() => this.refresh(), 60 * 1000);
    if (typeof this.rebroadcastTimer.unref === 'function') this.rebroadcastTimer.unref();

    ipcMain.handle(LICENSE_IPC.GET_STATE, () => this.refresh());
    ipcMain.handle(LICENSE_IPC.GET_MACHINE_CODE, () => this.machine.code);
    ipcMain.handle(LICENSE_IPC.ACTIVATE, (_e, code: unknown) => this.activate(code));
    ipcMain.handle(LICENSE_IPC.DEACTIVATE, () => this.deactivate());
  }

  stop(): void {
    if (this.rebroadcastTimer) {
      clearInterval(this.rebroadcastTimer);
      this.rebroadcastTimer = null;
    }
    this.timeGuard.stop();
  }

  getState(): LicenseState {
    return this.cachedState;
  }

  getMachineCode(): string {
    return this.machine.code;
  }

  // ─── Activation flow ──────────────────────────────────────────────────

  private activate(code: unknown): ActivationResult {
    if (typeof code !== 'string' || code.length === 0 || code.length > 4096) {
      return this.failedActivation('invalid_format', 'Activation code is empty or too long.');
    }
    const parsed = parseToken(code);
    if (!parsed) {
      return this.failedActivation('invalid_format', 'Activation code is malformed.');
    }
    if (!verifyToken(parsed)) {
      return this.failedActivation('invalid_signature', 'Signature does not match.');
    }
    const payload = parsed.payload;
    if (!safeEqual(payload.machine, this.machine.code)) {
      return this.failedActivation(
        'machine_mismatch',
        'This activation code is bound to a different machine.',
      );
    }
    const now = this.timeGuard.trustedNow();
    if (payload.expires > 0 && now > payload.expires) {
      return this.failedActivation('expired', 'This activation code has already expired.');
    }
    // Replay protection: if the same lic id is already stored *and* its
    // payload differs (e.g. attacker fed back an older shorter expiry),
    // refuse the downgrade. We accept upgrades (longer expiry) silently.
    const existing = this.storage.load();
    if (existing && !existing.tampered && existing.payload.lic === payload.lic) {
      if (isLicenseExpiryDowngrade(existing.payload.expires, payload.expires)) {
        return this.failedActivation('replay', 'A newer license is already installed.');
      }
    }
    const cleanToken = code.trim().replace(/\s+/g, '');
    try {
      this.storage.save(cleanToken, payload);
    } catch {
      return this.failedActivation(
        'storage_error',
        'Could not persist license. Disk full or read-only?',
      );
    }
    this.cachedState = this.computeState();
    this.broadcast();
    return { ok: true, state: this.cachedState };
  }

  private deactivate(): LicenseState {
    this.storage.clear();
    this.cachedState = this.computeState();
    this.broadcast();
    return this.cachedState;
  }

  // ─── State computation ────────────────────────────────────────────────

  private refresh(): LicenseState {
    const next = this.computeState();
    const changed = JSON.stringify(next) !== JSON.stringify(this.cachedState);
    this.cachedState = next;
    if (changed) this.broadcast();
    return this.cachedState;
  }

  private computeState(): LicenseState {
    const now = this.timeGuard.trustedNow();
    const checkedAt = now;
    const tg = this.timeGuard.snapshot();

    // Detect mid-flight machine code drift.
    const persistedHint = readPersistedMachineHint(this.userDataDir);
    const machineDrift =
      persistedHint.tampered ||
      (persistedHint.code !== null && persistedHint.code !== this.machine.code);

    if (tg.tampered || machineDrift) {
      return {
        status: 'tampered',
        canEdit: false,
        machineCode: this.machine.code,
        trialStart: tg.firstSeen,
        trialEnd: tg.firstSeen + TRIAL_MS,
        daysRemaining: 0,
        hoursRemaining: 0,
        license: null,
        checkedAt,
        reason: persistedHint.tampered
          ? (persistedHint.tamperedReason ?? 'Machine fingerprint hint was tampered with.')
          : machineDrift
            ? 'Machine fingerprint changed since first run.'
            : (tg.tamperedReason ?? 'System clock or license state was tampered with.'),
      };
    }

    const stored = this.storage.load();
    if (stored) {
      if (stored.tampered) {
        return {
          status: 'tampered',
          canEdit: false,
          machineCode: this.machine.code,
          trialStart: tg.firstSeen,
          trialEnd: tg.firstSeen + TRIAL_MS,
          daysRemaining: 0,
          hoursRemaining: 0,
          license: null,
          checkedAt,
          reason: stored.tamperedReason ?? 'License storage tampered.',
        };
      }
      // Re-verify signature on every load — defense against an attacker
      // swapping in a forged but-correctly-formatted license.
      const parsed = parseToken(stored.token);
      if (!parsed || !verifyToken(parsed)) {
        return {
          status: 'invalid',
          canEdit: false,
          machineCode: this.machine.code,
          trialStart: tg.firstSeen,
          trialEnd: tg.firstSeen + TRIAL_MS,
          daysRemaining: 0,
          hoursRemaining: 0,
          license: null,
          checkedAt,
          reason: 'License signature failed verification.',
        };
      }
      if (!safeEqual(parsed.payload.machine, this.machine.code)) {
        return {
          status: 'machine_mismatch',
          canEdit: false,
          machineCode: this.machine.code,
          trialStart: tg.firstSeen,
          trialEnd: tg.firstSeen + TRIAL_MS,
          daysRemaining: 0,
          hoursRemaining: 0,
          license: { ...summariseLicense(parsed.payload) },
          checkedAt,
          reason: 'License is bound to a different machine.',
        };
      }
      const expires = parsed.payload.expires;
      const expired = expires > 0 && now > expires;
      const ms = Math.max(0, expires - now);
      return {
        status: expired ? 'expired_license' : 'activated',
        canEdit: !expired,
        machineCode: this.machine.code,
        trialStart: tg.firstSeen,
        trialEnd: tg.firstSeen + TRIAL_MS,
        daysRemaining: expires === 0 ? null : Math.ceil(ms / (24 * 60 * 60 * 1000)),
        hoursRemaining: expires === 0 ? null : Math.ceil(ms / (60 * 60 * 1000)),
        license: summariseLicense(parsed.payload),
        checkedAt,
        reason: expired
          ? 'License expired — renew to keep editing.'
          : `Activated for ${parsed.payload.name ?? 'this machine'}.`,
      };
    }

    // Trial path.
    const trialStart = tg.firstSeen;
    const trialEnd = trialStart + TRIAL_MS;
    if (now < trialStart) {
      return {
        status: 'not_started',
        canEdit: false,
        machineCode: this.machine.code,
        trialStart,
        trialEnd,
        daysRemaining: TRIAL_DAYS,
        hoursRemaining: TRIAL_DAYS * 24,
        license: null,
        checkedAt,
        reason: 'Trial start time is in the future — clock?',
      };
    }
    if (now >= trialEnd) {
      return {
        status: 'expired_trial',
        canEdit: false,
        machineCode: this.machine.code,
        trialStart,
        trialEnd,
        daysRemaining: 0,
        hoursRemaining: 0,
        license: null,
        checkedAt,
        reason: 'Trial has ended. Enter an activation code to continue editing.',
      };
    }
    const ms = trialEnd - now;
    return {
      status: 'trial',
      canEdit: true,
      machineCode: this.machine.code,
      trialStart,
      trialEnd,
      daysRemaining: Math.ceil(ms / (24 * 60 * 60 * 1000)),
      hoursRemaining: Math.ceil(ms / (60 * 60 * 1000)),
      license: null,
      checkedAt,
      reason: 'Free trial — limited time, full editing.',
    };
  }

  private broadcast(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(STATUS_BROADCAST_CHANNEL, this.cachedState);
      }
    }
  }

  private failedActivation(
    code: NonNullable<ActivationResult['errorCode']>,
    message: string,
  ): ActivationResult {
    return {
      ok: false,
      state: this.cachedState,
      errorCode: code,
      errorMessage: message,
    };
  }
}

function summariseLicense(p: LicensePayload): NonNullable<LicenseState['license']> {
  return {
    id: p.lic,
    name: p.name ?? '',
    issued: p.issued,
    expires: p.expires,
  };
}

// Re-exports for the IPC bridge in preload.
export type { LicenseState, ActivationResult, LicenseStatus };
export { STATUS_BROADCAST_CHANNEL };
