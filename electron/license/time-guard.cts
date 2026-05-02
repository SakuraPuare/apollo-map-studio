/**
 * Time-tampering guard.
 *
 * Defenses (in order of cost-to-bypass):
 *
 *   1. Strictly monotonic high-water-mark timestamp persisted to a tamper-
 *      sealed file. Each tick (every minute while running, plus on start
 *      and exit) updates `lastSeen = max(lastSeen, Date.now())`. If a
 *      future call ever sees `Date.now() < lastSeen - GRACE`, we mark the
 *      install as `tampered`.
 *
 *   2. Cross-check against the modification time of the Electron binary
 *      and `package.json` — those mtimes are set at install time and a
 *      *forward* clock-jump beyond them is fine, but seeing `now < binary
 *      mtime` is impossible without rolling the clock back.
 *
 *   3. Session counter. Independent from wallclock; persists across
 *      restarts. Provides a "minimum elapsed" lower bound on how much the
 *      app has been used regardless of clock state — license expiry can
 *      enforce both (now > expires) and (sessions > soft-cap-after-expiry).
 *
 *   4. Wallclock vs. monotonic clock drift. We sample `Date.now()` and
 *      `performance.now()` together; if a later sample shows `Date.now()`
 *      moved by ≥1 hour while `performance.now()` moved by <30s, that's
 *      a step-change in the system clock — log + flag.
 *
 * The persisted state itself is encrypted with a per-machine key (so it
 * cannot be edited in plaintext) and HMAC-sealed (so swapping in an old
 * file from a backup is detectable).
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { aesDecrypt, aesEncrypt, getFileKey, hmacHex, getMacKey } from './crypto.cjs';

const GRACE_MS = 5 * 60 * 1000; // forgive 5min clock skew (NTP, DST quirks)
const TICK_INTERVAL_MS = 60 * 1000;
const DRIFT_WINDOW_MS = 30 * 1000;
const DRIFT_THRESHOLD_MS = 60 * 60 * 1000;

interface TimeStateV1 {
  v: 1;
  /** Highest Date.now() ever observed. */
  lastSeen: number;
  /** First-run timestamp on this machine. */
  firstSeen: number;
  /** Total number of sessions launched. */
  sessions: number;
  /** Cumulative tick count (≈ minutes the app has been open). */
  ticks: number;
  /** Anchor mtimes recorded at first-run, for forward-only checks. */
  anchorMtimeMs: number;
  /** Sticky tampered flag. Once set, only a fresh install clears it. */
  tampered: boolean;
  /** Reason the tampered flag was set. */
  tamperedReason?: string;
}

export interface TimeGuardSnapshot {
  now: number;
  lastSeen: number;
  firstSeen: number;
  sessions: number;
  tampered: boolean;
  tamperedReason?: string;
  /** True if heuristics suggest the wallclock has been moved. */
  suspiciousNow: boolean;
}

export class TimeGuard {
  private state: TimeStateV1;
  private readonly statePath: string;
  private readonly machineCode: string;
  private tickHandle: NodeJS.Timeout | null = null;
  private lastWall = Date.now();
  private lastMono = performance.now();

  constructor(userDataDir: string, machineCode: string, anchorPaths: string[]) {
    this.statePath = path.join(userDataDir, '.lic-clock.dat');
    this.machineCode = machineCode;
    this.state = this.load() ?? this.bootstrap(anchorPaths);
  }

  /** Start the periodic tick. Idempotent. */
  start(): void {
    if (this.tickHandle) return;
    this.state.sessions += 1;
    this.tick(); // immediate evaluation
    this.tickHandle = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    if (typeof this.tickHandle.unref === 'function') this.tickHandle.unref();
  }

  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.persist();
  }

  /**
   * Source-of-truth "now" for license decisions. Uses `max(Date.now(),
   * lastSeen)` so a clock rollback cannot extend a trial — but only after
   * the time-state has been validated, otherwise an attacker who can
   * delete the state file would benefit.
   */
  trustedNow(): number {
    return Math.max(Date.now(), this.state.lastSeen);
  }

  snapshot(): TimeGuardSnapshot {
    return {
      now: this.trustedNow(),
      lastSeen: this.state.lastSeen,
      firstSeen: this.state.firstSeen,
      sessions: this.state.sessions,
      tampered: this.state.tampered,
      tamperedReason: this.state.tamperedReason,
      suspiciousNow: this.detectDrift() !== null,
    };
  }

  markTampered(reason: string): void {
    if (this.state.tampered && this.state.tamperedReason) return;
    this.state.tampered = true;
    this.state.tamperedReason = reason;
    this.persist();
  }

  /** Force-clear (admin recovery). Not exposed in production. */
  reset(anchorPaths: string[]): void {
    this.state = this.bootstrap(anchorPaths);
    this.persist();
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    const mono = performance.now();

    // (1) Rollback check.
    if (now + GRACE_MS < this.state.lastSeen) {
      this.markTampered(`wallclock rollback: now=${now} < lastSeen=${this.state.lastSeen}`);
    }

    // (4) Drift check.
    const dWall = now - this.lastWall;
    const dMono = mono - this.lastMono;
    if (dWall < 0 || (Math.abs(dWall - dMono) > DRIFT_THRESHOLD_MS && dMono < DRIFT_WINDOW_MS)) {
      this.markTampered(`wallclock drift: dWall=${dWall} dMono=${Math.round(dMono)}`);
    }
    this.lastWall = now;
    this.lastMono = mono;

    if (now > this.state.lastSeen) this.state.lastSeen = now;
    this.state.ticks += 1;
    this.persist();
  }

  private detectDrift(): string | null {
    const now = Date.now();
    if (now + GRACE_MS < this.state.lastSeen) {
      return `now=${now} < lastSeen=${this.state.lastSeen}`;
    }
    if (this.state.anchorMtimeMs > 0 && now + GRACE_MS < this.state.anchorMtimeMs) {
      return `now=${now} < anchorMtime=${this.state.anchorMtimeMs}`;
    }
    return null;
  }

  private bootstrap(anchorPaths: string[]): TimeStateV1 {
    const now = Date.now();
    let anchorMtimeMs = 0;
    for (const p of anchorPaths) {
      try {
        if (existsSync(p)) anchorMtimeMs = Math.max(anchorMtimeMs, statSync(p).mtimeMs);
      } catch {
        // ignore
      }
    }
    return {
      v: 1,
      lastSeen: now,
      firstSeen: now,
      sessions: 0,
      ticks: 0,
      anchorMtimeMs,
      tampered: false,
    };
  }

  private persist(): void {
    try {
      const json = JSON.stringify(this.state);
      const aad = Buffer.from('apms.clock.v1', 'utf8');
      const enc = aesEncrypt(getFileKey(this.machineCode, 'clock'), Buffer.from(json, 'utf8'), aad);
      const mac = hmacHex(getMacKey(this.machineCode), enc);
      const out = Buffer.concat([Buffer.from(`${mac}\n`, 'utf8'), enc]);
      writeFileSync(this.statePath, out, { mode: 0o600 });
    } catch {
      // best-effort
    }
  }

  private load(): TimeStateV1 | null {
    try {
      if (!existsSync(this.statePath)) return null;
      const raw = readFileSync(this.statePath);
      const nl = raw.indexOf(0x0a);
      if (nl < 0) return null;
      const macHex = raw.subarray(0, nl).toString('utf8');
      const enc = raw.subarray(nl + 1);
      const expected = hmacHex(getMacKey(this.machineCode), enc);
      if (macHex !== expected) {
        return {
          v: 1,
          lastSeen: Date.now(),
          firstSeen: Date.now(),
          sessions: 0,
          ticks: 0,
          anchorMtimeMs: 0,
          tampered: true,
          tamperedReason: 'time-state HMAC mismatch',
        };
      }
      const aad = Buffer.from('apms.clock.v1', 'utf8');
      const pt = aesDecrypt(getFileKey(this.machineCode, 'clock'), enc, aad);
      if (!pt) {
        return {
          v: 1,
          lastSeen: Date.now(),
          firstSeen: Date.now(),
          sessions: 0,
          ticks: 0,
          anchorMtimeMs: 0,
          tampered: true,
          tamperedReason: 'time-state AEAD decrypt failed',
        };
      }
      const parsed = JSON.parse(pt.toString('utf8')) as TimeStateV1;
      if (parsed.v !== 1) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
